import { api } from "./client";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "Admin" | "Manager" | "ShopStaff";
}

export interface AuthResponse {
  user: SessionUser;
  token: string;
}

export const authApi = {
  login: (email: string, password: string) =>
    api.post<AuthResponse>("/api/auth/login", { email, password }),
  register: (email: string, password: string, name: string) =>
    api.post<AuthResponse>("/api/auth/register", { email, password, name }),
  logout: () => api.post<{ ok: boolean }>("/api/auth/logout"),
  me: () => api.get<{ user: SessionUser }>("/api/auth/me"),
  demo: () => api.get<{ email: string; password: string }>("/api/auth/demo"),
};

export const dashboardApi = {
  get: () => api.get<DashboardData>("/api/dashboard"),
};

export interface DashboardData {
  yarnValue: number;
  fgValue: number;
  activeLots: number;
  lotStages: Record<string, number>;
  retailSalesTotal: number;
  wholesaleSalesTotal: number;
  totalSales: number;
  estimatedProfit: number;
  cashBalance: number;
  topReceivables: { id: string; name: string; balance: number }[];
  topFactoryPayables: { id: string; name: string; balance: number }[];
  topSupplierPayables: { id: string; name: string; balanceOwed: number }[];
  sales7d: { date: string; retail: number; wholesale: number }[];
}

export const businessApi = {
  yarnPurchase: (body: Record<string, unknown>) =>
    api.post<{ ok: boolean }>("/api/yarn/purchase", body),
  createProductionLot: (body: Record<string, unknown>) =>
    api.post<Record<string, unknown>>("/api/production-lots", body),
  advanceLot: (id: string) =>
    api.post<{ ok: boolean; status: string }>(`/api/production-lots/${id}/advance`, {}),
  recordWeavingOutput: (id: string, meters: number) =>
    api.post<{ ok: boolean; status: string }>(`/api/production-lots/${id}/weaving-output`, { meters }),
  recordDyeingOutput: (id: string, meters: number) =>
    api.post<{ ok: boolean; status: string }>(`/api/production-lots/${id}/dyeing-output`, { meters }),
  transferToDyeing: (id: string, body: { dyeingFactoryId?: string; dyeingCharges?: number }) =>
    api.post<{ ok: boolean; status: string }>(`/api/production-lots/${id}/transfer-to-dyeing`, body),
  receiveLotStock: (id: string, body: Record<string, unknown>) =>
    api.post<{ ok: boolean }>(`/api/production-lots/${id}/receive-stock`, body),
  retailSale: (body: Record<string, unknown>) =>
    api.post<Record<string, unknown>>("/api/retail-sales", body),
  updateRetailSale: (id: string, body: Record<string, unknown>) =>
    api.put<Record<string, unknown>>(`/api/retail-sales/${id}`, body),
  deleteRetailSale: (id: string) =>
    api.del<{ ok: boolean }>(`/api/retail-sales/${id}`),
  deleteProductionLot: (id: string) =>
    api.del<{ ok: boolean }>(`/api/production-lots/${id}`),
  wholesaleInvoice: (body: Record<string, unknown>) =>
    api.post<Record<string, unknown>>("/api/wholesale-invoices", body),
  payment: (body: { type: string; entityId: string; amount: number }) =>
    api.post<{ ok: boolean }>("/api/payments", body),
  seed: () => api.post<{ ok: boolean }>("/api/seed"),
  seedDelete: () => api.post<{ ok: boolean }>("/api/seed/delete"),
};

/** Generic CRUD for a collection (suppliers, customers, factories, ...). */
export function collectionApi<T>(name: string) {
  return {
    list: () => api.get<T[]>(`/api/${name}`),
    get: (id: string) => api.get<T>(`/api/${name}/${id}`),
    create: (body: Partial<T> & Record<string, unknown>) =>
      api.post<T>(`/api/${name}`, body),
    update: (id: string, body: Partial<T> & Record<string, unknown>) =>
      api.put<T>(`/api/${name}/${id}`, body),
    remove: (id: string) => api.del<{ ok: boolean }>(`/api/${name}/${id}`),
  };
}
