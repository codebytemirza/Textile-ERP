export type Role = 'Admin' | 'Manager' | 'ShopStaff';

export interface User {
  id: string;
  email: string;
  role: Role;
  name: string;
  createdAt?: number;
}

export type WeightUnit = 'kg' | 'lbs';

export interface Supplier {
  id: string;
  name: string;
  contact: string;
  balanceOwed: number;
  createdAt?: number;
}

export interface YarnInventory {
  id: string;
  supplierId?: string;
  supplierName: string;
  yarnType: string;
  quantityKg: number;
  quantityLbs: number;
  unit: WeightUnit;
  ratePerKg: number;
  totalCost: number;
  purchaseDate: number;
  paymentStatus: 'Paid' | 'Partial' | 'Unpaid';
  balanceKg: number;
  balanceLbs: number;
  createdAt?: number;
}

export interface Factory {
  id: string;
  name: string;
  contact: string;
  type: 'Weaving' | 'Dyeing' | 'Both';
  balance: number;
  createdAt?: number;
}

export type ProductionStatus =
  | 'Yarn Issued'
  | 'At Weaving'
  | 'Weaving Complete'
  | 'Sent for Dyeing'
  | 'Dyeing Complete'
  | 'Received in Stock';

export interface ProductionLot {
  id: string;
  lotNumber: string;
  yarnId: string;
  quantityIssuedKg: number;
  factoryId: string;
  dateSent: number;
  expectedFabricMeters: number;
  status: ProductionStatus;
  weavingCharges: number;
  dyeingCharges: number;
  weavingMeters: number | null;
  dyeingMeters: number | null;
  dyeingFactoryId?: string | null;
  actualFabricMeters: number | null;
  totalCost: number | null;
  costPerMeter: number | null;
  createdAt?: number;
}

export interface FinishedFabric {
  id: string;
  lotId: string;
  fabricType: string;
  quantityMeters: number;
  costPerMeter: number;
  createdAt?: number;
}

export interface Customer {
  id: string;
  name: string;
  contact: string;
  balance: number;
  createdAt?: number;
}

export interface Store {
  id: string;
  name: string;
  address?: string;
  active: boolean;
  createdAt?: number;
}

export interface RetailSaleItem {
  fabricId: string;
  quantity: number;
  price: number;
  costAtSaleTime?: number;
}

export interface RetailSale {
  id: string;
  date: number;
  totalAmount: number;
  paymentMethod: 'Cash' | 'Card' | 'Mobile';
  shopLocation: string;
  items: RetailSaleItem[];
}

export interface WholesaleInvoiceItem {
  fabricId: string;
  quantity: number;
  price: number;
  costAtSaleTime?: number;
}

export interface WholesaleInvoice {
  id: string;
  customerId: string;
  date: number;
  totalAmount: number;
  paidAmount: number;
  status: 'Paid' | 'Partial' | 'Unpaid';
  dueDate: number;
  items: WholesaleInvoiceItem[];
}

export interface LedgerEntry {
  id: string;
  type: 'Factory' | 'Customer' | 'Cash' | 'Supplier';
  referenceId?: string;
  transactionId?: string;
  amount: number;
  date: number;
  description: string;
}
