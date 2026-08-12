export type Role = 'Admin' | 'Manager' | 'ShopStaff';

export interface User {
  id: string;
  email: string;
  role: Role;
  name: string;
}

export interface Supplier {
  id?: string;
  name: string;
  contact: string;
  balanceOwed: number;
}

export interface YarnInventory {
  id?: string;
  supplierId?: string;
  supplierName: string;
  yarnType: string;
  quantityKg: number;
  ratePerKg: number;
  totalCost: number;
  purchaseDate: Date;
  paymentStatus: 'Paid' | 'Partial' | 'Unpaid';
  balanceKg: number;
}

export interface Factory {
  id?: string;
  name: string;
  contact: string;
  type: 'Weaving' | 'Dyeing' | 'Both';
  balance: number;
}

export type ProductionStatus = 
  | 'Yarn Issued' 
  | 'At Weaving' 
  | 'Weaving Complete' 
  | 'Sent for Dyeing' 
  | 'Dyeing Complete' 
  | 'Received in Stock';

export interface ProductionLot {
  id?: string;
  lotNumber: string;
  yarnId: string;
  quantityIssued: number;
  factoryId: string;
  dateSent: Date;
  expectedFabricMeters: number;
  status: ProductionStatus;
  weavingCharges: number;
  dyeingCharges: number;
  actualFabricMeters: number | null;
  totalCost: number | null;
  costPerMeter: number | null;
}

export interface FinishedFabric {
  id?: string;
  lotId: string;
  fabricType: string;
  quantityMeters: number;
  costPerMeter: number;
}

export interface Customer {
  id?: string;
  name: string;
  contact: string;
  balance: number;
}

export interface RetailSaleItem {
  fabricId: string;
  quantity: number;
  price: number;
  costAtSaleTime?: number;
}

export interface RetailSale {
  id?: string;
  date: Date;
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
  id?: string;
  customerId: string;
  date: Date;
  totalAmount: number;
  paidAmount: number;
  status: 'Paid' | 'Partial' | 'Unpaid';
  dueDate: Date;
  items: WholesaleInvoiceItem[];
}

export interface LedgerEntry {
  id?: string;
  type: 'Factory' | 'Customer' | 'Cash' | 'Supplier';
  referenceId?: string; 
  transactionId?: string;
  amount: number;
  date: Date;
  description: string;
}