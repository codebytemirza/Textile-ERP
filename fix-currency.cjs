const fs = require('fs');
const glob = require('glob');

// Try finding files
const files = glob.sync('src/**/*.{ts,tsx}');

let updatedCount = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;

  // Replace \${something.toFixed(2)} in JSX with {formatCurrency(something)}
  content = content.replace(/\$\{([^}]+)\.toFixed\(\d+\)\}/g, '{formatCurrency($1)}');
  
  // Replace `$...` in template literals: `something $${something.toFixed(2)}` -> `something ${formatCurrency(something)}`
  // Actually, wait, \${...} in JSX vs string literal is different. 
  // In JSX: <p>${amount.toFixed(2)}</p> -> The $ is a literal text. Then {amount.toFixed(2)} is an expression.
  // The regex /\$\{([^}]+)\.toFixed\(\d+\)\}/g matches exactly `${something.toFixed(2)}` in text.
  
  if (content !== originalContent) {
    // Make sure formatCurrency is imported
    if (!content.includes('formatCurrency')) {
      // Find the last import
      const importMatch = content.match(/import .* from '.*';?\n/g);
      if (importMatch) {
         // Determine relative path to utils
         // Simple hack: if file is in pages/ or components/, it's '../lib/utils'
         let utilsPath = '../lib/utils';
         if (file.split('/').length > 3) {
            utilsPath = '../../lib/utils';
         }
         const importStmt = `import { formatCurrency } from "${utilsPath}";\n`;
         content = importStmt + content;
      }
    }
    fs.writeFileSync(file, content);
    console.log(`Updated ${file}`);
    updatedCount++;
  }
});
console.log(`Updated ${updatedCount} files.`);
