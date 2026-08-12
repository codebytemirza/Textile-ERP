const fs = require('fs');
const files = require('glob').sync('src/**/*.{ts,tsx}');

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;
  content = content.replace(/`\{formatCurrency\(([^`]+)\)\}`/g, 'formatCurrency($1)');
  
  if (content !== original) {
    fs.writeFileSync(file, content);
    console.log('Fixed interpolation 2 in', file);
  }
});
