const fs = require('fs');
const files = require('glob').sync('src/pages/*.tsx');

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes('formatCurrency') && !content.includes('import { formatCurrency }')) {
    content = `import { formatCurrency } from "../lib/utils";\n` + content;
    fs.writeFileSync(file, content);
    console.log('Added import to', file);
  }
});
