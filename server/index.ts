import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { Redis } from "@upstash/redis";
import { errors as UpstashErrors } from "@upstash/redis";

// ---------------------------------------------------------------------------
// Redis client
// ---------------------------------------------------------------------------
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  enableAutoPipelining: true,
  retry: {
    retries: 5,
    backoff: (retryCount: number) => Math.exp(retryCount) * 50,
  },
});

const P = "erp"; // key namespace
const SESSION_TTL = 60 * 60 * 24; // 24h

// ---------------------------------------------------------------------------
// Collection registry (id date field used for the sorted-set date index)
// ---------------------------------------------------------------------------
export const COLLECTIONS: Record<string, { dateField: string; writableRoles: string[] }> = {
  users: { dateField: "createdAt", writableRoles: ["Admin"] },
  suppliers: { dateField: "createdAt", writableRoles: ["Admin", "Manager"] },
  yarn_inventory: { dateField: "purchaseDate", writableRoles: ["Admin", "Manager"] },
  factories: { dateField: "createdAt", writableRoles: ["Admin", "Manager"] },
  production_lots: { dateField: "dateSent", writableRoles: ["Admin", "Manager"] },
  finished_fabrics: { dateField: "createdAt", writableRoles: ["Admin", "Manager"] },
  customers: { dateField: "createdAt", writableRoles: ["Admin", "Manager"] },
  retail_sales: { dateField: "date", writableRoles: ["Admin", "Manager", "ShopStaff"] },
  wholesale_invoices: { dateField: "date", writableRoles: ["Admin", "Manager"] },
  ledgers: { dateField: "date", writableRoles: ["Admin", "Manager"] },
  stores: { dateField: "createdAt", writableRoles: ["Admin", "Manager"] },
};

type Role = "Admin" | "Manager" | "ShopStaff";

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------
const docKey = (col: string, id: string) => `${P}:${col}:${id}`;
const idxKey = (col: string) => `${P}:idx:${col}`;
const zKey = (col: string) => `${P}:z:${col}`;
const seqKey = (col: string) => `${P}:seq:${col}`;
const emailKey = (email: string) => `${P}:user:email:${email.toLowerCase()}`;
const sessionKey = (token: string) => `${P}:session:${token}`;
const userSessionsKey = (userId: string) => `${P}:user:${userId}:sessions`;
const lockKey = (name: string) => `${P}:lock:${name}`;

// ---------------------------------------------------------------------------
// Low-level data helpers
// ---------------------------------------------------------------------------
async function getDoc<T>(col: string, id: string): Promise<T | null> {
  return (await redis.get<T>(docKey(col, id))) ?? null;
}

async function setDoc<T extends object>(col: string, id: string, data: T) {
  await redis.set(docKey(col, id), data as object);
  await redis.sadd(idxKey(col), id);
}

async function updateDoc(col: string, id: string, patch: object) {
  const existing = await getDoc<Record<string, unknown>>(col, id);
  if (!existing) throw new ApiError(404, "Document not found");
  await redis.set(docKey(col, id), { ...existing, ...(patch as object) });
}

async function deleteDoc(col: string, id: string) {
  await redis.del(docKey(col, id));
  await redis.srem(idxKey(col), id);
  await redis.zrem(zKey(col), id);
}

async function nextSeq(col: string): Promise<number> {
  return redis.incr(seqKey(col));
}

async function indexByDate(col: string, id: string, dateMs: number) {
  await redis.zadd(zKey(col), { score: dateMs, member: id });
}

async function nextId(col: string): Promise<string> {
  const n = await nextSeq(col);
  return `${col.slice(0, 2)}_${Date.now().toString(36)}${n.toString(36)}`;
}

/** List docs ordered by the collection date field (newest first). */
async function listDocs<T>(col: string, opts: { limit?: number; offset?: number } = {}): Promise<T[]> {
  const ids = await redis.zrange<string[]>(zKey(col), 0, -1, { rev: true });
  const docs = await batchGet<T>(col, ids);
  return docs.slice(opts.offset ?? 0, (opts.offset ?? 0) + (opts.limit ?? 1000));
}

/** Like listDocs but keeps a stable ascending order by score. */
async function listDocsAsc<T>(col: string): Promise<T[]> {
  const ids = await redis.zrange<string[]>(zKey(col), 0, -1);
  return batchGet<T>(col, ids);
}

async function batchGet<T>(col: string, ids: string[]): Promise<T[]> {
  if (ids.length === 0) return [];
  const docs = await redis.mget<unknown[]>(...ids.map((id) => docKey(col, id)));
  return docs
    .map((d, i) => (d ? ({ id: ids[i], ...(d as object) } as T) : null))
    .filter((d): d is T => d !== null);
}

// ---------------------------------------------------------------------------
// Distributed lock (SET NX + tokenized release) — atomic multi-key mutations
// ---------------------------------------------------------------------------
async function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const token = crypto.randomUUID();
  const key = lockKey(name);
  const acquired = await redis.set(key, token, { nx: true, ex: 30 });
  if (acquired !== "OK") {
    throw new ApiError(409, "Another operation is in progress, please retry.");
  }
  try {
    return await fn();
  } finally {
    await redis.eval<string[], number>(
      `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end`,
      [key],
      [token]
    );
  }
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------
function hashPassword(password: string, salt?: string): { salt: string; hash: string } {
  const s = salt ?? crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, s, 64).toString("hex");
  return { salt: s, hash };
}

function verifyPassword(password: string, salt: string, expected: string): boolean {
  const { hash } = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(expected, "hex"));
}

async function findUserByEmail(email: string) {
  const userId = await redis.get<string>(emailKey(email));
  if (!userId) return null;
  return getDoc<DbUser>(COLLECTIONS_USERS, userId);
}

async function createSession(userId: string): Promise<string> {
  const token = crypto.randomUUID();
  await redis.set(sessionKey(token), { userId, createdAt: Date.now() }, { ex: SESSION_TTL });
  await redis.sadd(userSessionsKey(userId), token);
  return token;
}

async function destroySession(token: string) {
  const session = await redis.get<{ userId: string }>(sessionKey(token));
  if (session) {
    await redis.srem(userSessionsKey(session.userId), token);
    await redis.del(sessionKey(token));
  }
}

async function currentUser(req: express.Request): Promise<{ user: DbUser; token: string }> {
  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new ApiError(401, "Not authenticated");
  const session = await redis.get<{ userId: string }>(sessionKey(token));
  if (!session) throw new ApiError(401, "Session expired");
  await redis.expire(sessionKey(token), SESSION_TTL); // sliding expiration
  const user = await getDoc<DbUser>(COLLECTIONS_USERS, session.userId);
  if (!user) throw new ApiError(401, "User not found");
  return { user, token };
}

function requireRole(user: DbUser, roles: Role[]) {
  if (!roles.includes(user.role)) throw new ApiError(403, "You do not have permission for this action");
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
const COLLECTIONS_USERS = "users";
interface DbUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  passwordHash: string;
  salt: string;
  createdAt: number;
}

interface Supplier {
  id?: string;
  name: string;
  contact: string;
  balanceOwed: number;
  createdAt: number;
}

