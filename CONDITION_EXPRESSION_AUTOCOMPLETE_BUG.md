# Condition Expression Autocomplete Bug

## 🎯 Problem Summary
The condition expression autocomplete component is completely broken with a persistent JavaScript error: "Cannot read properties of undefined (reading 'value')". This prevents users from typing anything in the condition expression field.

## ❌ Current Behavior
- User cannot type in the condition expression field
- JavaScript error appears immediately when focusing the field
- Error message: "Cannot read properties of undefined (reading 'value')"
- Multi-field monitor creation is completely blocked

## ✅ Expected Behavior
- User should be able to type condition expressions normally
- Autocomplete should appear when typing field names
- No JavaScript errors should occur

## 🔍 Root Cause Analysis

### Component Structure
```javascript
function ConditionExpressionInput({ value, onChange, availableFields = [] }) {
  // Component uses value prop directly without proper initialization
}
```

### Potential Issues
1. **Undefined value prop** - `form.multi_field_condition` might be undefined in initial state
2. **Race conditions** - Component renders before form state is properly initialized
3. **String operations on undefined** - `value.substring()`, `value.split()` called on undefined
4. **Event handler issues** - `e.target.value` might be undefined in some scenarios

### Error Location
The error occurs in the `pickSuggestion` function:
```javascript
const cursorPos = inputRef.current.selectionStart  // This line might be failing
const beforeCursor = currentValue.substring(0, cursorPos)  // Or this line
```

## 🛠️ Technical Details

### Backend File
`frontend/src/pages/ScraperPage.jsx` - `ConditionExpressionInput` component (lines 201-350)

### Key Code Sections
1. **Component definition** (line 202)
2. **pickSuggestion function** (line 267)
3. **handleChange function** (line 251)
4. **Input element** (line 304)

### Current Attempted Fixes
- Added `value || ''` fallbacks
- Added `!suggestion` checks
- Added `!inputRef.current` checks
- Added `suggestion.text || ''` fallbacks

**Status**: Still failing

## 🧪 Test Cases

| Action | Expected Result | Current Result |
|--------|----------------|----------------|
| Click in condition field | Focus, can type | JavaScript error |
| Type "home_" | Autocomplete suggests "home_score" | JavaScript error |
| Select suggestion | Inserts "home_score " | JavaScript error |

## 🚨 Priority
**CRITICAL** - Blocks multi-field monitor creation completely

## 📋 Acceptance Criteria
1. ✅ User can type in condition expression field without errors
2. ✅ Autocomplete appears for field names
3. ✅ Autocomplete appears for operators
4. ✅ Clicking suggestions works correctly
5. ✅ No JavaScript errors in browser console

## 🔗 Related Issues
- Multi-field monitor functionality
- Form validation
- Condition expression validation

## 📝 Notes
- The error is persistent and occurs immediately on field focus
- Multiple safety checks have been added but error persists
- The issue might be deeper in the component lifecycle or form state initialization
- A complete rewrite or different approach might be needed

## 🎯 Immediate Action Required
Either:
1. **Remove autocomplete temporarily** - Replace with basic input to restore functionality
2. **Complete rewrite** - Use a different autocomplete approach
3. **Fix root cause** - Identify the exact source of the undefined value

**Recommendation**: Start with option 1 to restore basic functionality, then implement option 2 for a proper solution.
