import fs from 'fs';
import path from 'path';
import strip from 'strip-comments';

const fileListPath = '/tmp/all_files.txt';
const fileList = fs.readFileSync(fileListPath, 'utf-8')
  .split('\n')
  .filter(line => line.trim().length > 0);

console.log(`Processing ${fileList.length} files...`);

let successCount = 0;
let errorCount = 0;
const errors = [];

fileList.forEach((filePath, index) => {
  const cleanPath = filePath.trim();
  
  try {
    if (!fs.existsSync(cleanPath)) {
      throw new Error(`File not found: ${cleanPath}`);
    }

    const originalContent = fs.readFileSync(cleanPath, 'utf-8');
    
    const cleanedContent = strip(originalContent, {
      line: true,
      block: true,
      keepProtected: false,
      preserveNewlines: true
    });

    fs.writeFileSync(cleanPath, cleanedContent, 'utf-8');
    
    successCount++;
    
    if ((index + 1) % 10 === 0) {
      console.log(`Processed ${index + 1}/${fileList.length} files...`);
    }
  } catch (error) {
    errorCount++;
    errors.push({ file: cleanPath, error: error.message });
    console.error(`Error processing ${cleanPath}: ${error.message}`);
  }
});

console.log('\n=== Summary ===');
console.log(`Total files: ${fileList.length}`);
console.log(`Successfully processed: ${successCount}`);
console.log(`Errors: ${errorCount}`);

if (errors.length > 0) {
  console.log('\nErrors encountered:');
  errors.forEach(({ file, error }) => {
    console.log(`  - ${file}: ${error}`);
  });
  process.exit(1);
} else {
  console.log('\nAll comments removed successfully!');
  process.exit(0);
}
