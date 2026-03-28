#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Global theme color replacements
const REPLACEMENTS = {
  // Text colors - global mapping
  'text-gray-900': 'text-foreground',
  'text-gray-800': 'text-foreground', 
  'text-gray-700': 'text-foreground',
  'text-gray-600': 'text-foreground',
  'text-gray-500': 'text-muted',
  'text-gray-400': 'text-muted',
  'text-gray-300': 'text-muted',
  'text-slate-900': 'text-foreground',
  'text-slate-800': 'text-foreground',
  'text-slate-700': 'text-foreground',
  'text-slate-600': 'text-muted',
  'text-slate-500': 'text-muted',
  'text-slate-400': 'text-muted',
  'text-slate-300': 'text-muted',
  
  // Background colors
  'bg-gray-50': 'bg-card',
  'bg-gray-100': 'bg-muted',
  'bg-gray-200': 'bg-muted',
  'bg-slate-50': 'bg-card',
  'bg-slate-100': 'bg-muted',
  'bg-white': 'bg-card',
  
  // Border colors
  'border-gray-100': 'border-card',
  'border-gray-200': 'border-card',
  'border-gray-300': 'border-card',
  'border-slate-100': 'border-card',
  'border-slate-200': 'border-card',
  'border-slate-300': 'border-card',
  'divide-gray-50': 'divide-card',
  'divide-gray-100': 'divide-card',
  'divide-slate-50': 'divide-card',
  'divide-slate-100': 'divide-card',
  
  // Brand colors to theme colors
  'text-brand-600': 'text-primary',
  'bg-brand-500': 'bg-primary',
  'bg-brand-600': 'bg-primary',
  'border-brand-500': 'border-primary',
};

function fixFile(filePath) {
  console.log(`Fixing: ${filePath}`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  
  // Apply all replacements
  Object.entries(REPLACEMENTS).forEach(([oldClass, newClass]) => {
    // Replace in className attributes
    const regex = new RegExp(`\\b${oldClass}\\b`, 'g');
    content = content.replace(regex, newClass);
  });
  
  // Only write if changed
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    console.log(`  ✅ Updated ${filePath}`);
  } else {
    console.log(`  ⚪ No changes needed for ${filePath}`);
  }
}

function findAndFixFiles(dir) {
  const files = [];
  
  function traverse(currentDir) {
    const items = fs.readdirSync(currentDir);
    
    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        traverse(fullPath);
      } else if (item.endsWith('.jsx')) {
        files.push(fullPath);
      }
    }
  }
  
  traverse(dir);
  return files;
}

// Main execution
const srcDir = path.join(__dirname, '..', '..');
const filesToFix = findAndFixFiles(srcDir)
  .filter(file => file.includes('/pages/') || file.includes('/components/'));

console.log(`🎨 Applying global theme fixes to ${filesToFix.length} files...\n`);

filesToFix.forEach(fixFile);

console.log('\n✨ Global theme fixing complete!');
console.log('📝 Summary:');
console.log('   - All text-gray-* → text-foreground/text-muted');
console.log('   - All bg-gray-* → bg-card/bg-muted'); 
console.log('   - All border-gray-* → border-card');
console.log('   - All brand colors → theme colors');
console.log('\n🔄 Restart your dev server to see changes!');
