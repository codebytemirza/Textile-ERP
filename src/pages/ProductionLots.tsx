import { formatCurrency } from "../lib/utils";
import { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot, doc, writeBatch, getDocs, updateDoc, increment, runTransaction } from "firebase/firestore";
import { db } from "../lib/firebase";
import { ProductionLot, YarnInventory, Factory, ProductionStatus } from "../types";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "../components/ui";
import { format } from "date-fns";
import { Plus, ArrowRight } from "lucide-react";

const STATUSES: ProductionStatus[] = [
  'Yarn Issued', 'At Weaving', 'Weaving Complete', 'Sent for Dyeing', 'Dyeing Complete', 'Received in Stock'
];

export function ProductionLots() {
  const [lots, setLots] = useState<ProductionLot[]>([]);
  const [yarns, setYarns] = useState<YarnInventory[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState<Partial<ProductionLot>>({
    yarnId: '', quantityIssued: 0, factoryId: '', expectedFabricMeters: 0, weavingCharges: 0, dyeingCharges: 0
  });
  
  // For closing a lot
  const [closingLotId, setClosingLotId] = useState<string | null>(null);
  const [actualMeters, setActualMeters] = useState<number>(0);
  const [fabricType, setFabricType] = useState<string>('');

  useEffect(() => {
    const unsubLots = onSnapshot(query(collection(db, "production_lots"), orderBy("dateSent", "desc")), snap => {
      setLots(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProductionLot)));
    }, err => console.warn(err));
    
    // Fetch active yarn inventory
    getDocs(collection(db, "yarn_inventory")).then(snap => {
      setYarns(snap.docs.map(d => ({ id: d.id, ...d.data() } as YarnInventory)).filter(y => y.balanceKg > 0));
    });

    // Fetch factories
    getDocs(collection(db, "factories")).then(snap => {
      setFactories(snap.docs.map(d => ({ id: d.id, ...d.data() } as Factory)));
    });

    return () => unsubLots();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.yarnId || !formData.factoryId || !formData.quantityIssued) return;

    try {
      await runTransaction(db, async (transaction) => {
        const yarnRef = doc(db, "yarn_inventory", formData.yarnId as string);
        const yarnDoc = await transaction.get(yarnRef);
        
        if (!yarnDoc.exists()) {
          throw new Error("Yarn not found.");
        }
        
        const currentBalance = yarnDoc.data().balanceKg;
        const requestedQuantity = Number(formData.quantityIssued);
        
        if (currentBalance < requestedQuantity) {
          throw new Error(`Insufficient yarn balance. Available: ${currentBalance}kg, Requested: ${requestedQuantity}kg.`);
        }

        const lotRef = doc(collection(db, "production_lots"));
        const lotNum = `LOT-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
        
        transaction.set(lotRef, {
          ...formData,
          lotNumber: lotNum,
          quantityIssued: requestedQuantity,
          expectedFabricMeters: Number(formData.expectedFabricMeters),
          weavingCharges: Number(formData.weavingCharges),
          dyeingCharges: Number(formData.dyeingCharges),
          status: 'Yarn Issued',
          dateSent: new Date(),
          actualFabricMeters: null,
          totalCost: null,
          costPerMeter: null
        });

        // Deduct yarn
        transaction.update(yarnRef, {
          balanceKg: currentBalance - requestedQuantity
        });
      });

      setIsAdding(false);
      setFormData({ yarnId: '', quantityIssued: 0, factoryId: '', expectedFabricMeters: 0, weavingCharges: 0, dyeingCharges: 0 });
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Error issuing yarn");
    }
  };

  const advanceStatus = async (lot: ProductionLot) => {
    const currentIndex = STATUSES.indexOf(lot.status);
    if (currentIndex < STATUSES.length - 2) {
      const nextStatus = STATUSES[currentIndex + 1];
      await updateDoc(doc(db, "production_lots", lot.id!), { status: nextStatus });
    } else if (currentIndex === STATUSES.length - 2) {
      // It's at 'Dyeing Complete', next is 'Received in Stock'
      setClosingLotId(lot.id!);
      setActualMeters(lot.expectedFabricMeters);
    }
  };

  const receiveInStock = async () => {
    if (!closingLotId || !actualMeters || !fabricType) return;
    
    const lot = lots.find(l => l.id === closingLotId);
    if (!lot) return;

    // Calculate total cost
    // 1. Yarn cost
    const yarnDoc = await getDocs(query(collection(db, "yarn_inventory")));
    const yarn = yarnDoc.docs.find(d => d.id === lot.yarnId)?.data() as YarnInventory;
    const yarnCost = yarn ? yarn.ratePerKg * lot.quantityIssued : 0;
    
    // 2. Total cost
    const totalCost = yarnCost + Number(lot.weavingCharges) + Number(lot.dyeingCharges);
    const costPerMeter = actualMeters > 0 ? totalCost / actualMeters : 0;

    const batch = writeBatch(db);
    
    // Update Lot
    const lotRef = doc(db, "production_lots", closingLotId);
    batch.update(lotRef, {
      status: 'Received in Stock',
      actualFabricMeters: Number(actualMeters),
      totalCost,
      costPerMeter
    });

    // Add to Finished Goods
    const fgRef = doc(collection(db, "finished_fabrics"));
    batch.set(fgRef, {
      lotId: closingLotId,
      fabricType,
      quantityMeters: Number(actualMeters),
      costPerMeter
    });

    // Factory Ledgers (Assuming factory did both weaving and dyeing for simplicity of MVP)
    const factoryRef = doc(db, "factories", lot.factoryId);
    const totalFactoryCharges = Number(lot.weavingCharges) + Number(lot.dyeingCharges);
    batch.update(factoryRef, {
      balance: increment(totalFactoryCharges)
    });

    const ledgerRef = doc(collection(db, "ledgers"));
    batch.set(ledgerRef, {
      type: 'Factory',
      referenceId: lot.factoryId,
      transactionId: closingLotId,
      amount: totalFactoryCharges,
      date: new Date(),
      description: `Job work charges for ${lot.lotNumber}`
    });

    await batch.commit();
    setClosingLotId(null);
    setActualMeters(0);
    setFabricType('');
  };

  const formatDate = (ts: any) => {
    if (!ts) return 'N/A';
    if (ts.seconds) return format(new Date(ts.seconds * 1000), 'MMM d, yy');
    return format(new Date(ts), 'MMM d, yy');
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-neutral-900">Production Lots</h1>
        <Button onClick={() => setIsAdding(!isAdding)}>
          <Plus size={16} className="mr-2" /> New Lot
        </Button>
      </div>

      {isAdding && (
        <Card>
          <CardHeader>
            <CardTitle>Create Production Lot</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Select Yarn</label>
                <select 
                  className="flex h-10 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                  value={formData.yarnId}
                  onChange={e => setFormData({...formData, yarnId: e.target.value})}
                  required
                >
                  <option value="">-- Select Yarn --</option>
                  {yarns.map(y => (
                    <option key={y.id} value={y.id}>{y.yarnType} (Bal: {y.balanceKg} kg)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Quantity Issued (Kg)</label>
                <Input type="number" min="0.1" step="0.1" value={formData.quantityIssued} onChange={e => setFormData({...formData, quantityIssued: e.target.value})} required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Assign Factory</label>
                <select 
                  className="flex h-10 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                  value={formData.factoryId}
                  onChange={e => setFormData({...formData, factoryId: e.target.value})}
                  required
                >
                  <option value="">-- Select Factory --</option>
                  {factories.map(f => (
                    <option key={f.id} value={f.id}>{f.name} ({f.type})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Expected Output (Meters)</label>
                <Input type="number" min="0" value={formData.expectedFabricMeters} onChange={e => setFormData({...formData, expectedFabricMeters: e.target.value})} required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Weaving Charges (₨)</label>
                <Input type="number" min="0" step="0.01" value={formData.weavingCharges} onChange={e => setFormData({...formData, weavingCharges: e.target.value})} required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Dyeing Charges (₨)</label>
                <Input type="number" min="0" step="0.01" value={formData.dyeingCharges} onChange={e => setFormData({...formData, dyeingCharges: e.target.value})} required />
              </div>
              
              <div className="flex items-end">
                <Button type="submit" className="w-full">Create Lot</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {closingLotId && (
        <Card className="border-blue-200 shadow-md ring-1 ring-blue-500">
          <CardHeader className="bg-blue-50 pb-4">
            <CardTitle>Receive Lot in Stock</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-sm font-medium mb-1">Fabric Type / Design Name</label>
                <Input value={fabricType} onChange={e => setFabricType(e.target.value)} placeholder="e.g. Cotton Twill - Red" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Actual Output (Meters)</label>
                <Input type="number" min="0" value={actualMeters} onChange={e => setActualMeters(Number(e.target.value))} required />
              </div>
              <div className="flex gap-2">
                <Button onClick={receiveInStock} className="flex-1 bg-blue-600 hover:bg-blue-700">Confirm & Costing</Button>
                <Button variant="outline" onClick={() => setClosingLotId(null)}>Cancel</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-neutral-50 text-neutral-600 font-medium border-b border-neutral-200">
              <tr>
                <th className="px-6 py-3">Lot #</th>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Yarn (Kg)</th>
                <th className="px-6 py-3">Expected (m)</th>
                <th className="px-6 py-3">Charges (W+D)</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {lots.map(lot => {
                const factory = factories.find(f => f.id === lot.factoryId);
                return (
                  <tr key={lot.id} className="hover:bg-neutral-50">
                    <td className="px-6 py-4 font-medium text-neutral-900">{lot.lotNumber}</td>
                    <td className="px-6 py-4">{formatDate(lot.dateSent)}</td>
                    <td className="px-6 py-4">{lot.quantityIssued} kg</td>
                    <td className="px-6 py-4">{lot.expectedFabricMeters} m</td>
                    <td className="px-6 py-4">{formatCurrency((Number(lot.weavingCharges) + Number(lot.dyeingCharges)))}</td>
                    <td className="px-6 py-4">
                      <span className="inline-block px-2 py-1 bg-neutral-100 text-neutral-700 rounded-md text-xs font-semibold whitespace-nowrap border border-neutral-200">
                        {lot.status}
                      </span>
                      {factory && <div className="text-xs text-neutral-500 mt-1">at {factory.name}</div>}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {lot.status !== 'Received in Stock' && (
                        <Button variant="outline" size="sm" onClick={() => advanceStatus(lot)} className="h-8">
                          Advance <ArrowRight size={14} className="ml-1" />
                        </Button>
                      )}
                      {lot.status === 'Received in Stock' && (
                        <div className="text-xs text-green-600 font-medium">
                          Cost: {formatCurrency(lot.costPerMeter)}/m
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {lots.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-neutral-500">
                    No production lots active. Create one to begin processing.
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