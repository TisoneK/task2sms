// Global theme color replacements
// This file contains mappings for systematic theme color fixes

export const THEME_REPLACEMENTS = {
  // Text colors
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
  'divide-slate-50': 'divide-card',
  
  // Brand colors (keep as-is but document)
  'text-brand-600': 'text-primary',
  'bg-brand-500': 'bg-primary',
  'bg-brand-600': 'bg-primary',
  'border-brand-500': 'border-primary',
};

export function replaceThemeColors(content) {
  let result = content;
  
  Object.entries(THEME_REPLACEMENTS).forEach(([oldClass, newClass]) => {
    // Replace class names in className attributes
    const regex = new RegExp(`\\b${oldClass}\\b`, 'g');
    result = result.replace(regex, newClass);
  });
  
  return result;
}

export function shouldFixFile(filePath) {
  return filePath.endsWith('.jsx') && 
         (filePath.includes('/pages/') || filePath.includes('/components/'));
}
