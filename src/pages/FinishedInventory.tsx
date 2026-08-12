import { formatCurrency } from "../lib/utils";
import { useState, useEffect } from "react";
import { collection, query, onSnapshot, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { FinishedFabric, ProductionLot } from "../types";
import { Card } from "../components/ui";

export function FinishedInventory() {
  const [inventory, setInventory] = useState<(FinishedFabric & { lotNumber?: string })[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "finished_fabrics")), async (snap) => {
      const lotSnap = await getDocs(collection(db, "production_lots"));
      const lots = lotSnap.docs.map(d => ({ id: d.id, ...d.data() } as ProductionLot));
      
      const items = snap.docs.map(d => {
        const data = d.data() as FinishedFabric;
        const lot = lots.find(l => l.id === data.lotId);
        return {
          id: d.id,
          ...data,
          lotNumber: lot?.lotNumber || 'Unknown'
        };
      });
      setInventory(items);
    }, err => console.warn(err));

    return () => unsub();
  }, []);

  // Group by fabric type for a clean view
  const groupedInventory = inventory.reduce((acc, item) => {
    if (!acc[item.fabricType]) {
      acc[item.fabricType] = { totalMeters: 0, items: [] };
    }
    acc[item.fabricType].totalMeters += item.quantityMeters;
    acc[item.fabricType].items.push(item);
    return acc;
  }, {} as Record<string, { totalMeters: number, items: (FinishedFabric & { lotNumber?: string })[] }>);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-neutral-900">Finished Fabrics Inventory</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Object.entries(groupedInventory).map(([fabricType, group]) => (
          <Card key={fabricType} className="overflow-hidden">
            <div className="bg-neutral-900 text-white p-4">
              <h3 className="font-semibold text-lg">{fabricType}</h3>
              <p className="text-neutral-400 text-sm">Total: {group.totalMeters.toFixed(1)} meters</p>
            </div>
            <div className="p-0">
              <table className="w-full text-sm text-left">
                <thead className="bg-neutral-50 text-neutral-500 border-b border-neutral-200">
                  <tr>
                    <th className="px-4 py-2 font-medium">Source Lot</th>
                    <th className="px-4 py-2 font-medium text-right">Quantity</th>
                    <th className="px-4 py-2 font-medium text-right">Cost/m</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {group.items.map(item => (
                    <tr key={item.id} className="hover:bg-neutral-50">
                      <td className="px-4 py-2 font-medium text-neutral-700">{item.lotNumber}</td>
                      <td className="px-4 py-2 text-right">{item.quantityMeters} m</td>
                      <td className="px-4 py-2 text-right text-blue-600">{formatCurrency(item.costPerMeter)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
        {Object.keys(groupedInventory).length === 0 && (
          <div className="col-span-full p-12 text-center text-neutral-500 bg-white border border-neutral-200 rounded-lg shadow-sm">
            No finished fabrics found. Complete a production lot to add to inventory.
          </div>
        )}
      </div>
    </div>
  );
}