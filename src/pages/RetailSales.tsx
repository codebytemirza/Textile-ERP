import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { Delete, Edit, ShoppingCart, Store as StoreIcon, Storefront, Add as AddIcon, Print } from "@mui/icons-material";
import { collectionApi, businessApi } from "../api";
import { useCollection } from "../lib/useCollection";
import { useToast } from "../contexts/ToastContext";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyState, PageHeader, Loader } from "../components/PageHeader";
import { printReceipt, type ReceiptData } from "../components/ReceiptPrint";
import type { FinishedFabric, RetailSale, Store } from "../types";
import { formatCurrency, formatDate, round } from "../lib/utils";

interface CartItem {
  fabricId: string;
  type: string;
  lotId: string;
  quantity: number;
  price: number;
  costPerMeter: number;
}

interface EditItem {
  fabricId: string;
  type: string;
  quantity: number;
  price: number;
  costAtSaleTime?: number;
}

export function RetailSales() {
  const toast = useToast();
  const { data: fabrics, loading: fabricsLoading, refresh: refreshFabrics } = useCollection<FinishedFabric>(
    () => collectionApi<FinishedFabric>("finished_fabrics").list(),
    []
  );
  const { data: sales, loading: salesLoading, refresh } = useCollection<RetailSale>(
    () => collectionApi<RetailSale>("retail_sales").list(),
    []
  );
  const { data: stores, loading: storesLoading, refresh: refreshStores } = useCollection<Store>(
    () => collectionApi<Store>("stores").list(),
    []
  );

  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"Cash" | "Card" | "Mobile">("Cash");
  const [shopLocation, setShopLocation] = useState("Main Store");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState<RetailSale | null>(null);
  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [editMethod, setEditMethod] = useState<"Cash" | "Card" | "Mobile">("Cash");
  const [editLocation, setEditLocation] = useState("Main Store");
  const [deleting, setDeleting] = useState<RetailSale | null>(null);

  const [storesOpen, setStoresOpen] = useState(false);
  const [storeForm, setStoreForm] = useState<{ name: string; address: string; active: boolean }>({ name: "", address: "", active: true });
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [deletingStore, setDeletingStore] = useState<Store | null>(null);
  const [storeSaving, setStoreSaving] = useState(false);

  const activeStores = useMemo(() => (stores ?? []).filter((s) => s.active), [stores]);

  const available = useMemo(() => (fabrics ?? []).filter((f) => f.quantityMeters > 0), [fabrics]);

  const addToCart = (fabric: FinishedFabric) => {
    const existing = cart.find((c) => c.fabricId === fabric.id);
    if (existing) {
      if (existing.quantity + 1 > fabric.quantityMeters) {
        toast.error(`Insufficient stock for ${fabric.fabricType}. Available: ${fabric.quantityMeters}m.`);
        return;
      }
      setCart((c) => c.map((x) => (x.fabricId === fabric.id ? { ...x, quantity: x.quantity + 1 } : x)));
      return;
    }
    setCart((c) => [
      ...c,
      {
        fabricId: fabric.id,
        type: fabric.fabricType,
        lotId: fabric.lotId,
        quantity: 1,
        price: round(fabric.costPerMeter * 1.4),
        costPerMeter: fabric.costPerMeter,
      },
    ]);
  };

  const updateQty = (fabricId: string, quantity: number) => {
    const fabric = (fabrics ?? []).find((f) => f.id === fabricId);
    if (!fabric) return;
    if (quantity <= 0) {
      setCart((c) => c.filter((x) => x.fabricId !== fabricId));
      return;
    }
    if (quantity > fabric.quantityMeters) {
      toast.error(`Insufficient stock. Available: ${fabric.quantityMeters}m.`);
      return;
    }
    setCart((c) => c.map((x) => (x.fabricId === fabricId ? { ...x, quantity } : x)));
  };

  const updatePrice = (fabricId: string, price: number) => {
    setCart((c) => c.map((x) => (x.fabricId === fabricId ? { ...x, price } : x)));
  };

  const totalAmount = cart.reduce((s, x) => s + x.quantity * x.price, 0);

  const fabricById = useMemo(() => new Map((fabrics ?? []).map((f) => [f.id, f])), [fabrics]);

  const openEdit = (sale: RetailSale) => {
    setEditing(sale);
    setEditItems(
      sale.items.map((i) => ({
        fabricId: i.fabricId,
        type: fabricById.get(i.fabricId)?.fabricType ?? "Unknown",
        quantity: i.quantity,
        price: i.price,
        costAtSaleTime: i.costAtSaleTime,
      }))
    );
    setEditMethod(sale.paymentMethod);
    setEditLocation(sale.shopLocation);
  };

  const editTotal = editItems.reduce((s, x) => s + x.quantity * x.price, 0);

  const updateEditItem = (fabricId: string, patch: Partial<EditItem>) => {
    setEditItems((items) => items.map((x) => (x.fabricId === fabricId ? { ...x, ...patch } : x)));
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (editItems.length === 0 || editItems.some((i) => i.quantity <= 0)) {
      toast.error("Each item needs a quantity greater than zero");
      return;
    }
    for (const item of editItems) {
      const fab = fabricById.get(item.fabricId);
      if (fab && item.quantity > fab.quantityMeters + editing.items.find((o) => o.fabricId === item.fabricId)?.quantity!) {
        toast.error(`Insufficient stock for ${item.type}. Available: ${fab.quantityMeters}m.`);
        return;
      }
    }
    setSaving(true);
    try {
      await businessApi.updateRetailSale(editing.id, {
        items: editItems.map((i) => ({
          fabricId: i.fabricId,
          quantity: i.quantity,
          price: i.price,
          costAtSaleTime: i.costAtSaleTime,
        })),
        paymentMethod: editMethod,
        shopLocation: editLocation,
        totalAmount: round(editTotal),
      });
      toast.success("Sale updated");
      setEditing(null);
      refresh();
      refreshFabrics();
    } catch (e: any) {
      toast.error(e?.message ?? "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const removeSale = async () => {
    if (!deleting) return;
    setSaving(true);
    try {
      await businessApi.deleteRetailSale(deleting.id);
      toast.success("Sale deleted, stock returned");
      setDeleting(null);
      refresh();
      refreshFabrics();
    } catch (e: any) {
      toast.error(e?.message ?? "Delete failed");
    } finally {
      setSaving(false);
    }
  };

  const openAddStore = () => {
    setEditingStore(null);
    setStoreForm({ name: "", address: "", active: true });
    setStoresOpen(true);
  };

  const openEditStore = (s: Store) => {
    setEditingStore(s);
    setStoreForm({ name: s.name, address: s.address ?? "", active: s.active });
    setStoresOpen(true);
  };

  const saveStore = async () => {
    if (!storeForm.name.trim()) {
      toast.error("Store name is required");
      return;
    }
    setStoreSaving(true);
    try {
      if (editingStore) {
        await collectionApi<Store>("stores").update(editingStore.id, {
          name: storeForm.name.trim(),
          address: storeForm.address,
          active: storeForm.active,
        });
        toast.success("Store updated");
      } else {
        await collectionApi<Store>("stores").create({
          name: storeForm.name.trim(),
          address: storeForm.address,
          active: storeForm.active,
        });
        toast.success("Store added");
      }
      setStoresOpen(false);
      refreshStores();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save store");
    } finally {
      setStoreSaving(false);
    }
  };

  const removeStore = async () => {
    if (!deletingStore) return;
    try {
      await collectionApi<Store>("stores").remove(deletingStore.id);
      toast.success("Store deleted");
      setDeletingStore(null);
      refreshStores();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete store");
    }
  };

  const processSale = async () => {
    setSaving(true);
    try {
      const created = await businessApi.retailSale({
        items: cart.map((c) => ({
          fabricId: c.fabricId,
          quantity: c.quantity,
          price: c.price,
          costAtSaleTime: c.costPerMeter,
        })),
        paymentMethod,
        shopLocation,
        totalAmount: round(totalAmount),
      });
      toast.success("Sale completed");
      const saleId = (created as any)?.id ?? String(Date.now());
      printReceipt({
        title: "Sale Receipt",
        reference: saleId,
        date: Date.now(),
        paymentMethod,
        location: shopLocation,
        items: cart.map((c) => ({
          name: c.type,
          qty: c.quantity,
          price: c.price,
          amount: round(c.quantity * c.price),
        })),
        total: round(totalAmount),
        paid: round(totalAmount),
        balance: 0,
      });
      setCart([]);
      setConfirmOpen(false);
      refresh();
      refreshFabrics();
    } catch (e: any) {
      toast.error(e?.message ?? "Sale failed");
    } finally {
      setSaving(false);
    }
  };

  const printSale = (sale: RetailSale) => {
    const items = (sale.items ?? []).map((i) => ({
      name: fabricById.get(i.fabricId)?.fabricType ?? "Fabric",
      qty: i.quantity,
      price: i.price,
      amount: round(i.quantity * i.price),
    }));
    const receipt: ReceiptData = {
      title: "Sale Receipt",
      reference: sale.id,
      date: sale.date,
      paymentMethod: sale.paymentMethod,
      location: sale.shopLocation,
      items,
      total: round(sale.totalAmount),
      paid: round(sale.totalAmount),
      balance: 0,
    };
    printReceipt(receipt);
  };

  const grouped = useMemo(() => {
    const map = new Map<string, FinishedFabric[]>();
    for (const f of available) {
      const list = map.get(f.fabricType) ?? [];
      list.push(f);
      map.set(f.fabricType, list);
    }
    return Array.from(map.entries());
  }, [available]);

  return (
    <Box>
      <PageHeader title="Retail POS" subtitle="Point of sale — auto-deducts stock and records cash">
        <Button variant="outlined" startIcon={<Storefront />} onClick={openAddStore}>
          Stores
        </Button>
      </PageHeader>

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Paper variant="outlined" sx={{ p: 2.5 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
              <StoreIcon color="primary" />
              <Typography variant="h3">Products</Typography>
            </Stack>
            <Stack spacing={2}>
              {grouped.map(([type, items]) => (
                <Box key={type}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, borderBottom: "1px solid", borderColor: "divider", pb: 0.5 }}>
                    {type}
                  </Typography>
                  <Grid container spacing={1.5}>
                    {items.map((fabric) => (
                      <Grid size={{ xs: 6, md: 4 }} key={fabric.id}>
                        <Paper
                          variant="outlined"
                          sx={{
                            p: 1.5,
                            cursor: "pointer",
                            height: "100%",
                            "&:hover": { borderColor: "primary.main", bgcolor: "action.hover" },
                          }}
                          onClick={() => addToCart(fabric)}
                        >
                          <Typography variant="body2" sx={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {fabric.fabricType}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Lot: {fabric.lotId.slice(0, 6)}... · In Stock: {fabric.quantityMeters}m
                          </Typography>
                        </Paper>
                      </Grid>
                    ))}
                  </Grid>
                </Box>
              ))}
              {available.length === 0 && !fabricsLoading && <EmptyState message="No inventory available for sale." />}
              {available.length === 0 && fabricsLoading && <Loader loading rows={3} />}
            </Stack>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 5 }}>
          <Paper variant="outlined" sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <Box sx={{ p: 2, borderBottom: "1px solid", borderColor: "divider", bgcolor: "grey.900", color: "white" }}>
              <Typography variant="h6" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <ShoppingCart fontSize="small" />
                Current Order
              </Typography>
            </Box>

            <Box sx={{ flex: 1, overflowY: "auto", p: 2, minHeight: 240 }}>
              <Stack spacing={1.5}>
                {cart.map((item) => (
                  <Paper variant="outlined" key={item.fabricId} sx={{ p: 1.5, bgcolor: "grey.50" }}>
                    <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", mb: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{item.type}</Typography>
                      <IconButton size="small" color="error" onClick={() => setCart((c) => c.filter((x) => x.fabricId !== item.fabricId))}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </Stack>
                    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                      <TextField
                        label="Meters"
                        type="number"
                        size="small"
                        slotProps={{ htmlInput: { min: 0.1, step: 0.1 } }}
                        value={item.quantity}
                        onChange={(e) => updateQty(item.fabricId, Number(e.target.value))}
                        sx={{ flex: 1 }}
                      />
                      <TextField
                        label="Price/m (₨)"
                        type="number"
                        size="small"
                        slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                        value={item.price}
                        onChange={(e) => updatePrice(item.fabricId, Number(e.target.value))}
                        sx={{ flex: 1 }}
                      />
                      <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 90, textAlign: "right" }}>
                        {formatCurrency(round(item.quantity * item.price))}
                      </Typography>
                    </Stack>
                  </Paper>
                ))}
                {cart.length === 0 && (
                  <Typography color="text.secondary" variant="body2" sx={{ textAlign: "center", py: 6 }}>
                    Cart is empty. Select items to begin.
                  </Typography>
                )}
              </Stack>
            </Box>

            <Box sx={{ p: 2, borderTop: "1px solid", borderColor: "divider", bgcolor: "grey.50" }}>
              <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>Total:</Typography>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>{formatCurrency(round(totalAmount))}</Typography>
              </Stack>
              <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
                <TextField
                  select
                  label="Payment"
                  size="small"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  sx={{ flex: 1 }}
                >
                  <MenuItem value="Cash">Cash</MenuItem>
                  <MenuItem value="Card">Card</MenuItem>
                  <MenuItem value="Mobile">Mobile</MenuItem>
                </TextField>
                <TextField
                  select
                  label="Location"
                  size="small"
                  value={shopLocation}
                  onChange={(e) => setShopLocation(e.target.value)}
                  sx={{ flex: 1 }}
                >
                  {activeStores.length === 0 && <MenuItem value="Main Store">Main Store</MenuItem>}
                  {activeStores.map((s) => (
                    <MenuItem key={s.id} value={s.name}>{s.name}</MenuItem>
                  ))}
                </TextField>
              </Stack>
              <Button variant="contained" fullWidth size="large" disabled={cart.length === 0} onClick={() => setConfirmOpen(true)}>
                Complete Sale
              </Button>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      <Typography variant="h3" sx={{ mt: 4, mb: 2 }}>Recent Sales</Typography>
      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Items</TableCell>
                <TableCell>Payment</TableCell>
                <TableCell>Location</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {salesLoading && (
                <TableRow>
                  <TableCell colSpan={6} sx={{ py: 2 }}>
                    <Loader loading rows={3} />
                  </TableCell>
                </TableRow>
              )}
              {!salesLoading && (sales ?? []).slice(0, 15).map((s) => (
                <TableRow key={s.id} hover>
                  <TableCell>{formatDate(s.date, true)}</TableCell>
                  <TableCell>
                    {s.items.map((i) => `${i.quantity} m @ ${formatCurrency(i.price)}`).join(", ")}
                  </TableCell>
                  <TableCell><Chip label={s.paymentMethod} size="small" /></TableCell>
                  <TableCell>{s.shopLocation}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(s.totalAmount)}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
                      <IconButton size="small" onClick={() => printSale(s)}>
                        <Print fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => openEdit(s)}>
                        <Edit fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => setDeleting(s)}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
              {!salesLoading && (sales ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} sx={{ py: 4, textAlign: "center", color: "text.secondary" }}>
                    No sales recorded yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Confirm Sale</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1} sx={{ mb: 2 }}>
            {cart.map((c) => (
              <Typography key={c.fabricId} variant="body2">
                {c.type} — {c.quantity} m × {formatCurrency(c.price)} = {formatCurrency(round(c.quantity * c.price))}
              </Typography>
            ))}
          </Stack>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Total: {formatCurrency(round(totalAmount))}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} color="inherit">Cancel</Button>
          <Button onClick={processSale} variant="contained" disabled={saving}>
            {saving ? "Processing..." : "Complete Sale"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!editing} onClose={() => setEditing(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Sale</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {editItems.map((item) => {
              const fab = fabricById.get(item.fabricId);
              const maxAfterAdjust = fab
                ? fab.quantityMeters + (editing?.items.find((o) => o.fabricId === item.fabricId)?.quantity ?? 0)
                : Infinity;
              return (
                <Paper variant="outlined" key={item.fabricId} sx={{ p: 1.5, bgcolor: "grey.50" }}>
                  <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{item.type}</Typography>
                    <IconButton size="small" color="error" onClick={() => setEditItems((xs) => xs.filter((x) => x.fabricId !== item.fabricId))}>
                      <Delete fontSize="small" />
                    </IconButton>
                  </Stack>
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                    <TextField
                      label="Meters"
                      type="number"
                      size="small"
                      slotProps={{ htmlInput: { min: 0.1, step: 0.1, max: maxAfterAdjust } }}
                      value={item.quantity}
                      onChange={(e) => updateEditItem(item.fabricId, { quantity: Number(e.target.value) })}
                      sx={{ flex: 1 }}
                    />
                    <TextField
                      label="Price/m (₨)"
                      type="number"
                      size="small"
                      slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                      value={item.price}
                      onChange={(e) => updateEditItem(item.fabricId, { price: Number(e.target.value) })}
                      sx={{ flex: 1 }}
                    />
                    <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 90, textAlign: "right" }}>
                      {formatCurrency(round(item.quantity * item.price))}
                    </Typography>
                  </Stack>
                </Paper>
              );
            })}
            {editItems.length === 0 && (
              <Typography color="text.secondary" variant="body2" sx={{ textAlign: "center", py: 3 }}>
                No items. This sale would be empty — cancel to keep it unchanged.
              </Typography>
            )}
            <Stack direction="row" spacing={1}>
              <TextField
                select
                label="Payment"
                size="small"
                value={editMethod}
                onChange={(e) => setEditMethod(e.target.value as any)}
                sx={{ flex: 1 }}
              >
                <MenuItem value="Cash">Cash</MenuItem>
                <MenuItem value="Card">Card</MenuItem>
                <MenuItem value="Mobile">Mobile</MenuItem>
              </TextField>
              <TextField
                select
                label="Location"
                size="small"
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
                sx={{ flex: 1 }}
              >
                {activeStores.length === 0 && <MenuItem value="Main Store">Main Store</MenuItem>}
                {activeStores.map((s) => (
                  <MenuItem key={s.id} value={s.name}>{s.name}</MenuItem>
                ))}
              </TextField>
            </Stack>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Total: {formatCurrency(round(editTotal))}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)} color="inherit">Cancel</Button>
          <Button onClick={saveEdit} variant="contained" disabled={saving || editItems.length === 0}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        title="Delete Sale"
        message={`Delete this sale of ${formatCurrency(deleting?.totalAmount ?? 0)}? Item quantities will be returned to inventory.`}
        onConfirm={removeSale}
        onClose={() => setDeleting(null)}
      />

      <Dialog open={storesOpen} onClose={() => setStoresOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingStore ? "Edit Store" : "Add Store"}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mb: 3 }}>
            <TextField
              label="Store Name"
              value={storeForm.name}
              onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })}
              fullWidth
              required
              placeholder="e.g. Main Store"
            />
            <TextField
              label="Address"
              value={storeForm.address}
              onChange={(e) => setStoreForm({ ...storeForm, address: e.target.value })}
              fullWidth
              placeholder="Optional address / notes"
            />
            <TextField
              select
              label="Status"
              value={storeForm.active ? "Active" : "Inactive"}
              onChange={(e) => setStoreForm({ ...storeForm, active: e.target.value === "Active" })}
              fullWidth
            >
              <MenuItem value="Active">Active</MenuItem>
              <MenuItem value="Inactive">Inactive</MenuItem>
            </TextField>
          </Stack>
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Saved Stores</Typography>
            <Button size="small" startIcon={<StoreIcon />} onClick={openAddStore}>New</Button>
          </Stack>
          <Paper variant="outlined">
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Address</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {storesLoading && (
                    <TableRow>
                      <TableCell colSpan={4} sx={{ py: 2 }}>
                        <Loader loading rows={2} />
                      </TableCell>
                    </TableRow>
                  )}
                  {!storesLoading && (stores ?? []).map((s) => (
                    <TableRow key={s.id} hover>
                      <TableCell sx={{ fontWeight: 500 }}>{s.name}</TableCell>
                      <TableCell>
                        <Typography variant="body2">{s.address ?? "—"}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={s.active ? "Active" : "Inactive"} color={s.active ? "success" : "default"} size="small" />
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
                          <IconButton size="small" onClick={() => openEditStore(s)}>
                            <Edit fontSize="small" />
                          </IconButton>
                          <IconButton size="small" color="error" onClick={() => setDeletingStore(s)}>
                            <Delete fontSize="small" />
                          </IconButton>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!storesLoading && (stores ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} sx={{ py: 3, textAlign: "center", color: "text.secondary" }}>
                        No stores yet. Add one above.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStoresOpen(false)} color="inherit">Done</Button>
          <Button onClick={saveStore} variant="contained" disabled={storeSaving}>
            {storeSaving ? "Saving..." : editingStore ? "Save Changes" : "Add Store"}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!deletingStore}
        title="Delete Store"
        message={`Delete "${deletingStore?.name}"? Past sales will keep their location name.`}
        onConfirm={removeStore}
        onClose={() => setDeletingStore(null)}
      />
    </Box>
  );
}