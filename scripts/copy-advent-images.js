#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, '..', 'assets', 'Advent Calendar - Final');
const destDir = path.join(__dirname, '..', 'public', 'advent');

// Ensure destination directory exists
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

// Get all PNG files from source
const files = fs.readdirSync(sourceDir).filter(f => f.endsWith('.png'));

console.log(`Found ${files.length} images in source directory`);
console.log('Copying images...\n');

let copied = 0;
let failed = 0;

files.forEach(file => {
  const sourcePath = path.join(sourceDir, file);
  // Remove spaces around dashes: "Day 23 - 2.png" -> "Day 23-2.png"
  const destName = file.replace(/ - /g, '-');
  const destPath = path.join(destDir, destName);
  
  try {
    fs.copyFileSync(sourcePath, destPath);
    console.log(`✓ ${destName}`);
    copied++;
  } catch (error) {
    console.error(`✗ Failed to copy ${file}: ${error.message}`);
    failed++;
  }
});

console.log(`\nDone! Copied: ${copied}, Failed: ${failed}`);

// Verify critical files exist
const criticalFiles = ['Day 23-2.png', 'Day 25-2.png', 'Day 31-2.png'];
console.log('\nVerifying critical files:');
criticalFiles.forEach(file => {
  const filePath = path.join(destDir, file);
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    console.log(`✓ ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
  } else {
    console.log(`✗ ${file} MISSING`);
  }
});
