import { useState, useEffect } from "react";
import { collection, query, where, getDocs, writeBatch, doc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Button, Card, CardContent, CardHeader, CardTitle } from "../components/ui";
import { Loader2, Database, Trash2 } from "lucide-react";

export function Settings() {
  const [hasSampleData, setHasSampleData] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkSampleData = async () => {
    try {
      const q = query(collection(db, "factories"), where("isSampleData", "==", true));
      const snap = await getDocs(q);
      setHasSampleData(!snap.empty);
    } catch (err) {
      console.error("Failed to check sample data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkSampleData();
  }, []);

  const handleDelete = async () => {
    if (!window.confirm("This will permanently delete all sample data. Continue?")) return;
    setLoading(true);
    try {
      const collectionsToDelete = [
        "suppliers", "yarn_inventory", "factories", "production_lots",
        "finished_fabrics", "retail_sales", "wholesale_invoices",
        "customers", "ledgers"
      ];

      const batch = writeBatch(db);
      let opCount = 0;

      for (const colName of collectionsToDelete) {
        const q = query(collection(db, colName), where("isSampleData", "==", true));
        const snap = await getDocs(q);
        snap.forEach(d => {
          batch.delete(d.ref);
          opCount++;
        });
      }

      if (opCount > 0) {
        await batch.commit();
      }
      alert("Sample data successfully deleted.");
      await checkSampleData();
    } catch (err) {
      console.error(err);
      alert("Error deleting sample data.");
      setLoading(false);
    }
  };

  const handleSeed = async () => {
    setLoading(true);
    try {
      const batch = writeBatch(db);
      const now = new Date();

      const addDocToBatch = (colName: string, data: any) => {
        const ref = doc(collection(db, colName));
        batch.set(ref, { ...data, isSampleData: true });
        return ref;
      };

      // Suppliers
      const suppA = addDocToBatch("suppliers", { name: "Sample Supplier A", contact: "123", balanceOwed: 0 }); 
      const suppB = addDocToBatch("suppliers", { name: "Sample Supplier B", contact: "123", balanceOwed: 1000 }); 
      const suppC = addDocToBatch("suppliers", { name: "Sample Supplier C", contact: "123", balanceOwed: 2400 }); 

      // Yarn
      const yarn1 = addDocToBatch("yarn_inventory", { supplierId: suppA.id, supplierName: "Sample Supplier A", yarnType: "Cotton 40s (Sample)", quantityKg: 1000, ratePerKg: 3.5, totalCost: 3500, purchaseDate: now, paymentStatus: 'Paid', balanceKg: 700 }); 
      const yarn2 = addDocToBatch("yarn_inventory", { supplierId: suppB.id, supplierName: "Sample Supplier B", yarnType: "Polyester 30s (Sample)", quantityKg: 500, ratePerKg: 4.0, totalCost: 2000, purchaseDate: now, paymentStatus: 'Partial', balanceKg: 200 }); 
      const yarn3 = addDocToBatch("yarn_inventory", { supplierId: suppC.id, supplierName: "Sample Supplier C", yarnType: "Linen 20s (Sample)", quantityKg: 800, ratePerKg: 3.0, totalCost: 2400, purchaseDate: now, paymentStatus: 'Unpaid', balanceKg: 400 }); 

      // Yarn Ledgers
      addDocToBatch("ledgers", { type: 'Cash', amount: -3500, date: now, description: 'Payment to Sample Supplier A for Yarn Cotton 40s (Sample)' });
      
      addDocToBatch("ledgers", { type: 'Supplier', referenceId: suppB.id, transactionId: yarn2.id, amount: 1000, date: now, description: 'Yarn Purchase: Polyester 30s (Sample)' });
      addDocToBatch("ledgers", { type: 'Cash', amount: -1000, date: now, description: 'Payment to Sample Supplier B for Yarn Polyester 30s (Sample)' });

      addDocToBatch("ledgers", { type: 'Supplier', referenceId: suppC.id, transactionId: yarn3.id, amount: 2400, date: now, description: 'Yarn Purchase: Linen 20s (Sample)' });

      // Factories
      const factW = addDocToBatch("factories", { name: "Sample Weavers", contact: "456", type: "Weaving", balance: 0 }); 
      const factD = addDocToBatch("factories", { name: "Sample Dyers", contact: "456", type: "Dyeing", balance: 0 });
      const factB = addDocToBatch("factories", { name: "Sample Composite Mills", contact: "456", type: "Both", balance: 1800 }); 

      // Lots
      addDocToBatch("production_lots", { lotNumber: "LOT-S001", yarnId: yarn1.id, quantityIssued: 100, factoryId: factW.id, dateSent: now, expectedFabricMeters: 400, weavingCharges: 0, dyeingCharges: 0, status: 'Yarn Issued', actualFabricMeters: null, totalCost: null, costPerMeter: null });
      addDocToBatch("production_lots", { lotNumber: "LOT-S002", yarnId: yarn1.id, quantityIssued: 200, factoryId: factW.id, dateSent: now, expectedFabricMeters: 800, weavingCharges: 500, dyeingCharges: 0, status: 'Sent for Dyeing', actualFabricMeters: null, totalCost: null, costPerMeter: null });
      
      const lot3 = addDocToBatch("production_lots", { lotNumber: "LOT-S003", yarnId: yarn2.id, quantityIssued: 300, factoryId: factB.id, dateSent: now, expectedFabricMeters: 1000, weavingCharges: 600, dyeingCharges: 400, status: 'Received in Stock', actualFabricMeters: 1000, totalCost: 2200, costPerMeter: 2.20 });
      addDocToBatch("ledgers", { type: 'Factory', referenceId: factB.id, transactionId: lot3.id, amount: 1000, date: now, description: 'Job work charges for LOT-S003' });
      const fab3 = addDocToBatch("finished_fabrics", { lotId: lot3.id, fabricType: "Polyester Twill (Sample)", quantityMeters: 400, costPerMeter: 2.20 });

      const lot4 = addDocToBatch("production_lots", { lotNumber: "LOT-S004", yarnId: yarn3.id, quantityIssued: 400, factoryId: factB.id, dateSent: now, expectedFabricMeters: 1500, weavingCharges: 800, dyeingCharges: 500, status: 'Received in Stock', actualFabricMeters: 1500, totalCost: 2500, costPerMeter: 1.666666 });
      addDocToBatch("ledgers", { type: 'Factory', referenceId: factB.id, transactionId: lot4.id, amount: 1300, date: now, description: 'Job work charges for LOT-S004' });
      const fab4 = addDocToBatch("finished_fabrics", { lotId: lot4.id, fabricType: "Linen Plain (Sample)", quantityMeters: 1050, costPerMeter: 1.666666 });

      // Retail Sales
      const ret1 = addDocToBatch("retail_sales", { date: now, totalAmount: 330, paymentMethod: 'Cash', shopLocation: 'Main Store', items: [{ fabricId: fab3.id, quantity: 100, price: 3.30, costAtSaleTime: 2.20 }] });
      addDocToBatch("ledgers", { type: 'Cash', transactionId: ret1.id, amount: 330, date: now, description: 'Retail POS Sale at Main Store' });

      const ret2 = addDocToBatch("retail_sales", { date: now, totalAmount: 125.25, paymentMethod: 'Card', shopLocation: 'Downtown Kiosk', items: [{ fabricId: fab4.id, quantity: 50, price: 2.505, costAtSaleTime: 1.666666 }] });
      addDocToBatch("ledgers", { type: 'Cash', transactionId: ret2.id, amount: 125.25, date: now, description: 'Retail POS Sale at Downtown Kiosk' });

      // Customers
      const cust1 = addDocToBatch("customers", { name: "Sample Customer A", contact: "789", balance: 0 }); 
      const cust2 = addDocToBatch("customers", { name: "Sample Customer B", contact: "789", balance: 500 }); 
      const cust3 = addDocToBatch("customers", { name: "Sample Customer C", contact: "789", balance: 300 }); 

      // Wholesale Invoices
      const inv1 = addDocToBatch("wholesale_invoices", { customerId: cust1.id, date: now, totalAmount: 750, paidAmount: 750, status: 'Paid', dueDate: now, items: [{ fabricId: fab3.id, quantity: 300, price: 2.50, costAtSaleTime: 2.20 }] });
      addDocToBatch("ledgers", { type: 'Customer', referenceId: cust1.id, transactionId: inv1.id, amount: 0, date: now, description: 'Wholesale Invoice for Polyester Twill (Sample)' });
      addDocToBatch("ledgers", { type: 'Cash', transactionId: inv1.id, amount: 750, date: now, description: 'Payment received for wholesale invoice' });

      const inv2 = addDocToBatch("wholesale_invoices", { customerId: cust2.id, date: now, totalAmount: 800, paidAmount: 300, status: 'Partial', dueDate: now, items: [{ fabricId: fab4.id, quantity: 400, price: 2.00, costAtSaleTime: 1.666666 }] });
      addDocToBatch("ledgers", { type: 'Customer', referenceId: cust2.id, transactionId: inv2.id, amount: 500, date: now, description: 'Wholesale Invoice for Linen Plain (Sample)' });
      addDocToBatch("ledgers", { type: 'Cash', transactionId: inv2.id, amount: 300, date: now, description: 'Payment received for wholesale invoice' });

      const inv3 = addDocToBatch("wholesale_invoices", { customerId: cust3.id, date: now, totalAmount: 500, paidAmount: 200, status: 'Partial', dueDate: now, items: [{ fabricId: fab3.id, quantity: 200, price: 2.50, costAtSaleTime: 2.20 }] });
      addDocToBatch("ledgers", { type: 'Customer', referenceId: cust3.id, transactionId: inv3.id, amount: 500, date: now, description: 'Wholesale Invoice for Polyester Twill (Sample)' });

      // Standalone Payments
      addDocToBatch("ledgers", { type: 'Customer', referenceId: cust3.id, amount: -200, date: now, description: 'Payment received from customer' });
      addDocToBatch("ledgers", { type: 'Cash', amount: 200, date: now, description: 'Payment received from customer' });

      addDocToBatch("ledgers", { type: 'Factory', referenceId: factB.id, amount: -500, date: now, description: 'Payment to factory' });
      addDocToBatch("ledgers", { type: 'Cash', amount: -500, date: now, description: 'Payment to factory' });

      await batch.commit();
      alert("Sample data seeded successfully!");
      await checkSampleData();
    } catch (err) {
      console.error(err);
      alert("Error seeding sample data.");
      setLoading(false);
    }
  };

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-neutral-500">Manage application configuration and data.</p>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Sample Data Management</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-8 h-8 animate-spin text-neutral-400" />
            </div>
          ) : hasSampleData ? (
            <div className="space-y-4">
              <p className="text-sm text-neutral-600">
                Sample data is currently active in your database. This data is tagged separately 
                and can be safely removed without affecting real records.
              </p>
              <Button onClick={handleDelete} variant="destructive" className="w-full flex items-center gap-2">
                <Trash2 className="w-4 h-4" />
                Delete Sample Data
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-neutral-600">
                Your database does not contain any sample data. You can seed a realistic test environment
                covering all modules (Yarn, Production, Inventory, Sales, and Ledgers).
              </p>
              <Button onClick={handleSeed} className="w-full flex items-center gap-2">
                <Database className="w-4 h-4" />
                Seed Sample Data
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