interface Factory {
  id?: string;
  name: string;
  contact: string;
  type: "Weaving" | "Dyeing" | "Both";
  balance: number;
  createdAt: number;
}

interface Customer {
  id?: string;
  name: string;
  contact: string;
  balance: number;
  createdAt: number;
}

interface Store {
  id?: string;
  name: string;
  address?: string;
  active: boolean;
  createdAt: number;
}

interface YarnInventory {
  id?: string;
  supplierId?: string;
  supplierName: string;
  yarnType: string;
  quantityKg: number;
  quantityLbs: number;
  unit: "kg" | "lbs";
  ratePerKg: number;
  totalCost: number;
  purchaseDate: number;
  paymentStatus: "Paid" | "Partial" | "Unpaid";
  balanceKg: number;
  balanceLbs: number;
}

interface ProductionLot {
  id?: string;
  lotNumber: string;
  yarnId: string;
  quantityIssuedKg: number;
  factoryId: string;
  dateSent: number;
  expectedFabricMeters: number;
  status: string;
  weavingCharges: number;
  dyeingCharges: number;
  weavingMeters: number | null;
  dyeingMeters: number | null;
  dyeingFactoryId?: string | null;
  actualFabricMeters: number | null;
  totalCost: number | null;
  costPerMeter: number | null;
}

interface FinishedFabric {
  id?: string;
  lotId: string;
  fabricType: string;
  quantityMeters: number;
  costPerMeter: number;
  createdAt: number;
}

interface LedgerEntry {
  id?: string;
  type: "Factory" | "Customer" | "Cash" | "Supplier";
  referenceId?: string;
  transactionId?: string;
  amount: number;
  date: number;
  description: string;
}

interface RetailSaleItem {
  fabricId: string;
  quantity: number;
  price: number;
  costAtSaleTime?: number;
}
interface RetailSale {
  id?: string;
  date: number;
  totalAmount: number;
  paymentMethod: "Cash" | "Card" | "Mobile";
  shopLocation: string;
  items: RetailSaleItem[];
}

interface WholesaleInvoiceItem {
  fabricId: string;
  quantity: number;
  price: number;
  costAtSaleTime?: number;
}
interface WholesaleInvoice {
  id?: string;
  customerId: string;
  date: number;
  totalAmount: number;
  paidAmount: number;
  status: "Paid" | "Partial" | "Unpaid";
  dueDate: number;
  items: WholesaleInvoiceItem[];
}

// ---------------------------------------------------------------------------
// App / errors
// ---------------------------------------------------------------------------
class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const app = express();
app.use(express.json());

const asyncHandler =
  (fn: (req: express.Request, res: express.Response) => Promise<void>) =>
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    fn(req, res).catch(next);
  };

// ---------------------------------------------------------------------------
// Auth endpoints
// ---------------------------------------------------------------------------
app.post(
  "/api/auth/register",
  asyncHandler(async (req, res) => {
    const { email, password, name } = req.body ?? {};
    if (!email || !password || !name) throw new ApiError(400, "email, password and name are required");
    if (typeof password !== "string" || password.length < 6)
      throw new ApiError(400, "Password must be at least 6 characters");
    const normalized = String(email).toLowerCase();
    if (await findUserByEmail(normalized)) throw new ApiError(409, "Email already registered");

    const isFirstUser = (await redis.scard(idxKey(COLLECTIONS_USERS))) === 0;
    const id = await nextId(COLLECTIONS_USERS);
    const { salt, hash } = hashPassword(password);
    const user: DbUser = {
      id,
      email: normalized,
      name,
      role: isFirstUser ? "Admin" : "ShopStaff",
      passwordHash: hash,
      salt,
      createdAt: Date.now(),
    };
    await setDoc(COLLECTIONS_USERS, id, user);
    await indexByDate(COLLECTIONS_USERS, id, user.createdAt);
    await redis.set(emailKey(normalized), id);

    const token = await createSession(id);
    res.json({ user: publicUser(user), token });
  })
);

app.post(
  "/api/auth/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body ?? {};
    const user = await findUserByEmail(String(email ?? ""));
    if (!user || !verifyPassword(password ?? "", user.salt, user.passwordHash)) {
      throw new ApiError(401, "Invalid email or password");
    }
    const token = await createSession(user.id);
    res.json({ user: publicUser(user), token });
  })
);

app.post(
  "/api/auth/logout",
  asyncHandler(async (req, res) => {
    const auth = req.headers.authorization ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (token) await destroySession(token);
    res.json({ ok: true });
  })
);

app.get(
  "/api/auth/me",
  asyncHandler(async (req, res) => {
    const { user } = await currentUser(req);
    res.json({ user: publicUser(user) });
  })
);

app.get("/api/auth/demo", (_req, res) => {
  res.json({ email: "admin@textileerp.com", password: "admin123" });
});

