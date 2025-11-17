const fs = require('fs');
const path = require('path');

const fileListPath = '/tmp/all_files.txt';
const fileList = fs.readFileSync(fileListPath, 'utf-8')
  .split('\n')
  .filter(line => line.trim());

let filesModified = 0;
let filesProcessed = 0;

console.log(`Processing ${fileList.length} files...\n`);

for (const filePath of fileList) {
  const cleanPath = filePath.trim().replace(/^\.\//, '');
  
  try {
    const content = fs.readFileSync(cleanPath, 'utf-8');
    
    const cleanedContent = content.replace(/\n\n\n+/g, '\n\n');
    
    if (content !== cleanedContent) {
      fs.writeFileSync(cleanPath, cleanedContent, 'utf-8');
      console.log(`✓ Cleaned: ${cleanPath}`);
      filesModified++;
    }
    
    filesProcessed++;
  } catch (error) {
    console.error(`✗ Error processing ${cleanPath}:`, error.message);
  }
}

console.log(`\n=== Summary ===`);
console.log(`Files processed: ${filesProcessed}`);
console.log(`Files modified: ${filesModified}`);
console.log(`Files unchanged: ${filesProcessed - filesModified}`);
