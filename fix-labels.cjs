const fs = require('fs');
const files = ['src/pages/ProductionLots.tsx', 'src/pages/WholesaleSales.tsx', 'src/pages/Ledgers.tsx', 'src/pages/RetailSales.tsx', 'src/pages/YarnInventory.tsx'];

files.forEach(file => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/\(\$\)/g, '(₨)');
    content = content.replace(/\(\$\/m\)/g, '(₨/m)');
    content = content.replace(/\(\$\/kg\)/g, '(₨/kg)');
    fs.writeFileSync(file, content);
  }
});
