import { formatCurrency } from "../lib/utils";
import { useState, useEffect } from "react";
import { collection, query, onSnapshot, doc, writeBatch } from "firebase/firestore";
import { db } from "../lib/firebase";
import { YarnInventory, ProductionLot, FinishedFabric, RetailSale, WholesaleInvoice, Customer, Factory, Supplier } from "../types";
import { Card, CardContent, CardHeader, CardTitle, Button } from "../components/ui";
import { Package, Factory as FactoryIcon, Layers, TrendingUp, Coins } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

export function Dashboard() {
  const { user } = useAuth();
  const [yarn, setYarn] = useState<YarnInventory[]>([]);
  const [lots, setLots] = useState<ProductionLot[]>([]);
  const [fabrics, setFabrics] = useState<FinishedFabric[]>([]);
  const [retail, setRetail] = useState<RetailSale[]>([]);
  const [wholesale, setWholesale] = useState<WholesaleInvoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  useEffect(() => {
    const unsubs = [
      onSnapshot(query(collection(db, "yarn_inventory")), snap => setYarn(snap.docs.map(d => ({ id: d.id, ...d.data() } as YarnInventory))), err => console.warn(err)),
      onSnapshot(query(collection(db, "production_lots")), snap => setLots(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProductionLot))), err => console.warn(err)),
      onSnapshot(query(collection(db, "finished_fabrics")), snap => setFabrics(snap.docs.map(d => ({ id: d.id, ...d.data() } as FinishedFabric))), err => console.warn(err)),
      onSnapshot(query(collection(db, "retail_sales")), snap => setRetail(snap.docs.map(d => ({ id: d.id, ...d.data() } as RetailSale))), err => console.warn(err)),
      onSnapshot(query(collection(db, "wholesale_invoices")), snap => setWholesale(snap.docs.map(d => ({ id: d.id, ...d.data() } as WholesaleInvoice))), err => console.warn(err)),
      onSnapshot(query(collection(db, "customers")), snap => setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Customer))), err => console.warn(err)),
      onSnapshot(query(collection(db, "factories")), snap => setFactories(snap.docs.map(d => ({ id: d.id, ...d.data() } as Factory))), err => console.warn(err)),
      onSnapshot(query(collection(db, "suppliers")), snap => setSuppliers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Supplier))), err => console.warn(err))
    ];
    return () => unsubs.forEach(u => u());
  }, []);

  // Calculations
  const yarnValue = yarn.reduce((sum, y) => sum + (y.balanceKg * y.ratePerKg), 0);
  const fgValue = fabrics.reduce((sum, f) => sum + (f.quantityMeters * f.costPerMeter), 0);
  
  const activeLots = lots.filter(l => l.status !== 'Received in Stock');
  const lotStages = activeLots.reduce((acc, l) => {
    acc[l.status] = (acc[l.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  
  const thisMonthRetail = retail.filter(r => {
    const d = r.date?.seconds ? new Date(r.date.seconds * 1000) : new Date(r.date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });
  const retailSalesTotal = thisMonthRetail.reduce((sum, r) => sum + r.totalAmount, 0);

  const thisMonthWholesale = wholesale.filter(w => {
    const d = w.date?.seconds ? new Date(w.date.seconds * 1000) : new Date(w.date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });
  const wholesaleSalesTotal = thisMonthWholesale.reduce((sum, w) => sum + w.totalAmount, 0);

  // Profit Estimate (Sales - COGS)
  let retailCOGS = 0;
  thisMonthRetail.forEach(sale => {
    sale.items.forEach(item => {
      const fallbackFab = fabrics.find(f => f.id === item.fabricId);
      const cost = item.costAtSaleTime !== undefined ? item.costAtSaleTime : (fallbackFab ? fallbackFab.costPerMeter : 0);
      retailCOGS += cost * item.quantity;
    });
  });

  let wholesaleCOGS = 0;
  thisMonthWholesale.forEach(inv => {
    inv.items.forEach(item => {
      const fallbackFab = fabrics.find(f => f.id === item.fabricId);
      const cost = item.costAtSaleTime !== undefined ? item.costAtSaleTime : (fallbackFab ? fallbackFab.costPerMeter : 0);
      wholesaleCOGS += cost * item.quantity;
    });
  });

  const totalSales = retailSalesTotal + wholesaleSalesTotal;
  const totalCOGS = retailCOGS + wholesaleCOGS;
  const estimatedProfit = totalSales - totalCOGS;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-neutral-900">Dashboard</h1>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-full">
              <Package size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-500">Yarn Stock Value</p>
              <p className="text-2xl font-bold text-neutral-900">{formatCurrency(yarnValue)}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-purple-100 text-purple-600 rounded-full">
              <FactoryIcon size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-500">Lots in Production</p>
              <p className="text-2xl font-bold text-neutral-900">{activeLots.length}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-orange-100 text-orange-600 rounded-full">
              <Layers size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-500">Finished Goods Value</p>
              <p className="text-2xl font-bold text-neutral-900">{formatCurrency(fgValue)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-green-100 text-green-600 rounded-full">
              <TrendingUp size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-500">This Month Sales</p>
              <p className="text-2xl font-bold text-neutral-900">{formatCurrency(totalSales)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              <span>Financial Overview (This Month)</span>
              <Coins className="text-neutral-400" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-100">
                <p className="text-sm text-neutral-500 mb-1">Retail Sales</p>
                <p className="text-xl font-bold text-neutral-800">{formatCurrency(retailSalesTotal)}</p>
              </div>
              <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-100">
                <p className="text-sm text-neutral-500 mb-1">Wholesale Sales</p>
                <p className="text-xl font-bold text-neutral-800">{formatCurrency(wholesaleSalesTotal)}</p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg border border-green-100">
                <p className="text-sm text-green-600 mb-1">Estimated Profit</p>
                <p className="text-xl font-bold text-green-700">{formatCurrency(estimatedProfit)}</p>
              </div>
            </div>
            
            <h3 className="font-semibold text-neutral-700 mb-3">Production Pipeline</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(lotStages).map(([stage, count]) => (
                <div key={stage} className="flex-1 min-w-[120px] bg-neutral-900 text-white p-3 rounded-md text-center">
                  <div className="text-2xl font-bold">{count}</div>
                  <div className="text-xs text-neutral-400 mt-1 uppercase tracking-wider">{stage}</div>
                </div>
              ))}
              {activeLots.length === 0 && (
                <div className="w-full text-center py-6 text-neutral-500 border border-dashed border-neutral-300 rounded-md">
                  No lots currently in production.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-neutral-500 uppercase tracking-wider">Top Receivables (Customers Owe Us)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {customers.filter(c => c.balance > 0).sort((a,b) => b.balance - a.balance).slice(0,5).map(c => (
                  <div key={c.id} className="flex justify-between items-center">
                    <span className="font-medium text-sm">{c.name}</span>
                    <span className="text-green-600 font-semibold text-sm">{formatCurrency(c.balance)}</span>
                  </div>
                ))}
                {customers.filter(c => c.balance > 0).length === 0 && (
                  <p className="text-sm text-neutral-400">All customer accounts settled.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-neutral-500 uppercase tracking-wider">Top Payables (Factories)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {factories.filter(f => f.balance > 0).sort((a,b) => b.balance - a.balance).slice(0,5).map(f => (
                  <div key={f.id} className="flex justify-between items-center">
                    <span className="font-medium text-sm">{f.name}</span>
                    <span className="text-red-600 font-semibold text-sm">{formatCurrency(f.balance)}</span>
                  </div>
                ))}
                {factories.filter(f => f.balance > 0).length === 0 && (
                  <p className="text-sm text-neutral-400">All factory accounts settled.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-neutral-500 uppercase tracking-wider">Top Payables (Suppliers)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {suppliers.filter(s => s.balanceOwed > 0).sort((a,b) => b.balanceOwed - a.balanceOwed).slice(0,5).map(s => (
                  <div key={s.id} className="flex justify-between items-center">
                    <span className="font-medium text-sm">{s.name}</span>
                    <span className="text-red-600 font-semibold text-sm">{formatCurrency(s.balanceOwed)}</span>
                  </div>
                ))}
                {suppliers.filter(s => s.balanceOwed > 0).length === 0 && (
                  <p className="text-sm text-neutral-400">All supplier accounts settled.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}