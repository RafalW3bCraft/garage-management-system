#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const filesToFix = [
  'client/src/components/AppointmentCard.tsx',
  'client/src/components/AuthDialog.tsx',
  'client/src/components/BidDialog.tsx',
  'client/src/components/BookingDialog.tsx',
  'client/src/components/CarCard.tsx',
  'client/src/components/HeroSection.tsx',
  'client/src/components/RescheduleDialog.tsx',
  'client/src/components/ui/sidebar.tsx',
  'client/src/components/ImageUpload.tsx',
  'client/src/components/CarImageGallery.tsx',
  'client/src/components/Navigation.tsx',
  'client/src/pages/Appointments.tsx',
  'client/src/pages/CarDetail.tsx',
  'client/src/pages/Contact.tsx',
  'client/src/pages/Home.tsx',
  'client/src/pages/ServiceDetail.tsx',
  'client/src/pages/admin/Appointments.tsx',
  'client/src/pages/admin/Locations.tsx',
  'client/src/pages/admin/Services.tsx',
  'client/src/pages/admin/Users.tsx',
  'client/src/pages/admin/Cars.tsx',
  'client/src/pages/admin/Dashboard.tsx',
  'client/src/pages/Profile.tsx',
];

function cleanFile(filePath) {
  const fullPath = path.join(rootDir, filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.error(`File not found: ${filePath}`);
    return { success: false, removed: 0 };
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  const lines = content.split('\n');
  
  let removedCount = 0;
  const cleanedLines = lines.filter(line => {
    if (/^\s*\{\}\s*$/.test(line)) {
      removedCount++;
      return false;
    }
    return true;
  });

  let finalContent = cleanedLines.join('\n');
  
  finalContent = finalContent.replace(/\n{4,}/g, '\n\n\n');
  
  fs.writeFileSync(fullPath, finalContent, 'utf-8');
  
  return { success: true, removed: removedCount };
}

console.log('Starting cleanup of literal {} in TSX files...\n');

let totalRemoved = 0;
let filesFixed = 0;

filesToFix.forEach(filePath => {
  const result = cleanFile(filePath);
  if (result.success) {
    totalRemoved += result.removed;
    if (result.removed > 0) {
      filesFixed++;
      console.log(`✓ ${filePath}: removed ${result.removed} empty braces`);
    } else {
      console.log(`  ${filePath}: already clean`);
    }
  }
});

console.log(`\n✓ Cleanup complete!`);
console.log(`  Files fixed: ${filesFixed}/${filesToFix.length}`);
console.log(`  Total empty braces removed: ${totalRemoved}`);