function publicUser(user: DbUser) {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

// ---------------------------------------------------------------------------
// Bootstrap: ensure a demo admin exists
// ---------------------------------------------------------------------------
async function seedAdmin() {
  const existing = await findUserByEmail("admin@textileerp.com");
  if (existing) return;
  const id = await nextId(COLLECTIONS_USERS);
  const { salt, hash } = hashPassword("admin123");
  const user: DbUser = {
    id,
    email: "admin@textileerp.com",
    name: "System Admin",
    role: "Admin",
    passwordHash: hash,
    salt,
    createdAt: Date.now(),
  };
  await setDoc(COLLECTIONS_USERS, id, user);
  await indexByDate(COLLECTIONS_USERS, id, user.createdAt);
  await redis.set(emailKey(user.email), id);
  console.log("[bootstrap] Demo admin ready → admin@textileerp.com / admin123");
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Business endpoints
// ---------------------------------------------------------------------------

// -- Yarn purchase -----------------------------------------------------------
app.post(
  "/api/yarn/purchase",
  asyncHandler(async (req, res) => {
    const { user } = await currentUser(req);
    requireRole(user, ["Admin", "Manager"]);

    const { supplierId, yarnType, quantity, unit, ratePerKg, paymentStatus, paidAmount } = req.body ?? {};
    if (!supplierId || !yarnType || !quantity || !ratePerKg) throw new ApiError(400, "Missing required fields");
    const kgPerLbs = 2.2046226218;
    const quantityKg = unit === "lbs" ? Number(quantity) / kgPerLbs : Number(quantity);
    const quantityLbs = unit === "lbs" ? Number(quantity) : Number(quantity) * kgPerLbs;

    await withLock("yarn", async () => {
      const supplier = await getDoc<Supplier>("suppliers", supplierId);
      if (!supplier) throw new ApiError(404, "Supplier not found");

      const totalCost = quantityKg * Number(ratePerKg);
      const paid = Number(paidAmount ?? 0);
      const balanceOwed = Math.max(0, totalCost - paid);
      const status = paid >= totalCost ? "Paid" : paid > 0 ? "Partial" : "Unpaid";

      const id = await nextId("yarn_inventory");
      const now = Date.now();
      const yarn: YarnInventory = {
        id,
        supplierId,
        supplierName: supplier.name,
        yarnType,
        quantityKg,
        quantityLbs,
        unit: unit === "lbs" ? "lbs" : "kg",
        ratePerKg: Number(ratePerKg),
        totalCost,
        purchaseDate: now,
        paymentStatus: status,
        balanceKg: quantityKg,
        balanceLbs: quantityLbs,
      };
      await setDoc("yarn_inventory", id, yarn);
      await indexByDate("yarn_inventory", id, now);

      if (balanceOwed > 0) {
        await updateDoc("suppliers", supplierId, { balanceOwed: supplier.balanceOwed + balanceOwed });
      }

      const ledgers: LedgerEntry[] = [];
      if (balanceOwed > 0) {
        ledgers.push({
          type: "Supplier",
          referenceId: supplierId,
          transactionId: id,
          amount: balanceOwed,
          date: now,
          description: `Yarn Purchase: ${yarnType}`,
        });
      }
      if (paid > 0) {
        ledgers.push({
          type: "Cash",
          transactionId: id,
          amount: -paid,
          date: now,
          description: `Payment to ${supplier.name} for Yarn ${yarnType}`,
        });
      }
      await writeLedgers(ledgers);
    });

    res.status(201).json({ ok: true });
  })
);

// -- Production lot creation -------------------------------------------------
const LOT_STATUSES = [
  "Yarn Issued",
  "At Weaving",
  "Weaving Complete",
  "Sent for Dyeing",
  "Dyeing Complete",
  "Received in Stock",
];

app.post(
  "/api/production-lots",
  asyncHandler(async (req, res) => {
    const { user } = await currentUser(req);
    requireRole(user, ["Admin", "Manager"]);
    const { yarnId, factoryId, quantityIssuedKg, expectedFabricMeters, weavingCharges, dyeingCharges } = req.body ?? {};
    if (!yarnId || !factoryId || !quantityIssuedKg) throw new ApiError(400, "Missing required fields");

    const lot = await withLock("yarn", async () => {
      const yarn = await getDoc<YarnInventory>("yarn_inventory", yarnId);
      if (!yarn) throw new ApiError(404, "Yarn not found");
      const qty = Number(quantityIssuedKg);
      if (yarn.balanceKg < qty) {
        throw new ApiError(400, `Insufficient yarn balance. Available: ${yarn.balanceKg}kg, Requested: ${qty}kg.`);
      }
      const factory = await getDoc<Factory>("factories", factoryId);
      if (!factory) throw new ApiError(404, "Factory not found");

      const lotNo = await redis.incr(`${P}:seq:lotNumber`);
      const id = await nextId("production_lots");
      const now = Date.now();
      const doc: ProductionLot = {
        id,
        lotNumber: `LOT-${String(lotNo).padStart(4, "0")}`,
        yarnId,
        quantityIssuedKg: qty,
        factoryId,
        dateSent: now,
        expectedFabricMeters: Number(expectedFabricMeters ?? 0),
        status: "Yarn Issued",
        weavingCharges: Number(weavingCharges ?? 0),
        dyeingCharges: Number(dyeingCharges ?? 0),
        weavingMeters: null,
        dyeingMeters: null,
        dyeingFactoryId: null,
        actualFabricMeters: null,
        totalCost: null,
        costPerMeter: null,
      };
      await setDoc("production_lots", id, doc);
      await indexByDate("production_lots", id, now);
      const kgPerLbs = 2.2046226218;
      await updateDoc("yarn_inventory", yarnId, {
        balanceKg: yarn.balanceKg - qty,
        balanceLbs: Math.max(0, (yarn.balanceLbs ?? 0) - qty * kgPerLbs),
      });
      return doc;
    });

    res.status(201).json(lot);
  })
);

app.post(
  "/api/production-lots/:id/advance",
  asyncHandler(async (req, res) => {
    const { user } = await currentUser(req);
    requireRole(user, ["Admin", "Manager"]);
    const lot = await getDoc<ProductionLot>("production_lots", req.params.id);
    if (!lot) throw new ApiError(404, "Lot not found");
    const idx = LOT_STATUSES.indexOf(lot.status);
    if (idx < 0 || idx >= LOT_STATUSES.length - 1) {
      throw new ApiError(400, "Cannot advance this lot");
    }
    const next = LOT_STATUSES[idx + 1];
    if (next === "Received in Stock") {
      throw new ApiError(400, "Use receive-in-stock to close a lot");
    }
    await updateDoc("production_lots", req.params.id, { status: next });
    res.json({ ok: true, status: next });
  })
);

// -- Record meters returned from the weaver --------------------------------
app.post(
  "/api/production-lots/:id/weaving-output",
  asyncHandler(async (req, res) => {
    const { user } = await currentUser(req);
    requireRole(user, ["Admin", "Manager"]);
    const { meters } = req.body ?? {};
    if (!meters || Number(meters) <= 0) throw new ApiError(400, "A valid weaving output in meters is required");

    const lot = await getDoc<ProductionLot>("production_lots", req.params.id);
    if (!lot) throw new ApiError(404, "Lot not found");
    if (!["At Weaving", "Weaving Complete"].includes(lot.status)) {
      throw new ApiError(400, `Cannot record weaving output at status "${lot.status}"`);
    }
    await updateDoc("production_lots", req.params.id, {
      weavingMeters: Number(meters),
      status: "Weaving Complete",
    });
    res.json({ ok: true, status: "Weaving Complete", weavingMeters: Number(meters) });
  })
);

// -- Send the woven fabric to the dyer --------------------------------------
app.post(
  "/api/production-lots/:id/transfer-to-dyeing",
  asyncHandler(async (req, res) => {
    const { user } = await currentUser(req);
    requireRole(user, ["Admin", "Manager"]);
    const lot = await getDoc<ProductionLot>("production_lots", req.params.id);
    if (!lot) throw new ApiError(404, "Lot not found");
    if (lot.status !== "Weaving Complete") {
      throw new ApiError(400, `Transfer to dyeing requires status "Weaving Complete"`);
    }
    const { dyeingFactoryId, dyeingCharges } = req.body ?? {};
    let factoryId = lot.factoryId;
    if (dyeingFactoryId) {
      const dyer = await getDoc<Factory>("factories", dyeingFactoryId);
      if (!dyer) throw new ApiError(404, "Dyeing factory not found");
      factoryId = dyeingFactoryId;
    }
    const patch: Partial<ProductionLot> = { status: "Sent for Dyeing", dyeingFactoryId: factoryId };
    if (dyeingCharges !== undefined && dyeingCharges !== null && dyeingCharges !== "") {
      patch.dyeingCharges = Number(dyeingCharges);
    }
    await updateDoc("production_lots", req.params.id, patch);
    res.json({ ok: true, status: "Sent for Dyeing", dyeingFactoryId: factoryId });
  })
);

// -- Record meters returned from the dyer -----------------------------------
app.post(
  "/api/production-lots/:id/dyeing-output",
  asyncHandler(async (req, res) => {
    const { user } = await currentUser(req);
    requireRole(user, ["Admin", "Manager"]);
    const { meters } = req.body ?? {};
    if (!meters || Number(meters) <= 0) throw new ApiError(400, "A valid dyeing output in meters is required");

    const lot = await getDoc<ProductionLot>("production_lots", req.params.id);
    if (!lot) throw new ApiError(404, "Lot not found");
    if (!["Sent for Dyeing", "Dyeing Complete"].includes(lot.status)) {
      throw new ApiError(400, `Cannot record dyeing output at status "${lot.status}"`);
    }
    await updateDoc("production_lots", req.params.id, {
      dyeingMeters: Number(meters),
      status: "Dyeing Complete",
    });
    res.json({ ok: true, status: "Dyeing Complete", dyeingMeters: Number(meters) });
  })
);

app.post(
  "/api/production-lots/:id/receive-stock",
  asyncHandler(async (req, res) => {
    const { user } = await currentUser(req);
    requireRole(user, ["Admin", "Manager"]);
    const { actualMeters, fabricType } = req.body ?? {};
    if (!fabricType) throw new ApiError(400, "fabricType is required");

    await withLock("stock", async () => {
      const lot = await getDoc<ProductionLot>("production_lots", req.params.id);
      if (!lot) throw new ApiError(404, "Lot not found");
      if (lot.status !== "Dyeing Complete") {
        throw new ApiError(400, "Only dyeing-complete lots can be received into finished stock");
      }
      const yarn = await getDoc<YarnInventory>("yarn_inventory", lot.yarnId);

      // Meters default to the dyeing output, falling back to the weaving output.
      const meters = Number(actualMeters) > 0 ? Number(actualMeters) : (lot.dyeingMeters ?? lot.weavingMeters ?? 0);
      if (meters <= 0) throw new ApiError(400, "actualMeters is required");

      const yarnCost = yarn ? yarn.ratePerKg * lot.quantityIssuedKg : 0;
      const weaving = Number(lot.weavingCharges ?? 0);
      const dyeing = Number(lot.dyeingCharges ?? 0);

      // Weaving charges go to the weaving factory, dyeing charges to the dyeing factory.
      // The entered charges are applied as-is to the assigned factories (the factory
      // type label does not discard a charge the user explicitly entered).
      const weaver = await getDoc<Factory>("factories", lot.factoryId);
      const dyer = lot.dyeingFactoryId
        ? await getDoc<Factory>("factories", lot.dyeingFactoryId)
        : weaver;
      const weavingCharges = weaver ? weaving : 0;
      const dyeingCharges = dyer ? dyeing : 0;
      const factoryCharges = weavingCharges + dyeingCharges;
      const totalCost = yarnCost + factoryCharges;
      const costPerMeter = meters > 0 ? totalCost / meters : 0;

      const now = Date.now();
      await updateDoc("production_lots", req.params.id, {
        status: "Received in Stock",
        actualFabricMeters: meters,
        totalCost,
        costPerMeter,
      });

      const fabricId = await nextId("finished_fabrics");
      await setDoc("finished_fabrics", fabricId, {
        id: fabricId,
        lotId: lot.id,
        fabricType,
        quantityMeters: meters,
        costPerMeter,
        createdAt: now,
      });
      await indexByDate("finished_fabrics", fabricId, now);

      // Accumulate charges per factory first, so a single factory doing both
      // weaving and dyeing receives the full combined amount.
      const chargesByFactory = new Map<string, { factory: Factory; amount: number }>();
      if (weavingCharges > 0 && weaver) {
        const entry = chargesByFactory.get(weaver.id!) ?? { factory: weaver, amount: 0 };
        entry.amount += weavingCharges;
        chargesByFactory.set(weaver.id!, entry);
      }
      if (dyeingCharges > 0 && dyer) {
        const entry = chargesByFactory.get(dyer.id!) ?? { factory: dyer, amount: 0 };
        entry.amount += dyeingCharges;
        chargesByFactory.set(dyer.id!, entry);
      }
      const ledgers: LedgerEntry[] = [];
      for (const { factory, amount } of chargesByFactory.values()) {
        await updateDoc("factories", factory.id!, { balance: factory.balance + amount });
        ledgers.push({
          type: "Factory",
          referenceId: factory.id!,
          transactionId: lot.id,
          amount,
          date: now,
          description: `Job charges for ${lot.lotNumber}`,
        });
      }
      await writeLedgers(ledgers);
    });

    res.status(201).json({ ok: true });
  })
);

// -- Retail sale -------------------------------------------------------------
app.post(
  "/api/retail-sales",
  asyncHandler(async (req, res) => {
    const { user } = await currentUser(req);
    requireRole(user, ["Admin", "Manager", "ShopStaff"]);
    const { items, paymentMethod, shopLocation, totalAmount } = req.body ?? {};
    if (!Array.isArray(items) || items.length === 0) throw new ApiError(400, "Cart is empty");

    const sale = await withLock("stock", async () => {
      for (const item of items) {
        const fab = await getDoc<FinishedFabric>("finished_fabrics", item.fabricId);
        if (!fab) throw new ApiError(404, "Fabric not found in inventory");
        if (fab.quantityMeters < item.quantity) {
          throw new ApiError(
            400,
            `Insufficient stock for ${fab.fabricType}. Available: ${fab.quantityMeters}m, Requested: ${item.quantity}m.`
          );
        }
      }
      const now = Date.now();
      const id = await nextId("retail_sales");
      const saleDoc: RetailSale = {
        id,
        date: now,
        totalAmount: Number(totalAmount),
        paymentMethod,
        shopLocation,
        items: items.map((i) => ({ fabricId: i.fabricId, quantity: i.quantity, price: i.price, costAtSaleTime: i.costAtSaleTime })),
      };
      for (const item of items) {
        const fab = await getDoc<FinishedFabric>("finished_fabrics", item.fabricId)!;
        await updateDoc("finished_fabrics", item.fabricId, { quantityMeters: fab!.quantityMeters - item.quantity });
      }
      await setDoc("retail_sales", id, saleDoc);
      await indexByDate("retail_sales", id, now);
      await writeLedgers([
        {
          type: "Cash",
          transactionId: id,
          amount: Number(totalAmount),
          date: now,
          description: `Retail POS Sale at ${shopLocation}`,
        },
      ]);
      return saleDoc;
    });

    res.status(201).json(sale);
  })
);

// -- Retail sale update (restore old stock, deduct new, reconcile ledger) ----
app.put(
  "/api/retail-sales/:id",
  asyncHandler(async (req, res) => {
    const { user } = await currentUser(req);
    requireRole(user, ["Admin", "Manager", "ShopStaff"]);
    const { items, paymentMethod, shopLocation } = req.body ?? {};
    if (!Array.isArray(items) || items.length === 0) throw new ApiError(400, "Cart is empty");
    const saleId = req.params.id;
    const existing = await getDoc<RetailSale>("retail_sales", saleId);
    if (!existing) throw new ApiError(404, "Sale not found");

    const updated = await withLock("stock", async () => {
      for (const item of existing.items) {
        const fab = await getDoc<FinishedFabric>("finished_fabrics", item.fabricId);
        if (fab) await updateDoc("finished_fabrics", item.fabricId, { quantityMeters: fab.quantityMeters + item.quantity });
      }
      for (const item of items) {
        const fab = await getDoc<FinishedFabric>("finished_fabrics", item.fabricId);
        if (!fab) throw new ApiError(404, "Fabric not found in inventory");
        if (fab.quantityMeters < item.quantity) {
          throw new ApiError(
            400,
            `Insufficient stock for ${fab.fabricType}. Available: ${fab.quantityMeters}m, Requested: ${item.quantity}m.`
          );
        }
      }
      const totalAmount = items.reduce((s, i) => s + Number(i.quantity) * Number(i.price), 0);
      const doc: RetailSale = {
        id: saleId,
        date: existing.date,
        totalAmount,
        paymentMethod,
        shopLocation,
        items: items.map((i) => ({
          fabricId: i.fabricId,
          quantity: i.quantity,
          price: i.price,
          costAtSaleTime: i.costAtSaleTime ?? existing.items.find((o) => o.fabricId === i.fabricId)?.costAtSaleTime,
        })),
      };
      for (const item of items) {
        const fab = await getDoc<FinishedFabric>("finished_fabrics", item.fabricId)!;
        await updateDoc("finished_fabrics", item.fabricId, { quantityMeters: fab!.quantityMeters - item.quantity });
      }
      await setDoc("retail_sales", saleId, doc);
      const ledgers = await listDocs<LedgerEntry>("ledgers");
      for (const entry of ledgers.filter((l) => l.transactionId === saleId)) {
        await updateDoc("ledgers", entry.id!, {
          amount: totalAmount,
          description: `Retail POS Sale at ${shopLocation}`,
        });
      }
      return doc;
    });

    res.json(updated);
  })
);

// -- Retail sale delete (return stock, remove cash ledger entry) -------------
app.delete(
  "/api/retail-sales/:id",
  asyncHandler(async (req, res) => {
    const { user } = await currentUser(req);
    requireRole(user, ["Admin", "Manager"]);
    const saleId = req.params.id;
    const existing = await getDoc<RetailSale>("retail_sales", saleId);
    if (!existing) throw new ApiError(404, "Sale not found");
    await withLock("stock", async () => {
      for (const item of existing.items) {
        const fab = await getDoc<FinishedFabric>("finished_fabrics", item.fabricId);
        if (fab) await updateDoc("finished_fabrics", item.fabricId, { quantityMeters: fab.quantityMeters + item.quantity });
      }
      const ledgers = await listDocs<LedgerEntry>("ledgers");
      for (const entry of ledgers.filter((l) => l.transactionId === saleId)) {
        await deleteDoc("ledgers", entry.id!);
      }
      await deleteDoc("retail_sales", saleId);
    });
    res.json({ ok: true });
  })
);

// -- Production lot delete (reverse factory balances, remove ledgers + fabric) ---
app.delete(
  "/api/production-lots/:id",
  asyncHandler(async (req, res) => {
    const { user } = await currentUser(req);
    requireRole(user, ["Admin", "Manager"]);
    const lotId = req.params.id;
    const lot = await getDoc<ProductionLot>("production_lots", lotId);
    if (!lot) throw new ApiError(404, "Lot not found");

    await withLock("stock", async () => {
      // Reverse factory balances for the job charges recorded for this lot.
      const ledgers = await listDocs<LedgerEntry>("ledgers");
      for (const entry of ledgers.filter((l) => l.transactionId === lotId && l.type === "Factory")) {
        if (entry.referenceId && entry.amount !== 0) {
          const factory = await getDoc<Factory>("factories", entry.referenceId);
          if (factory) {
            await updateDoc("factories", entry.referenceId, { balance: Math.max(0, factory.balance - entry.amount) });
          }
        }
        await deleteDoc("ledgers", entry.id!);
      }
      // Remove any finished fabric produced from this lot.
      const fabrics = await listDocs<FinishedFabric>("finished_fabrics");
      for (const fab of fabrics.filter((f) => f.lotId === lotId)) {
        await deleteDoc("finished_fabrics", fab.id!);
      }
      // Return the issued yarn to inventory.
      if (lot.yarnId && lot.quantityIssuedKg) {
        const yarn = await getDoc<YarnInventory>("yarn_inventory", lot.yarnId);
        if (yarn) {
          const kgPerLbs = 2.2046226218;
          await updateDoc("yarn_inventory", lot.yarnId, {
            balanceKg: (yarn.balanceKg ?? 0) + lot.quantityIssuedKg,
            balanceLbs: (yarn.balanceLbs ?? 0) + lot.quantityIssuedKg * kgPerLbs,
          });
        }
      }
      await deleteDoc("production_lots", lotId);
    });
    res.json({ ok: true });
  })
);
app.post(
  "/api/wholesale-invoices",
  asyncHandler(async (req, res) => {
    const { user } = await currentUser(req);
    requireRole(user, ["Admin", "Manager"]);
    const { customerId, fabricId, quantity, price, paidAmount, dueDate } = req.body ?? {};
    if (!customerId || !fabricId || !quantity || !price) throw new ApiError(400, "Missing required fields");

    const invoice = await withLock("stock", async () => {
      const fab = await getDoc<FinishedFabric>("finished_fabrics", fabricId);
      if (!fab) throw new ApiError(404, "Fabric not found");
      if (fab.quantityMeters < Number(quantity)) {
        throw new ApiError(400, `Insufficient fabric inventory. Available: ${fab.quantityMeters}m, Requested: ${quantity}m.`);
      }
      const customer = await getDoc<Customer>("customers", customerId);
      if (!customer) throw new ApiError(404, "Customer not found");

      const totalAmount = Number(quantity) * Number(price);
      const paid = Number(paidAmount ?? 0);
      const dueAmount = totalAmount - paid;
      const status = paid >= totalAmount ? "Paid" : paid > 0 ? "Partial" : "Unpaid";

      const now = Date.now();
      const id = await nextId("wholesale_invoices");
      const doc: WholesaleInvoice = {
        id,
        customerId,
        date: now,
        totalAmount,
        paidAmount: paid,
        status,
        dueDate: dueDate ? new Date(dueDate).getTime() : now,
        items: [{ fabricId, quantity: Number(quantity), price: Number(price), costAtSaleTime: fab.costPerMeter }],
      };
      await updateDoc("finished_fabrics", fabricId, { quantityMeters: fab.quantityMeters - Number(quantity) });
      await setDoc("wholesale_invoices", id, doc);
      await indexByDate("wholesale_invoices", id, now);
      await updateDoc("customers", customerId, { balance: customer.balance + dueAmount });

      const ledgers: LedgerEntry[] = [
        {
          type: "Customer",
          referenceId: customerId,
          transactionId: id,
          amount: dueAmount,
          date: now,
          description: `Wholesale Invoice for ${fab.fabricType}`,
        },
      ];
      if (paid > 0) {
        ledgers.push({
          type: "Cash",
          transactionId: id,
          amount: paid,
          date: now,
          description: "Payment received for wholesale invoice",
        });
      }
      await writeLedgers(ledgers);
      return doc;
    });

    res.status(201).json(invoice);
  })
);

// -- Payments (FIFO allocation to invoices) ----------------------------------
app.post(
  "/api/payments",
  asyncHandler(async (req, res) => {
    const { user } = await currentUser(req);
    requireRole(user, ["Admin", "Manager"]);
    const { type, entityId, amount } = req.body ?? {};
    if (!type || !entityId || !amount) throw new ApiError(400, "type, entityId and amount are required");
    const amt = Number(amount);

    await withLock("payments", async () => {
      const now = Date.now();
      const ledgers: LedgerEntry[] = [];
      if (type === "Factory") {
        const f = await getDoc<Factory>("factories", entityId);
        if (!f) throw new ApiError(404, "Factory not found");
        await updateDoc("factories", entityId, { balance: Math.max(0, f.balance - amt) });
        ledgers.push(
          { type: "Factory", referenceId: entityId, amount: -amt, date: now, description: "Payment to factory" },
          { type: "Cash", amount: -amt, date: now, description: "Payment to factory" }
        );
      } else if (type === "Supplier") {
        const s = await getDoc<Supplier>("suppliers", entityId);
        if (!s) throw new ApiError(404, "Supplier not found");
        await updateDoc("suppliers", entityId, { balanceOwed: Math.max(0, s.balanceOwed - amt) });
        ledgers.push(
          { type: "Supplier", referenceId: entityId, amount: -amt, date: now, description: "Payment to supplier" },
          { type: "Cash", amount: -amt, date: now, description: "Payment to supplier" }
        );
      } else if (type === "Customer") {
        const c = await getDoc<Customer>("customers", entityId);
        if (!c) throw new ApiError(404, "Customer not found");
        await updateDoc("customers", entityId, { balance: Math.max(0, c.balance - amt) });
        ledgers.push(
          { type: "Customer", referenceId: entityId, amount: -amt, date: now, description: "Payment received from customer" },
          { type: "Cash", amount: amt, date: now, description: "Payment received from customer" }
        );

        // FIFO allocation across unpaid invoices (atomic under the lock)
        const invoices = await listDocsAsc<WholesaleInvoice>("wholesale_invoices");
        let remaining = amt;
        const unpaid = invoices
          .filter((i) => i.customerId === entityId && i.status !== "Paid")
          .sort((a, b) => a.date - b.date);
        for (const inv of unpaid) {
          if (remaining <= 0) break;
          const due = inv.totalAmount - inv.paidAmount;
          if (due <= 0) continue;
          const apply = Math.min(due, remaining);
          const newPaid = inv.paidAmount + apply;
          const newStatus = newPaid >= inv.totalAmount ? "Paid" : newPaid > 0 ? "Partial" : "Unpaid";
          await updateDoc("wholesale_invoices", inv.id!, { paidAmount: newPaid, status: newStatus });
          remaining -= apply;
        }
      } else {
        throw new ApiError(400, "type must be Factory, Supplier or Customer");
      }
      await writeLedgers(ledgers);
    });

    res.json({ ok: true });
  })
);

async function writeLedgers(entries: LedgerEntry[]) {
  for (const e of entries) {
    const id = await nextId("ledgers");
    await setDoc("ledgers", id, { ...e, id, date: e.date ?? Date.now() });
    await indexByDate("ledgers", id, e.date ?? Date.now());
  }
}

// -- Dashboard aggregation ---------------------------------------------------
app.get(
  "/api/dashboard",
  asyncHandler(async (_req, res) => {
    const [yarn, lots, fabrics, retail, wholesale, customers, factories, suppliers, ledgers] = await Promise.all([
      listDocs<YarnInventory>("yarn_inventory"),
      listDocs<ProductionLot>("production_lots"),
      listDocs<FinishedFabric>("finished_fabrics"),
      listDocs<RetailSale>("retail_sales"),
      listDocs<WholesaleInvoice>("wholesale_invoices"),
      listDocs<Customer>("customers"),
      listDocs<Factory>("factories"),
      listDocs<Supplier>("suppliers"),
      listDocs<LedgerEntry>("ledgers"),
    ]);

    const yarnValue = yarn.reduce((s, y) => s + (y.balanceKg ?? 0) * (y.ratePerKg ?? 0), 0);
    const fgValue = fabrics.reduce((s, f) => s + (f.quantityMeters ?? 0) * (f.costPerMeter ?? 0), 0);
    const activeLots = lots.filter((l) => l.status !== "Received in Stock");
    const lotStages = activeLots.reduce((acc, l) => {
      acc[l.status] = (acc[l.status] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const now = new Date();
    const inMonth = (ts: number) => {
      const d = new Date(ts);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    };

    const retailThisMonth = retail.filter((r) => inMonth(r.date));
    const wholesaleThisMonth = wholesale.filter((w) => inMonth(w.date));
    const retailSalesTotal = retailThisMonth.reduce((s, r) => s + r.totalAmount, 0);
    const wholesaleSalesTotal = wholesaleThisMonth.reduce((s, w) => s + w.totalAmount, 0);

    const cogs = (items: { quantity: number; costAtSaleTime?: number }[]) =>
      items.reduce((s, i) => s + (i.costAtSaleTime ?? 0) * i.quantity, 0);
    const retailCOGS = retailThisMonth.reduce((s, r) => s + cogs(r.items), 0);
    const wholesaleCOGS = wholesaleThisMonth.reduce((s, w) => s + cogs(w.items), 0);

    const cashBalance = ledgers.filter((l) => l.type === "Cash").reduce((s, l) => s + l.amount, 0);

    // last 7 days sales for charting
    const days: { date: string; retail: number; wholesale: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const start = d.getTime();
      const end = start + 86400000;
      const r = retail.filter((x) => x.date >= start && x.date < end).reduce((s, x) => s + x.totalAmount, 0);
      const w = wholesale.filter((x) => x.date >= start && x.date < end).reduce((s, x) => s + x.totalAmount, 0);
      days.push({ date: d.toISOString().slice(0, 10), retail: r, wholesale: w });
    }

    res.json({
      yarnValue,
      fgValue,
      activeLots: activeLots.length,
      lotStages,
      retailSalesTotal,
      wholesaleSalesTotal,
      totalSales: retailSalesTotal + wholesaleSalesTotal,
      estimatedProfit: retailSalesTotal + wholesaleSalesTotal - (retailCOGS + wholesaleCOGS),
      cashBalance,
      topReceivables: customers.filter((c) => c.balance > 0).sort((a, b) => b.balance - a.balance).slice(0, 5),
      topFactoryPayables: factories.filter((f) => f.balance > 0).sort((a, b) => b.balance - a.balance).slice(0, 5),
      topSupplierPayables: suppliers.filter((s) => s.balanceOwed > 0).sort((a, b) => b.balanceOwed - a.balanceOwed).slice(0, 5),
      sales7d: days,
    });
  })
);

// ---------------------------------------------------------------------------
// Generic CRUD (registered after business routes so fixed paths win)
// ---------------------------------------------------------------------------
app.get(
  "/api/:collection",
  asyncHandler(async (req, res) => {
    const col = String(req.params.collection);
    if (!COLLECTIONS[col]) throw new ApiError(404, "Unknown collection");
    const { user } = await currentUser(req);
    if (col === COLLECTIONS_USERS) requireRole(user, ["Admin"]);
    const limit = req.query.limit ? Number(req.query.limit) : 1000;
    const offset = req.query.offset ? Number(req.query.offset) : 0;
    const docs = await listDocs<any>(col, { limit, offset });
    res.json(docs);
  })
);

app.get(
  "/api/:collection/:id",
  asyncHandler(async (req, res) => {
    const col = String(req.params.collection);
    if (!COLLECTIONS[col]) throw new ApiError(404, "Unknown collection");
    await currentUser(req);
    const doc = await getDoc<any>(col, req.params.id);
    if (!doc) throw new ApiError(404, "Not found");
    res.json({ id: req.params.id, ...doc });
  })
);

app.post(
  "/api/:collection",
  asyncHandler(async (req, res) => {
    const col = String(req.params.collection);
    const meta = COLLECTIONS[col];
    if (!meta) throw new ApiError(404, "Unknown collection");
    const { user } = await currentUser(req);
    requireRole(user, meta.writableRoles as Role[]);
    if (col === COLLECTIONS_USERS) requireRole(user, ["Admin"]);

    const id = await nextId(col);
    const data = sanitizeForWrite(col, req.body ?? {});
    if (col === COLLECTIONS_USERS) {
      const { email, password, name, role } = req.body ?? {};
      if (await findUserByEmail(String(email ?? ""))) throw new ApiError(409, "Email already registered");
      const { salt, hash } = hashPassword(password);
      await setDoc(col, id, { id, email, name, role, salt, passwordHash: hash, createdAt: Date.now() });
      await redis.set(emailKey(String(email)), id);
    } else {
      await setDoc(col, id, { id, ...data, createdAt: data.createdAt ?? Date.now() });
    }
    await indexByDate(col, id, (data[meta.dateField] as number) ?? Date.now());
    const saved = await getDoc<any>(col, id);
    res.status(201).json({ id, ...saved });
  })
);

app.put(
  "/api/:collection/:id",
  asyncHandler(async (req, res) => {
    const col = String(req.params.collection);
    const meta = COLLECTIONS[col];
    if (!meta) throw new ApiError(404, "Unknown collection");
    const { user } = await currentUser(req);
    requireRole(user, meta.writableRoles as Role[]);

    const existing = await getDoc<Record<string, any>>(col, req.params.id);
    if (!existing) throw new ApiError(404, "Not found");
    const patch = sanitizeForWrite(col, req.body ?? {});
    const merged = { ...existing, ...patch };
    await redis.set(docKey(col, req.params.id), merged);
    await indexByDate(col, req.params.id, (merged[meta.dateField] as number) ?? existing.createdAt ?? Date.now());
    res.json({ id: req.params.id, ...merged });
  })
);

app.delete(
  "/api/:collection/:id",
  asyncHandler(async (req, res) => {
    const col = String(req.params.collection);
    const meta = COLLECTIONS[col];
    if (!meta) throw new ApiError(404, "Unknown collection");
    const { user } = await currentUser(req);
    requireRole(user, meta.writableRoles as Role[]);
    if (col === COLLECTIONS_USERS) {
      requireRole(user, ["Admin"]);
      const target = await getDoc<DbUser>(col, req.params.id);
      if (target) {
        await redis.del(emailKey(target.email));
        const sessions = await redis.smembers(userSessionsKey(req.params.id));
        if (sessions.length) await redis.del(...sessions.map(sessionKey));
        await redis.del(userSessionsKey(req.params.id));
      }
    }
    await deleteDoc(col, req.params.id);
    res.json({ ok: true });
  })
);

/** Strip server-owned fields so clients cannot forge them via generic CRUD. */
function sanitizeForWrite(col: string, body: Record<string, any>): Record<string, any> {
  const banned = ["id", "passwordHash", "salt", "createdAt"];
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(body)) {
    if (banned.includes(k) || v === undefined) continue;
    if (col === COLLECTIONS_USERS && k === "password") continue; // users handled via POST above
    out[k] = v;
  }
  return out;
}

// -- Sample data -------------------------------------------------------------
app.post(
  "/api/seed",
  asyncHandler(async (req, res) => {
    const { user } = await currentUser(req);
    requireRole(user, ["Admin"]);
    await seedSampleData();
    res.json({ ok: true });
  })
);

app.post(
  "/api/seed/delete",
  asyncHandler(async (req, res) => {
    const { user } = await currentUser(req);
    requireRole(user, ["Admin"]);
    const cols = [
      "suppliers",
      "yarn_inventory",
      "factories",
      "production_lots",
      "finished_fabrics",
      "retail_sales",
      "wholesale_invoices",
      "customers",
      "ledgers",
    ];
    for (const col of cols) {
      const docs = await listDocs<any>(col);
      for (const d of docs) await deleteDoc(col, d.id);
    }
    res.json({ ok: true });
  })
);

async function seedSampleData() {
  const now = Date.now();
  await withLock("seed", async () => {
    async function add<T>(col: string, data: Record<string, any>): Promise<string> {
      const id = await nextId(col);
      await setDoc(col, id, { id, ...data, createdAt: data.createdAt ?? now });
      await indexByDate(col, id, (data[COLLECTIONS[col].dateField] as number) ?? now);
      return id;
    }
    const suppA = await add<Supplier>("suppliers", { name: "Sample Supplier A", contact: "123", balanceOwed: 0 });
    const suppB = await add<Supplier>("suppliers", { name: "Sample Supplier B", contact: "123", balanceOwed: 1000 });
    const suppC = await add<Supplier>("suppliers", { name: "Sample Supplier C", contact: "123", balanceOwed: 2400 });

    const y1 = await add<YarnInventory>("yarn_inventory", { supplierId: suppA, supplierName: "Sample Supplier A", yarnType: "Cotton 40s (Sample)", quantityKg: 1000, quantityLbs: 2204.6, unit: "kg", ratePerKg: 3.5, totalCost: 3500, purchaseDate: now, paymentStatus: "Paid", balanceKg: 700, balanceLbs: 1543.2 });
    const y2 = await add<YarnInventory>("yarn_inventory", { supplierId: suppB, supplierName: "Sample Supplier B", yarnType: "Polyester 30s (Sample)", quantityKg: 500, quantityLbs: 1102.3, unit: "kg", ratePerKg: 4.0, totalCost: 2000, purchaseDate: now, paymentStatus: "Partial", balanceKg: 200, balanceLbs: 440.9 });
    const y3 = await add<YarnInventory>("yarn_inventory", { supplierId: suppC, supplierName: "Sample Supplier C", yarnType: "Linen 20s (Sample)", quantityKg: 800, quantityLbs: 1763.7, unit: "kg", ratePerKg: 3.0, totalCost: 2400, purchaseDate: now, paymentStatus: "Unpaid", balanceKg: 400, balanceLbs: 881.8 });

    await add<LedgerEntry>("ledgers", { type: "Cash", amount: -3500, date: now, description: "Payment to Sample Supplier A for Yarn Cotton 40s (Sample)" });
    await add<LedgerEntry>("ledgers", { type: "Supplier", referenceId: suppB, transactionId: y2, amount: 1000, date: now, description: "Yarn Purchase: Polyester 30s (Sample)" });
    await add<LedgerEntry>("ledgers", { type: "Cash", amount: -1000, date: now, description: "Payment to Sample Supplier B for Yarn Polyester 30s (Sample)" });
    await add<LedgerEntry>("ledgers", { type: "Supplier", referenceId: suppC, transactionId: y3, amount: 2400, date: now, description: "Yarn Purchase: Linen 20s (Sample)" });

    const factW = await add<Factory>("factories", { name: "Sample Weavers", contact: "456", type: "Weaving", balance: 0 });
    const factD = await add<Factory>("factories", { name: "Sample Dyers", contact: "456", type: "Dyeing", balance: 0 });
    const factB = await add<Factory>("factories", { name: "Sample Composite Mills", contact: "456", type: "Both", balance: 1800 });

    await add<ProductionLot>("production_lots", { lotNumber: "LOT-S001", yarnId: y1, quantityIssuedKg: 100, factoryId: factW, dateSent: now, expectedFabricMeters: 400, weavingCharges: 0, dyeingCharges: 0, status: "Yarn Issued", weavingMeters: null, dyeingMeters: null, dyeingFactoryId: null, actualFabricMeters: null, totalCost: null, costPerMeter: null });
    await add<ProductionLot>("production_lots", { lotNumber: "LOT-S002", yarnId: y1, quantityIssuedKg: 200, factoryId: factW, dateSent: now, expectedFabricMeters: 800, weavingCharges: 500, dyeingCharges: 0, status: "Sent for Dyeing", weavingMeters: 760, dyeingMeters: null, dyeingFactoryId: null, actualFabricMeters: null, totalCost: null, costPerMeter: null });

    const lot3 = await add<ProductionLot>("production_lots", { lotNumber: "LOT-S003", yarnId: y2, quantityIssuedKg: 300, factoryId: factB, dateSent: now, expectedFabricMeters: 1000, weavingCharges: 600, dyeingCharges: 400, status: "Received in Stock", weavingMeters: 1000, dyeingMeters: 1000, dyeingFactoryId: null, actualFabricMeters: 1000, totalCost: 2200, costPerMeter: 2.2 });
    await add<LedgerEntry>("ledgers", { type: "Factory", referenceId: factB, transactionId: lot3, amount: 1000, date: now, description: "Job work charges for LOT-S003" });
    const fab3 = await add<FinishedFabric>("finished_fabrics", { lotId: lot3, fabricType: "Polyester Twill (Sample)", quantityMeters: 400, costPerMeter: 2.2 });

    const lot4 = await add<ProductionLot>("production_lots", { lotNumber: "LOT-S004", yarnId: y3, quantityIssuedKg: 400, factoryId: factB, dateSent: now, expectedFabricMeters: 1500, weavingCharges: 800, dyeingCharges: 500, status: "Received in Stock", weavingMeters: 1500, dyeingMeters: 1450, dyeingFactoryId: null, actualFabricMeters: 1500, totalCost: 2500, costPerMeter: 1.666666 });
    await add<LedgerEntry>("ledgers", { type: "Factory", referenceId: factB, transactionId: lot4, amount: 1300, date: now, description: "Job work charges for LOT-S004" });
    const fab4 = await add<FinishedFabric>("finished_fabrics", { lotId: lot4, fabricType: "Linen Plain (Sample)", quantityMeters: 1050, costPerMeter: 1.666666 });

    const ret1 = await add<RetailSale>("retail_sales", { date: now, totalAmount: 330, paymentMethod: "Cash", shopLocation: "Main Store", items: [{ fabricId: fab3, quantity: 100, price: 3.3, costAtSaleTime: 2.2 }] });
    await add<LedgerEntry>("ledgers", { type: "Cash", transactionId: ret1, amount: 330, date: now, description: "Retail POS Sale at Main Store" });
    const ret2 = await add<RetailSale>("retail_sales", { date: now, totalAmount: 125.25, paymentMethod: "Card", shopLocation: "Downtown Kiosk", items: [{ fabricId: fab4, quantity: 50, price: 2.505, costAtSaleTime: 1.666666 }] });
    await add<LedgerEntry>("ledgers", { type: "Cash", transactionId: ret2, amount: 125.25, date: now, description: "Retail POS Sale at Downtown Kiosk" });

    const cust1 = await add<Customer>("customers", { name: "Sample Customer A", contact: "789", balance: 0 });
    const cust2 = await add<Customer>("customers", { name: "Sample Customer B", contact: "789", balance: 500 });
    const cust3 = await add<Customer>("customers", { name: "Sample Customer C", contact: "789", balance: 300 });

    const inv1 = await add<WholesaleInvoice>("wholesale_invoices", { customerId: cust1, date: now, totalAmount: 750, paidAmount: 750, status: "Paid", dueDate: now, items: [{ fabricId: fab3, quantity: 300, price: 2.5, costAtSaleTime: 2.2 }] });
    await add<LedgerEntry>("ledgers", { type: "Customer", referenceId: cust1, transactionId: inv1, amount: 0, date: now, description: "Wholesale Invoice for Polyester Twill (Sample)" });
    await add<LedgerEntry>("ledgers", { type: "Cash", transactionId: inv1, amount: 750, date: now, description: "Payment received for wholesale invoice" });

    const inv2 = await add<WholesaleInvoice>("wholesale_invoices", { customerId: cust2, date: now, totalAmount: 800, paidAmount: 300, status: "Partial", dueDate: now, items: [{ fabricId: fab4, quantity: 400, price: 2.0, costAtSaleTime: 1.666666 }] });
    await add<LedgerEntry>("ledgers", { type: "Customer", referenceId: cust2, transactionId: inv2, amount: 500, date: now, description: "Wholesale Invoice for Linen Plain (Sample)" });
    await add<LedgerEntry>("ledgers", { type: "Cash", transactionId: inv2, amount: 300, date: now, description: "Payment received for wholesale invoice" });

    const inv3 = await add<WholesaleInvoice>("wholesale_invoices", { customerId: cust3, date: now, totalAmount: 500, paidAmount: 200, status: "Partial", dueDate: now, items: [{ fabricId: fab3, quantity: 200, price: 2.5, costAtSaleTime: 2.2 }] });
    await add<LedgerEntry>("ledgers", { type: "Customer", referenceId: cust3, transactionId: inv3, amount: 500, date: now, description: "Wholesale Invoice for Polyester Twill (Sample)" });

    await add<LedgerEntry>("ledgers", { type: "Customer", referenceId: cust3, amount: -200, date: now, description: "Payment received from customer" });
    await add<LedgerEntry>("ledgers", { type: "Cash", amount: 200, date: now, description: "Payment received from customer" });
    await add<LedgerEntry>("ledgers", { type: "Factory", referenceId: factB, amount: -500, date: now, description: "Payment to factory" });
    await add<LedgerEntry>("ledgers", { type: "Cash", amount: -500, date: now, description: "Payment to factory" });
  });
}

// ---------------------------------------------------------------------------
// Serve static build + start
// ---------------------------------------------------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, "..", "dist");

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(distPath, "index.html")));
}

// Error handling
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof UpstashErrors.UpstashError) {
    console.error("[redis]", err.message);
    res.status(500).json({ error: "Storage error, please retry." });
    return;
  }
  console.error(err);
  res.status(500).json({ error: err?.message ?? "Internal server error" });
});

const PORT = Number(process.env.PORT ?? 3001);

seedAdmin()
  .then(() => {
    app.listen(PORT, () => console.log(`[server] Textile ERP API running on http://localhost:${PORT}`));
  })
  .catch((e) => {
    console.error("Failed to bootstrap", e);
    process.exit(1);
  });
