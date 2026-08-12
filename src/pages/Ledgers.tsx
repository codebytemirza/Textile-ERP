import { formatCurrency } from "../lib/utils";
import { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot, getDocs, doc, writeBatch, increment, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { LedgerEntry, Factory, Customer, Supplier, WholesaleInvoice } from "../types";
import { Card, Input, Button } from "../components/ui";
import { format } from "date-fns";

export function Ledgers() {
  const [ledgers, setLedgers] = useState<LedgerEntry[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  
  const [activeTab, setActiveTab] = useState<'Factory' | 'Customer' | 'Supplier' | 'Cash'>('Cash');
  const [search, setSearch] = useState('');

  // Payment Recording state
  const [paymentType, setPaymentType] = useState<'Factory' | 'Customer' | 'Supplier' | null>(null);
  const [paymentEntityId, setPaymentEntityId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState(0);

  useEffect(() => {
    const unsubLedgers = onSnapshot(query(collection(db, "ledgers"), orderBy("date", "desc")), snap => {
      setLedgers(snap.docs.map(d => ({ id: d.id, ...d.data() } as LedgerEntry)));
    }, err => console.warn(err));
    const unsubFact = onSnapshot(query(collection(db, "factories")), snap => {
      setFactories(snap.docs.map(d => ({ id: d.id, ...d.data() } as Factory)));
    }, err => console.warn(err));
    const unsubCust = onSnapshot(query(collection(db, "customers")), snap => {
      setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));
    }, err => console.warn(err));
    const unsubSupp = onSnapshot(query(collection(db, "suppliers")), snap => {
      setSuppliers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Supplier)));
    }, err => console.warn(err));

    return () => { unsubLedgers(); unsubFact(); unsubCust(); unsubSupp(); };
  }, []);

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentType || !paymentEntityId || !paymentAmount) return;

    try {
      const batch = writeBatch(db);
      const ledgerRef = doc(collection(db, "ledgers"));
      const cashRef = doc(collection(db, "ledgers"));

      if (paymentType === 'Factory') {
        batch.set(ledgerRef, {
          type: 'Factory',
          referenceId: paymentEntityId,
          amount: -Number(paymentAmount),
          date: new Date(),
          description: `Payment to factory`
        }, err => console.warn(err));
        batch.set(cashRef, {
          type: 'Cash',
          amount: -Number(paymentAmount),
          date: new Date(),
          description: `Payment to factory`
        }, err => console.warn(err));
        
        const factRef = doc(db, "factories", paymentEntityId);
        batch.update(factRef, { balance: increment(-Number(paymentAmount)) });

      } else if (paymentType === 'Supplier') {
        batch.set(ledgerRef, {
          type: 'Supplier',
          referenceId: paymentEntityId,
          amount: -Number(paymentAmount),
          date: new Date(),
          description: `Payment to supplier`
        }, err => console.warn(err));
        batch.set(cashRef, {
          type: 'Cash',
          amount: -Number(paymentAmount),
          date: new Date(),
          description: `Payment to supplier`
        }, err => console.warn(err));
        
        const suppRef = doc(db, "suppliers", paymentEntityId);
        batch.update(suppRef, { balanceOwed: increment(-Number(paymentAmount)) });

      } else {
        batch.set(ledgerRef, {
          type: 'Customer',
          referenceId: paymentEntityId,
          amount: -Number(paymentAmount), 
          date: new Date(),
          description: `Payment received from customer`
        }, err => console.warn(err));
        batch.set(cashRef, {
          type: 'Cash',
          amount: Number(paymentAmount), 
          date: new Date(),
          description: `Payment received from customer`
        }, err => console.warn(err));

        const custRef = doc(db, "customers", paymentEntityId);
        batch.update(custRef, { balance: increment(-Number(paymentAmount)) });

        // Distribute payment to unpaid invoices (FIFO)
        const invoicesSnap = await getDocs(
          query(collection(db, "wholesale_invoices"), 
          where("customerId", "==", paymentEntityId),
          where("status", "!=", "Paid"))
        );
        
        let remainingPayment = Number(paymentAmount);
        
        // Sort by date manually as we have an inequality filter on status
        const unpaidInvoices = invoicesSnap.docs.map(d => ({ id: d.id, ...d.data() } as WholesaleInvoice))
          .sort((a, b) => {
            const dateA = (a.date as any).seconds || a.date;
            const dateB = (b.date as any).seconds || b.date;
            return dateA - dateB;
          }, err => console.warn(err));

        for (const inv of unpaidInvoices) {
          if (remainingPayment <= 0) break;
          const dueOnInvoice = inv.totalAmount - inv.paidAmount;
          if (dueOnInvoice > 0) {
            const amountToApply = Math.min(dueOnInvoice, remainingPayment);
            const newPaidAmount = inv.paidAmount + amountToApply;
            let newStatus = inv.status;
            if (newPaidAmount >= inv.totalAmount) newStatus = 'Paid';
            else if (newPaidAmount > 0) newStatus = 'Partial';
            
            const invRef = doc(db, "wholesale_invoices", inv.id!);
            batch.update(invRef, {
              paidAmount: newPaidAmount,
              status: newStatus
            }, err => console.warn(err));
            remainingPayment -= amountToApply;
          }
        }
      }

      await batch.commit();
      setPaymentType(null);
      setPaymentEntityId('');
      setPaymentAmount(0);
    } catch (err) {
      console.error(err);
    }
  };

  const filteredLedgers = ledgers.filter(l => l.type === activeTab && 
    (l.description.toLowerCase().includes(search.toLowerCase()) || 
     (l.referenceId && (factories.find(f => f.id === l.referenceId)?.name.toLowerCase().includes(search.toLowerCase()) || 
      customers.find(c => c.id === l.referenceId)?.name.toLowerCase().includes(search.toLowerCase())))
    )
  );

  // Calculate balances based on ledgers
  const calculateBalance = (type: 'Factory' | 'Customer', refId: string) => {
    const entries = ledgers.filter(l => l.type === type && l.referenceId === refId);
    return entries.reduce((sum, item) => sum + item.amount, 0);
  };

  const cashBalance = ledgers.filter(l => l.type === 'Cash').reduce((sum, item) => sum + item.amount, 0);

  const formatDate = (ts: any) => {
    if (!ts) return 'N/A';
    if (ts.seconds) return format(new Date(ts.seconds * 1000), 'MMM d, yyyy HH:mm');
    return format(new Date(ts), 'MMM d, yyyy HH:mm');
  }

  return (
    <div className="space-y-6 flex flex-col h-full">
      <div className="flex justify-between items-center shrink-0">
        <h1 className="text-2xl font-bold text-neutral-900">Ledgers & Accounts</h1>
        
        <div className="flex gap-2">
          <Button variant={activeTab === 'Cash' ? 'default' : 'outline'} onClick={() => setActiveTab('Cash')}>
            Cash Book ({formatCurrency(cashBalance)})
          </Button>
          <Button variant={activeTab === 'Factory' ? 'default' : 'outline'} onClick={() => setActiveTab('Factory')}>
            Factory Ledgers
          </Button>
          <Button variant={activeTab === 'Customer' ? 'default' : 'outline'} onClick={() => setActiveTab('Customer')}>
            Customer Ledgers
          </Button>
          <Button variant={activeTab === 'Supplier' ? 'default' : 'outline'} onClick={() => setActiveTab('Supplier')}>
            Supplier Ledgers
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 shrink-0">
        <Card className="md:col-span-3">
          <div className="p-4 border-b border-neutral-200 flex justify-between items-center bg-white">
            <h2 className="font-semibold text-lg">{activeTab} Ledger Entries</h2>
            <Input 
              placeholder="Search description or name..." 
              value={search} 
              onChange={e => setSearch(e.target.value)}
              className="w-64 h-9"
            />
          </div>
          <div className="overflow-y-auto max-h-[500px]">
            <table className="w-full text-sm text-left">
              <thead className="bg-neutral-50 text-neutral-600 font-medium sticky top-0 border-b border-neutral-200">
                <tr>
                  <th className="px-6 py-3">Date</th>
                  {activeTab !== 'Cash' && <th className="px-6 py-3">Entity</th>}
                  <th className="px-6 py-3">Description</th>
                  {activeTab === 'Cash' ? (
                    <>
                      <th className="px-6 py-3 text-right">In (+)</th>
                      <th className="px-6 py-3 text-right">Out (-)</th>
                    </>
                  ) : (
                    <th className="px-6 py-3 text-right">Amount</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {filteredLedgers.map(l => {
                  const name = activeTab === 'Factory' ? factories.find(f => f.id === l.referenceId)?.name : 
                               activeTab === 'Customer' ? customers.find(c => c.id === l.referenceId)?.name :
                               activeTab === 'Supplier' ? suppliers.find(s => s.id === l.referenceId)?.name : '';
                  return (
                    <tr key={l.id} className="hover:bg-neutral-50">
                      <td className="px-6 py-3 whitespace-nowrap text-neutral-500">{formatDate(l.date)}</td>
                      {activeTab !== 'Cash' && <td className="px-6 py-3 font-medium">{name || 'Unknown'}</td>}
                      <td className="px-6 py-3">{l.description}</td>
                      
                      {activeTab === 'Cash' ? (
                        <>
                          <td className="px-6 py-3 text-right text-green-600 font-medium">{l.amount > 0 ? formatCurrency(l.amount) : ''}</td>
                          <td className="px-6 py-3 text-right text-red-600 font-medium">{l.amount < 0 ? formatCurrency(Math.abs(l.amount)) : ''}</td>
                        </>
                      ) : (
                        <td className={`px-6 py-3 text-right font-medium ${l.amount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {l.amount > 0 ? '+' : '-'}{formatCurrency(Math.abs(l.amount))}
                        </td>
                      )}
                    </tr>
                  )
                })}
                {filteredLedgers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-neutral-500">
                      No entries found for {activeTab}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Sidebar Balances & Payments */}
        <div className="space-y-6">
          <Card>
            <div className="p-4 bg-neutral-900 text-white font-semibold rounded-t-lg">Record Payment</div>
            <div className="p-4 space-y-4 bg-white rounded-b-lg">
              <div>
                <label className="block text-xs font-medium mb-1">Payment Type</label>
                <select 
                  className="w-full h-9 rounded-md border border-neutral-300 px-3 text-sm focus:ring-2 focus:ring-neutral-400"
                  value={paymentType || ''}
                  onChange={e => {setPaymentType(e.target.value as any); setPaymentEntityId('');}}
                >
                  <option value="">Select...</option>
                  <option value="Factory">Pay Factory</option>
                  <option value="Supplier">Pay Supplier</option>
                  <option value="Customer">Receive from Customer</option>
                </select>
              </div>
              
              {paymentType && (
                <>
                  <div>
                    <label className="block text-xs font-medium mb-1">{paymentType}</label>
                    <select 
                      className="w-full h-9 rounded-md border border-neutral-300 px-3 text-sm focus:ring-2 focus:ring-neutral-400"
                      value={paymentEntityId}
                      onChange={e => setPaymentEntityId(e.target.value)}
                    >
                      <option value="">Select {paymentType}...</option>
                      {paymentType === 'Factory' ? 
                        factories.map(f => <option key={f.id} value={f.id}>{f.name}</option>) :
                       paymentType === 'Supplier' ?
                        suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>) :
                        customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)
                      }
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Amount (₨)</label>
                    <Input type="number" min="0" step="0.01" value={paymentAmount} onChange={e => setPaymentAmount(Number(e.target.value))} className="h-9" />
                  </div>
                  <Button className="w-full" onClick={handleRecordPayment} disabled={!paymentEntityId || !paymentAmount}>
                    Record {paymentType === 'Customer' ? 'Receipt' : 'Payment'}
                  </Button>
                </>
              )}
            </div>
          </Card>

          {activeTab !== 'Cash' && (
            <Card>
              <div className="p-4 bg-neutral-100 font-semibold rounded-t-lg border-b">
                Running Balances
              </div>
              <div className="p-4 space-y-3 bg-white rounded-b-lg max-h-[300px] overflow-y-auto">
                {(activeTab === 'Factory' ? factories : activeTab === 'Supplier' ? suppliers : customers).map(entity => {
                  const bal = activeTab === 'Supplier' ? (entity as Supplier).balanceOwed : (entity as any).balance;
                  if (bal === 0) return null;
                  return (
                    <div key={entity.id} className="flex justify-between items-center text-sm">
                      <span className="font-medium truncate pr-2">{entity.name}</span>
                      <span className={`font-semibold shrink-0 ${activeTab === 'Factory' || activeTab === 'Supplier' ? 'text-red-600' : 'text-green-600'}`}>
                        {formatCurrency(bal)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}