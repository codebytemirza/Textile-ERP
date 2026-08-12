import { formatCurrency } from "../lib/utils";
import { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot, addDoc, doc, updateDoc, writeBatch, increment } from "firebase/firestore";
import { db } from "../lib/firebase";
import { YarnInventory, Supplier } from "../types";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "../components/ui";
import { format } from "date-fns";
import { Plus } from "lucide-react";

export function YarnInventoryPage() {
  const [inventory, setInventory] = useState<YarnInventory[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState<Partial<YarnInventory>>({
    supplierId: '', yarnType: '', quantityKg: 0, ratePerKg: 0, paymentStatus: 'Unpaid'
  });
  const [newSupplierName, setNewSupplierName] = useState("");

  useEffect(() => {
    const unsubYarn = onSnapshot(query(collection(db, "yarn_inventory"), orderBy("purchaseDate", "desc")), (snapshot) => {
      const items: YarnInventory[] = [];
      snapshot.forEach((doc) => items.push({ id: doc.id, ...doc.data() } as YarnInventory));
      setInventory(items);
    }, (err) => console.warn(err));
    
    const unsubSupp = onSnapshot(collection(db, "suppliers"), (snapshot) => {
      setSuppliers(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Supplier)));
    }, (err) => console.warn(err));

    return () => { unsubYarn(); unsubSupp(); };
  }, []);

  const handleCreateSupplier = async () => {
    if (!newSupplierName) return;
    const batch = writeBatch(db);
    const suppRef = doc(collection(db, "suppliers"));
    batch.set(suppRef, { name: newSupplierName, contact: '', balanceOwed: 0 });
    await batch.commit();
    setNewSupplierName("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.supplierId || !formData.yarnType || !formData.quantityKg || !formData.ratePerKg) return;

    const supplier = suppliers.find(s => s.id === formData.supplierId);
    if (!supplier) return;

    const totalCost = Number(formData.quantityKg) * Number(formData.ratePerKg);
    const amountPaid = formData.paymentStatus === 'Paid' ? totalCost : (formData.paymentStatus === 'Partial' ? totalCost / 2 : 0);
    const balanceOwed = totalCost - amountPaid;

    const newEntry = {
      ...formData,
      supplierName: supplier.name,
      quantityKg: Number(formData.quantityKg),
      ratePerKg: Number(formData.ratePerKg),
      totalCost,
      balanceKg: Number(formData.quantityKg),
      purchaseDate: new Date(),
    };

    try {
      const batch = writeBatch(db);
      
      const yarnRef = doc(collection(db, "yarn_inventory"));
      batch.set(yarnRef, newEntry);
      
      // Update supplier balance
      if (balanceOwed > 0) {
        const suppRef = doc(db, "suppliers", formData.supplierId);
        batch.update(suppRef, { balanceOwed: increment(balanceOwed) });
      }

      // Ledger entries
      const ledgerRef = doc(collection(db, "ledgers"));
      batch.set(ledgerRef, {
        type: 'Supplier',
        referenceId: formData.supplierId,
        transactionId: yarnRef.id,
        amount: balanceOwed, // Positive means we owe them
        date: new Date(),
        description: `Yarn Purchase: ${formData.yarnType}`
      });

      if (amountPaid > 0) {
        const cashRef = doc(collection(db, "ledgers"));
        batch.set(cashRef, {
          type: 'Cash',
          amount: -amountPaid,
          date: new Date(),
          description: `Payment to ${supplier.name} for Yarn ${formData.yarnType}`
        });
      }

      await batch.commit();
      setIsAdding(false);
      setFormData({ supplierId: '', yarnType: '', quantityKg: 0, ratePerKg: 0, paymentStatus: 'Unpaid' });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-neutral-900">Yarn Inventory</h1>
        <Button onClick={() => setIsAdding(!isAdding)}>
          <Plus size={16} className="mr-2" /> Add Purchase
        </Button>
      </div>

      {isAdding && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>New Yarn Purchase</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-medium mb-1">Supplier</label>
                  <select 
                    className="flex h-10 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                    value={formData.supplierId}
                    onChange={e => setFormData({...formData, supplierId: e.target.value})}
                    required
                  >
                    <option value="">-- Select Supplier --</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Yarn Type/Quality</label>
                  <Input value={formData.yarnType} onChange={e => setFormData({...formData, yarnType: e.target.value})} required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Quantity (Kg)</label>
                  <Input type="number" min="0" step="0.1" value={formData.quantityKg} onChange={e => setFormData({...formData, quantityKg: e.target.value})} required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Rate per Kg</label>
                  <Input type="number" min="0" step="0.01" value={formData.ratePerKg} onChange={e => setFormData({...formData, ratePerKg: e.target.value})} required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Payment Status</label>
                  <select 
                    className="flex h-10 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                    value={formData.paymentStatus}
                    onChange={e => setFormData({...formData, paymentStatus: e.target.value as any})}
                  >
                    <option value="Paid">Paid</option>
                    <option value="Partial">Partial</option>
                    <option value="Unpaid">Unpaid</option>
                  </select>
                </div>
                <div className="col-span-1 md:col-span-2 flex justify-end mt-4">
                  <Button type="submit">Save Entry</Button>
                </div>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Quick Add Supplier</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Supplier Name</label>
                  <Input value={newSupplierName} onChange={e => setNewSupplierName(e.target.value)} placeholder="e.g. Reliance Spinners" />
                </div>
                <Button onClick={handleCreateSupplier} variant="outline" className="w-full">Add Supplier</Button>
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
                <th className="px-6 py-3">Supplier</th>
                <th className="px-6 py-3">Yarn Type</th>
                <th className="px-6 py-3 text-right">Quantity (Kg)</th>
                <th className="px-6 py-3 text-right">Balance (Kg)</th>
                <th className="px-6 py-3 text-right">Rate</th>
                <th className="px-6 py-3 text-right">Total Cost</th>
                <th className="px-6 py-3">Payment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {inventory.map(item => (
                <tr key={item.id} className="hover:bg-neutral-50">
                  <td className="px-6 py-4">
                    {item.purchaseDate?.seconds ? format(new Date(item.purchaseDate.seconds * 1000), 'MMM d, yyyy') : 'N/A'}
                  </td>
                  <td className="px-6 py-4">{item.supplierName}</td>
                  <td className="px-6 py-4">{item.yarnType}</td>
                  <td className="px-6 py-4 text-right">{item.quantityKg}</td>
                  <td className="px-6 py-4 text-right font-medium text-blue-600">{item.balanceKg}</td>
                  <td className="px-6 py-4 text-right">{formatCurrency(item.ratePerKg)}</td>
                  <td className="px-6 py-4 text-right">{formatCurrency(item.totalCost)}</td>
                  <td className="px-6 py-4">
                    <span className={
                      item.paymentStatus === 'Paid' ? 'text-green-600 bg-green-50 px-2 py-1 rounded-full text-xs font-medium' :
                      item.paymentStatus === 'Partial' ? 'text-yellow-600 bg-yellow-50 px-2 py-1 rounded-full text-xs font-medium' :
                      'text-red-600 bg-red-50 px-2 py-1 rounded-full text-xs font-medium'
                    }>
                      {item.paymentStatus}
                    </span>
                  </td>
                </tr>
              ))}
              {inventory.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-neutral-500">
                    No yarn inventory found. Add a purchase to get started.
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