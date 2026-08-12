import { formatCurrency } from "../lib/utils";
import { useState, useEffect } from "react";
import { collection, query, doc, runTransaction, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { FinishedFabric } from "../types";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "../components/ui";
import { ShoppingCart } from "lucide-react";

export function RetailSales() {
  const [fabrics, setFabrics] = useState<FinishedFabric[]>([]);
  const [cart, setCart] = useState<{fabricId: string, type: string, quantity: number, price: number, costPerMeter: number}[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Card' | 'Mobile'>('Cash');
  const [shopLocation, setShopLocation] = useState('Main Store');

  // Load available fabrics
  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "finished_fabrics")), (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as FinishedFabric)).filter(f => f.quantityMeters > 0);
      setFabrics(items);
    }, err => console.warn(err));
    return () => unsub();
  }, []);

  const addToCart = (fabric: FinishedFabric) => {
    const existing = cart.find(c => c.fabricId === fabric.id);
    if (existing) {
      if (existing.quantity >= fabric.quantityMeters) return;
      setCart(cart.map(c => c.fabricId === fabric.id ? { ...c, quantity: c.quantity + 1 } : c));
    } else {
      // Set a default selling price (e.g. cost + 40% margin for retail)
      const defaultPrice = Number((fabric.costPerMeter * 1.4).toFixed(2));
      setCart([...cart, { fabricId: fabric.id!, type: fabric.fabricType, quantity: 1, price: defaultPrice, costPerMeter: fabric.costPerMeter }]);
    }
  };

  const updateCartItem = (id: string, field: 'quantity' | 'price', value: number) => {
    setCart(cart.map(c => c.fabricId === id ? { ...c, [field]: value } : c));
  };

  const removeCartItem = (id: string) => {
    setCart(cart.filter(c => c.fabricId !== id));
  };

  const totalAmount = cart.reduce((sum, item) => sum + (item.quantity * item.price), 0);

  const processSale = async () => {
    if (cart.length === 0) return;

    try {
      await runTransaction(db, async (transaction) => {
        // First read all required documents to ensure transaction safety
        const fabricDocs = await Promise.all(
          cart.map(item => transaction.get(doc(db, "finished_fabrics", item.fabricId)))
        );

        // Verify stock is sufficient
        for (let i = 0; i < cart.length; i++) {
          const item = cart[i];
          const fabricDoc = fabricDocs[i];
          if (!fabricDoc.exists()) {
            throw new Error(`Fabric item ${item.type} not found in database.`);
          }
          const currentStock = fabricDoc.data().quantityMeters;
          if (currentStock < item.quantity) {
            throw new Error(`Insufficient stock for ${item.type}. Available: ${currentStock}m, Requested: ${item.quantity}m.`);
          }
        }

        // Generate new document refs
        const saleRef = doc(collection(db, "retail_sales"));
        const ledgerRef = doc(collection(db, "ledgers"));

        // Proceed with updates
        for (let i = 0; i < cart.length; i++) {
          const item = cart[i];
          const fabricDoc = fabricDocs[i];
          const currentStock = fabricDoc.data().quantityMeters;
          transaction.update(fabricDoc.ref, { quantityMeters: currentStock - item.quantity });
        }

        // Create Sale Entry with snapshotted COGS
        transaction.set(saleRef, {
          date: new Date(),
          totalAmount,
          paymentMethod,
          shopLocation,
          items: cart.map(c => ({ 
            fabricId: c.fabricId, 
            quantity: c.quantity, 
            price: c.price,
            costAtSaleTime: c.costPerMeter 
          }))
        }, err => console.warn(err));

        // Update Cash Ledger
        transaction.set(ledgerRef, {
          type: 'Cash',
          transactionId: saleRef.id,
          amount: totalAmount, // positive because money received
          date: new Date(),
          description: `Retail POS Sale at ${shopLocation}`
        }, err => console.warn(err));
      }, err => console.warn(err));

      setCart([]);
      alert("Sale completed successfully!");
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Error processing sale");
    }
  };

  // Group fabrics for display
  const groupedFabrics = fabrics.reduce((acc, f) => {
    if (!acc[f.fabricType]) acc[f.fabricType] = [];
    acc[f.fabricType].push(f);
    return acc;
  }, {} as Record<string, FinishedFabric[]>);

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-8rem)]">
      {/* Products Grid */}
      <div className="flex-1 overflow-y-auto space-y-6">
        <h1 className="text-2xl font-bold text-neutral-900 sticky top-0 bg-neutral-50 pb-4 pt-2 z-10">Point of Sale</h1>
        
        {Object.entries(groupedFabrics).map(([type, items]) => (
          <div key={type} className="space-y-3">
            <h2 className="font-semibold text-neutral-700 border-b pb-1">{type}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {items.map(fabric => (
                <div 
                  key={fabric.id} 
                  onClick={() => addToCart(fabric)}
                  className="bg-white border border-neutral-200 rounded-lg p-4 cursor-pointer hover:border-blue-500 hover:shadow-md transition-all group"
                >
                  <div className="text-sm font-medium text-neutral-900 line-clamp-1">{type}</div>
                  <div className="text-xs text-neutral-500 mt-1">Lot: {fabric.lotId.slice(0,6)}...</div>
                  <div className="mt-3 flex justify-between items-end">
                    <div className="text-xs font-medium text-neutral-400">In Stock: {fabric.quantityMeters}m</div>
                    <div className="text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ShoppingCart size={16} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {fabrics.length === 0 && (
          <div className="text-center text-neutral-500 py-12">No inventory available for sale.</div>
        )}
      </div>

      {/* Cart Sidebar */}
      <div className="w-full lg:w-[400px] flex flex-col bg-white border border-neutral-200 rounded-lg shadow-sm overflow-hidden flex-shrink-0">
        <div className="p-4 border-b border-neutral-200 bg-neutral-900 text-white">
          <h2 className="font-semibold flex items-center gap-2">
            <ShoppingCart size={18} />
            Current Order
          </h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {cart.map(item => (
            <div key={item.fabricId} className="flex flex-col gap-2 p-3 border border-neutral-100 rounded-md bg-neutral-50">
              <div className="flex justify-between items-start">
                <span className="font-medium text-sm text-neutral-900">{item.type}</span>
                <button onClick={() => removeCartItem(item.fabricId)} className="text-red-500 hover:text-red-700 text-xs font-medium">Remove</button>
              </div>
              <div className="flex gap-2 items-center">
                <div className="flex-1">
                  <label className="text-[10px] uppercase text-neutral-500 font-bold tracking-wider">Meters</label>
                  <Input 
                    type="number" min="0.1" step="0.1" 
                    value={item.quantity} 
                    onChange={(e) => updateCartItem(item.fabricId, 'quantity', Number(e.target.value))}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="text-neutral-400">×</div>
                <div className="flex-1">
                  <label className="text-[10px] uppercase text-neutral-500 font-bold tracking-wider">Price/m</label>
                  <Input 
                    type="number" min="0" step="0.01" 
                    value={item.price} 
                    onChange={(e) => updateCartItem(item.fabricId, 'price', Number(e.target.value))}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="w-16 text-right font-medium text-neutral-900 pt-5">
                  {formatCurrency((item.quantity * item.price))}
                </div>
              </div>
            </div>
          ))}
          {cart.length === 0 && (
            <div className="text-center text-neutral-400 py-8 text-sm">
              Cart is empty. Select items to begin.
            </div>
          )}
        </div>

        <div className="p-4 border-t border-neutral-200 bg-neutral-50 space-y-4">
          <div className="flex justify-between items-center text-lg font-bold text-neutral-900">
            <span>Total:</span>
            <span>{formatCurrency(totalAmount)}</span>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium mb-1">Payment Method</label>
              <select 
                className="w-full h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value as any)}
              >
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
                <option value="Mobile">Mobile</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Location</label>
              <select 
                className="w-full h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                value={shopLocation}
                onChange={e => setShopLocation(e.target.value)}
              >
                <option value="Main Store">Main Store</option>
                <option value="Downtown Kiosk">Downtown Kiosk</option>
              </select>
            </div>
          </div>

          <Button 
            className="w-full h-12 text-lg font-semibold" 
            disabled={cart.length === 0}
            onClick={processSale}
          >
            Complete Sale
          </Button>
        </div>
      </div>
    </div>
  );
}