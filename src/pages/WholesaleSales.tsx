import { formatCurrency } from "../lib/utils";
import { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot, doc, writeBatch, runTransaction } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Customer, WholesaleInvoice, FinishedFabric } from "../types";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "../components/ui";
import { format } from "date-fns";
import { Plus } from "lucide-react";

export function WholesaleSales() {
  const [invoices, setInvoices] = useState<WholesaleInvoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [fabrics, setFabrics] = useState<FinishedFabric[]>([]);
  
  const [isAddingInvoice, setIsAddingInvoice] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  
  const [formData, setFormData] = useState({
    customerId: "",
    fabricId: "",
    quantity: 0,
    price: 0,
    paidAmount: 0,
    dueDate: ""
  });

  useEffect(() => {
    // Invoices
    const unsubInvoices = onSnapshot(query(collection(db, "wholesale_invoices"), orderBy("date", "desc")), snap => {
      setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() } as WholesaleInvoice)));
    }, err => console.warn(err));
    // Customers
    const unsubCustomers = onSnapshot(query(collection(db, "customers")), snap => {
      setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));
    }, err => console.warn(err));
    // Fabrics
    const unsubFabrics = onSnapshot(query(collection(db, "finished_fabrics")), snap => {
      setFabrics(snap.docs.map(d => ({ id: d.id, ...d.data() } as FinishedFabric)).filter(f => f.quantityMeters > 0));
    }, err => console.warn(err));

    return () => { unsubInvoices(); unsubCustomers(); unsubFabrics(); };
  }, []);

  const handleCreateCustomer = async () => {
    if (!newCustomerName) return;
    const batch = writeBatch(db);
    const custRef = doc(collection(db, "customers"));
    batch.set(custRef, { name: newCustomerName, contact: '', balance: 0 });
    await batch.commit();
    setNewCustomerName("");
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customerId || !formData.fabricId || !formData.quantity || !formData.price || !formData.dueDate) return;

    const totalAmount = Number(formData.quantity) * Number(formData.price);
    const paidAmount = Number(formData.paidAmount);
    const dueAmount = totalAmount - paidAmount;
    
    let status: 'Paid' | 'Partial' | 'Unpaid' = 'Unpaid';
    if (paidAmount >= totalAmount) status = 'Paid';
    else if (paidAmount > 0) status = 'Partial';

    try {
      await runTransaction(db, async (transaction) => {
        const fabricRef = doc(db, "finished_fabrics", formData.fabricId);
        const fabricDoc = await transaction.get(fabricRef);
        
        if (!fabricDoc.exists()) {
          throw new Error("Fabric not found.");
        }
        
        const fabricData = fabricDoc.data() as FinishedFabric;
        const currentStock = fabricData.quantityMeters;
        const reqQuantity = Number(formData.quantity);
        
        if (currentStock < reqQuantity) {
          throw new Error(`Insufficient fabric inventory. Available: ${currentStock}m, Requested: ${reqQuantity}m.`);
        }

        const invRef = doc(collection(db, "wholesale_invoices"));
        const custRef = doc(db, "customers", formData.customerId);
        const custDoc = await transaction.get(custRef);
        
        if (!custDoc.exists()) {
          throw new Error("Customer not found.");
        }
        
        const currentBalance = custDoc.data().balance || 0;

        // 1. Deduct inventory
        transaction.update(fabricRef, { quantityMeters: currentStock - reqQuantity });

        // 2. Create Invoice
        transaction.set(invRef, {
          customerId: formData.customerId,
          date: new Date(),
          totalAmount,
          paidAmount,
          status,
          dueDate: new Date(formData.dueDate),
          items: [{ 
            fabricId: formData.fabricId, 
            quantity: reqQuantity, 
            price: Number(formData.price),
            costAtSaleTime: fabricData.costPerMeter
          }]
        }, err => console.warn(err));

        // 3. Update Customer Balance
        transaction.update(custRef, { balance: currentBalance + dueAmount });

        // 4. Update Customer Ledger
        const ledgerRef = doc(collection(db, "ledgers"));
        transaction.set(ledgerRef, {
          type: 'Customer',
          referenceId: formData.customerId,
          transactionId: invRef.id,
          amount: dueAmount, // Customer owes this much
          date: new Date(),
          description: `Wholesale Invoice for ${fabricData.fabricType}`
        }, err => console.warn(err));

        // 5. Update Cash Ledger if anything paid
        if (paidAmount > 0) {
          const cashLedgerRef = doc(collection(db, "ledgers"));
          transaction.set(cashLedgerRef, {
            type: 'Cash',
            transactionId: invRef.id,
            amount: paidAmount, // Money in
            date: new Date(),
            description: `Payment received for wholesale invoice`
          }, err => console.warn(err));
        }
      }, err => console.warn(err));

      setIsAddingInvoice(false);
      setFormData({ customerId: "", fabricId: "", quantity: 0, price: 0, paidAmount: 0, dueDate: "" });
      alert("Invoice created successfully!");
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Error creating invoice");
    }
  };

  const formatDate = (ts: any) => {
    if (!ts) return 'N/A';
    if (ts.seconds) return format(new Date(ts.seconds * 1000), 'MMM d, yyyy');
    return format(new Date(ts), 'MMM d, yyyy');
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-neutral-900">Wholesale Invoices</h1>
        <Button onClick={() => setIsAddingInvoice(!isAddingInvoice)}>
          <Plus size={16} className="mr-2" /> New Invoice
        </Button>
      </div>

      {isAddingInvoice && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Create Invoice</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateInvoice} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-medium mb-1">Customer</label>
                  <select 
                    className="flex h-10 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                    value={formData.customerId}
                    onChange={e => setFormData({...formData, customerId: e.target.value})}
                    required
                  >
                    <option value="">-- Select Customer --</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-medium mb-1">Select Fabric</label>
                  <select 
                    className="flex h-10 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                    value={formData.fabricId}
                    onChange={e => {
                      const f = fabrics.find(fab => fab.id === e.target.value);
                      setFormData({...formData, fabricId: e.target.value, price: f ? Number((f.costPerMeter * 1.3).toFixed(2)) : 0 }); // auto-suggest 30% margin
                    }}
                    required
                  >
                    <option value="">-- Select Fabric --</option>
                    {fabrics.map(f => <option key={f.id} value={f.id!}>{f.fabricType} (Cost: {formatCurrency(f.costPerMeter)}/m | Stock: {f.quantityMeters}m)</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Quantity (Meters)</label>
                  <Input type="number" min="0.1" step="0.1" value={formData.quantity} onChange={e => setFormData({...formData, quantity: e.target.value as any})} required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Selling Rate (₨/m)</label>
                  <Input type="number" min="0" step="0.01" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value as any})} required />
                </div>
                
                <div className="col-span-1 md:col-span-2 pt-2 border-t mt-2">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium text-neutral-700">Total Amount:</span>
                    <span className="text-lg font-bold">{formatCurrency((Number(formData.quantity) * Number(formData.price)))}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Amount Paid Now (₨)</label>
                  <Input type="number" min="0" step="0.01" value={formData.paidAmount} onChange={e => setFormData({...formData, paidAmount: e.target.value as any})} required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Due Date (for balance)</label>
                  <Input type="date" value={formData.dueDate} onChange={e => setFormData({...formData, dueDate: e.target.value})} required={Number(formData.paidAmount) < (Number(formData.quantity) * Number(formData.price))} />
                </div>

                <div className="col-span-1 md:col-span-2 flex justify-end mt-4">
                  <Button type="submit" className="w-full md:w-auto">Generate Invoice</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Add Customer</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Business Name</label>
                  <Input value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)} placeholder="e.g. ABC Textiles" />
                </div>
                <Button onClick={handleCreateCustomer} variant="outline" className="w-full">Add Customer</Button>
              </div>

              <div className="mt-8">
                <h4 className="text-sm font-medium text-neutral-500 uppercase tracking-wider mb-3">Top Receivables</h4>
                <div className="space-y-3">
                  {customers.filter(c => c.balance > 0).sort((a,b) => b.balance - a.balance).slice(0,5).map(c => (
                    <div key={c.id} className="flex justify-between items-center text-sm">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-red-600 font-semibold">{formatCurrency(c.balance)}</span>
                    </div>
                  ))}
                  {customers.filter(c => c.balance > 0).length === 0 && (
                    <div className="text-sm text-neutral-400">No outstanding balances.</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-neutral-50 text-neutral-600 font-medium border-b border-neutral-200">
              <tr>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Customer</th>
                <th className="px-6 py-3 text-right">Total Amount</th>
                <th className="px-6 py-3 text-right">Paid</th>
                <th className="px-6 py-3 text-right">Balance Due</th>
                <th className="px-6 py-3">Due Date</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {invoices.map(inv => {
                const customer = customers.find(c => c.id === inv.customerId);
                const balance = inv.totalAmount - inv.paidAmount;
                return (
                  <tr key={inv.id} className="hover:bg-neutral-50">
                    <td className="px-6 py-4">{formatDate(inv.date)}</td>
                    <td className="px-6 py-4 font-medium">{customer?.name || 'Unknown'}</td>
                    <td className="px-6 py-4 text-right">{formatCurrency(inv.totalAmount)}</td>
                    <td className="px-6 py-4 text-right text-green-600">{formatCurrency(inv.paidAmount)}</td>
                    <td className="px-6 py-4 text-right text-red-600 font-medium">{formatCurrency(balance)}</td>
                    <td className="px-6 py-4">{balance > 0 ? formatDate(inv.dueDate) : '-'}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                        inv.status === 'Paid' ? 'bg-green-100 text-green-700' :
                        inv.status === 'Partial' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-neutral-500">
                    No wholesale invoices found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}