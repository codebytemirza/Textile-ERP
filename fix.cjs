const fs = require('fs');
let code = fs.readFileSync('src/pages/Dashboard.tsx', 'utf8');
code = code.replace(
  /onSnapshot\(query\(collection\(db, "yarn_inventory"\)\), snap => setYarn\(snap\.docs\.map\(d => \(\{ id: d\.id, \.\.\.d\.data\(\) \} as YarnInventory\)\), err => console\.warn\(err\)\),/g,
  'onSnapshot(query(collection(db, "yarn_inventory")), snap => setYarn(snap.docs.map(d => ({ id: d.id, ...d.data() } as YarnInventory))), err => console.warn(err)),'
);
code = code.replace(
  /onSnapshot\(query\(collection\(db, "production_lots"\)\), snap => setLots\(snap\.docs\.map\(d => \(\{ id: d\.id, \.\.\.d\.data\(\) \} as ProductionLot\)\), err => console\.warn\(err\)\),/g,
  'onSnapshot(query(collection(db, "production_lots")), snap => setLots(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProductionLot))), err => console.warn(err)),'
);
code = code.replace(
  /onSnapshot\(query\(collection\(db, "finished_fabrics"\)\), snap => setFabrics\(snap\.docs\.map\(d => \(\{ id: d\.id, \.\.\.d\.data\(\) \} as FinishedFabric\)\), err => console\.warn\(err\)\),/g,
  'onSnapshot(query(collection(db, "finished_fabrics")), snap => setFabrics(snap.docs.map(d => ({ id: d.id, ...d.data() } as FinishedFabric))), err => console.warn(err)),'
);
code = code.replace(
  /onSnapshot\(query\(collection\(db, "retail_sales"\)\), snap => setRetail\(snap\.docs\.map\(d => \(\{ id: d\.id, \.\.\.d\.data\(\) \} as RetailSale\)\), err => console\.warn\(err\)\),/g,
  'onSnapshot(query(collection(db, "retail_sales")), snap => setRetail(snap.docs.map(d => ({ id: d.id, ...d.data() } as RetailSale))), err => console.warn(err)),'
);
code = code.replace(
  /onSnapshot\(query\(collection\(db, "wholesale_invoices"\)\), snap => setWholesale\(snap\.docs\.map\(d => \(\{ id: d\.id, \.\.\.d\.data\(\) \} as WholesaleInvoice\)\), err => console\.warn\(err\)\),/g,
  'onSnapshot(query(collection(db, "wholesale_invoices")), snap => setWholesale(snap.docs.map(d => ({ id: d.id, ...d.data() } as WholesaleInvoice))), err => console.warn(err)),'
);
code = code.replace(
  /onSnapshot\(query\(collection\(db, "customers"\)\), snap => setCustomers\(snap\.docs\.map\(d => \(\{ id: d\.id, \.\.\.d\.data\(\) \} as Customer\)\), err => console\.warn\(err\)\),/g,
  'onSnapshot(query(collection(db, "customers")), snap => setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Customer))), err => console.warn(err)),'
);
code = code.replace(
  /onSnapshot\(query\(collection\(db, "factories"\)\), snap => setFactories\(snap\.docs\.map\(d => \(\{ id: d\.id, \.\.\.d\.data\(\) \} as Factory\)\), err => console\.warn\(err\)\),/g,
  'onSnapshot(query(collection(db, "factories")), snap => setFactories(snap.docs.map(d => ({ id: d.id, ...d.data() } as Factory))), err => console.warn(err)),'
);
code = code.replace(
  /onSnapshot\(query\(collection\(db, "suppliers"\)\), snap => setSuppliers\(snap\.docs\.map\(d => \(\{ id: d\.id, \.\.\.d\.data\(\) \} as Supplier\)\), err => console\.warn\(err\)\)/g,
  'onSnapshot(query(collection(db, "suppliers")), snap => setSuppliers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Supplier))), err => console.warn(err))'
);
fs.writeFileSync('src/pages/Dashboard.tsx', code);
