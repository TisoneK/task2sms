# Multi-Element Fields Feature Plan

## 🎯 Problem Statement

Current Task2SMS system supports **single selector per monitor**, which is insufficient for complex use cases like:

- **Sports scores**: Need home_score + away_score for total calculations
- **Financial data**: Need bid_price + ask_price for spread analysis  
- **Product pages**: Need price + stock + rating for comprehensive monitoring
- **Weather data**: Need temperature + humidity + pressure for alerts

## 🚀 Solution: Multi-Element Field System

### **Core Concept**
Transform from **single selector** to **field-based extraction** where each monitor can have multiple named fields.

## 📋 Feature Requirements

### **1. Backend Data Model Changes**

#### **Monitor Model Enhancement**
```python
class Monitor(Base):
    # Existing fields...
    
    # New multi-field support
    fields: List[MonitorField] = relationship("MonitorField", back_populates="monitor")
    is_multi_field: bool = default(False)  # Backward compatibility
    
class MonitorField(Base):
    id: int = Column(Integer, primary_key=True)
    monitor_id: int = Column(Integer, ForeignKey("monitors.id"))
    name: str = Column(String(100))  # home_score, away_score, bid_price, etc.
    selector: str = Column(Text)
    extraction_type: str = Column(String(50))  # text, number, attribute
    attribute_name: Optional[str] = Column(String(100))  # For attribute extraction
    normalization: Optional[str] = Column(String(200))
    wait_selector: Optional[str] = Column(Text)
    position: int = Column(Integer)  # Order of fields
```

#### **Monitor Execution Enhancement**
```python
class MonitorExecution(Base):
    # Existing fields...
    
    # New multi-field results
    field_results: List[FieldResult] = relationship("FieldResult", back_populates="execution")

class FieldResult(Base):
    id: int = Column(Integer, primary_key=True)
    execution_id: int = Column(Integer, ForeignKey("monitor_executions.id"))
    field_name: str = Column(String(100))
    raw_value: str = Column(Text)
    normalized_value: Optional[float] = Column(Float)
    extraction_time_ms: int = Column(Integer)
    success: bool = Column(Boolean)
    error_message: Optional[str] = Column(Text)
```

### **2. API Endpoint Changes**

#### **Monitor Create/Update Endpoints**
```python
class MonitorFieldCreate(BaseModel):
    name: str
    selector: str
    extraction_type: str = "text"
    attribute_name: Optional[str] = None
    normalization: Optional[str] = None
    wait_selector: Optional[str] = None
    position: int = 0

class MonitorCreate(BaseModel):
    # Existing fields...
    fields: Optional[List[MonitorFieldCreate]] = []
    is_multi_field: bool = False
    condition: Optional[str] = None  # JavaScript expression
    
class MonitorUpdate(BaseModel):
    # Existing fields...
    fields: Optional[List[MonitorFieldCreate]] = None
```

#### **Enhanced Test Selector Endpoint**
```python
@router.post("/test-multi-fields")
async def test_multi_fields(request: MultiFieldTestRequest):
    """Test multiple field extractions simultaneously"""
    results = []
    for field in request.fields:
        result = await web_scraper.extract_field(
            url=request.url,
            selector=field.selector,
            extraction_type=field.extraction_type,
            wait_ms=request.wait_ms,
            use_playwright=request.use_playwright
        )
        results.append({
            "field_name": field.name,
            "value": result.value,
            "success": result.success,
            "error": result.error
        })
    
    return {"fields": results}
```

### **3. Field Name Validation & Standards**

#### **Field Name Rules**
```python
# Allowed field names (restricted to prevent conflicts)
ALLOWED_FIELD_PATTERNS = [
    r'^[a-z][a-z0-9_]*$',  # snake_case
    r'^[a-z][A-Za-z0-9]*$',   # camelCase
]

# Reserved names (system keywords)
RESERVED_NAMES = {
    'id', 'created_at', 'updated_at', 'name', 'url', 'selector',
    'condition', 'is_active', 'last_checked_at', 'last_value',
    'error_message', 'duration_ms', 'used_playwright'
}

# Recommended naming conventions
FIELD_NAMING_CONVENTIONS = {
    'sports': ['home_score', 'away_score', 'total_score', 'quarter_score', 
               'team_name', 'player_name', 'game_time', 'match_status'],
    'finance': ['bid_price', 'ask_price', 'volume', 'market_cap', 
                'change_percent', 'opening_price', 'closing_price'],
    'ecommerce': ['price', 'stock', 'rating', 'reviews_count', 'brand',
                  'category', 'availability', 'discount_price'],
    'weather': ['temperature', 'humidity', 'pressure', 'wind_speed',
                'visibility', 'uv_index', 'precipitation']
}
```

#### **Validation Logic**
```python
import re
from typing import List

def validate_field_name(field_name: str, existing_fields: List[str] = None) -> ValidationResult:
    """Validate field name against naming rules"""
    
    # Check basic pattern
    if not re.match(r'^[a-z][a-z0-9_]*$', field_name):
        return ValidationResult(
            valid=False,
            error="Field name must start with letter and contain only lowercase letters, numbers, and underscores"
        )
    
    # Check reserved names
    if field_name.lower() in RESERVED_NAMES:
        return ValidationResult(
            valid=False,
            error=f"'{field_name}' is a reserved system name"
        )
    
    # Check for duplicates
    if existing_fields and field_name in existing_fields:
        return ValidationResult(
            valid=False,
            error=f"Field name '{field_name}' already exists in this monitor"
        )
    
    # Check length
    if len(field_name) < 3 or len(field_name) > 50:
        return ValidationResult(
            valid=False,
            error="Field name must be between 3 and 50 characters"
        )
    
    return ValidationResult(valid=True, suggestion=suggest_better_name(field_name))

def suggest_better_name(field_name: str) -> str:
    """Suggest better field name based on common patterns"""
    
    # Remove spaces and special chars
    clean_name = re.sub(r'[^a-zA-Z0-9]', '_', field_name.lower())
    
    # Common corrections
    corrections = {
        'home score': 'home_score',
        'away score': 'away_score', 
        'total score': 'total_score',
        'bid price': 'bid_price',
        'ask price': 'ask_price',
        'stock level': 'stock_level',
        'product name': 'product_name',
        'customer rating': 'customer_rating'
    }
    
    return corrections.get(clean_name, clean_name)

class ValidationResult:
    def __init__(self, valid: bool, error: str = None, suggestion: str = None):
        self.valid = valid
        self.error = error
        self.suggestion = suggestion
```

#### **Frontend Validation Component**
```jsx
const FieldNameInput = ({ value, onChange, existingFields, placeholder }) => {
  const [validation, setValidation] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  
  const validateName = (name) => {
    if (!name) {
      setValidation(null)
      return
    }
    
    // Basic pattern check
    if (!/^[a-z][a-z0-9_]*$/.test(name)) {
      setValidation({
        type: 'error',
        message: 'Must start with letter, use lowercase letters, numbers, and underscores only'
      })
      return
    }
    
    // Check duplicates
    if (existingFields?.includes(name)) {
      setValidation({
        type: 'error', 
        message: 'Field name already exists in this monitor'
      })
      return
    }
    
    setValidation({ type: 'success' })
    onChange(name)
  }
  
  const getSuggestions = (input) => {
    if (input.length < 2) return []
    
    const common = {
      'home': ['home_score', 'home_team', 'home_points'],
      'away': ['away_score', 'away_team', 'away_points'], 
      'price': ['price', 'bid_price', 'ask_price', 'discount_price'],
      'stock': ['stock_level', 'stock_status', 'inventory'],
      'score': ['score', 'points', 'total_score'],
      'team': ['team_name', 'team_id', 'team_abbreviation']
    }
    
    const prefix = input.toLowerCase().split('_')[0]
    return common[prefix] || []
  }
  
  return (
    <div>
      <Input
        placeholder={placeholder || "e.g., home_score, away_score, price"}
        value={value}
        onChange={validateName}
        onFocus={() => setSuggestions(getSuggestions(value))}
        onBlur={() => setSuggestions([])}
      />
      
      {validation && (
        <ValidationMessage type={validation.type}>
          {validation.message}
        </ValidationMessage>
      )}
      
      {suggestions.length > 0 && (
        <SuggestionsList>
          {suggestions.map(suggestion => (
            <SuggestionItem 
              key={suggestion}
              onClick={() => {
                onChange(suggestion)
                setSuggestions([])
              }}
            >
              {suggestion}
            </SuggestionItem>
          ))}
        </SuggestionsList>
      )}
    </div>
  )
}
```

#### **API Validation Enhancement**
```python
@router.post("/validate-field-name")
async def validate_field_name(request: FieldNameValidationRequest):
    """Validate field name before creation"""
    
    # Get existing fields for this monitor (if updating)
    existing_fields = []
    if request.monitor_id:
        monitor = await get_monitor(request.monitor_id)
        existing_fields = [field.name for field in monitor.fields]
    
    # Validate the name
    validation_result = validate_field_name(
        field_name=request.field_name,
        existing_fields=existing_fields
    )
    
    return {
        "valid": validation_result.valid,
        "error": validation_result.error,
        "suggestion": validation_result.suggestion,
        "suggestions": get_similar_names(request.field_name)
    }

class FieldNameValidationRequest(BaseModel):
    field_name: str
    monitor_id: Optional[int] = None
```

#### **Database Constraints**
```python
# Add to MonitorField model
class MonitorField(Base):
    # ... existing fields ...
    
    @validates('name')
    def validate_name(cls, v):
        if not re.match(r'^[a-z][a-z0-9_]*$', v):
            raise ValueError('Invalid field name format')
        if v in RESERVED_NAMES:
            raise ValueError(f'Field name "{v}" is reserved')
        return v
    
    @validates('name')
    def validate_unique(cls, v, field, monitor_id):
        # Check uniqueness within monitor
        existing = session.query(MonitorField).filter_by(
            name=v, monitor_id=monitor_id
        ).first()
        if existing:
            raise ValueError('Field name must be unique within monitor')
        return v
```

#### **Smart Field Name Suggestions**
```python
def get_contextual_suggestions(url: str, page_content: str) -> List[str]:
    """Get field name suggestions based on page context"""
    
    suggestions = []
    
    # Sports sites
    if any(domain in url for domain in ['flashscore.com', 'espn.com', 'nba.com']):
        suggestions.extend(FIELD_NAMING_CONVENTIONS['sports'])
    
    # Finance sites  
    if any(domain in url for domain in ['yahoo.com', 'bloomberg.com', 'reuters.com']):
        suggestions.extend(FIELD_NAMING_CONVENTIONS['finance'])
    
    # E-commerce sites
    if any(domain in url for domain in ['amazon.com', 'ebay.com', 'shopify.com']):
        suggestions.extend(FIELD_NAMING_CONVENTIONS['ecommerce'])
    
    # Weather sites
    if any(domain in url for domain in ['weather.com', 'accuweather.com', 'noaa.gov']):
        suggestions.extend(FIELD_NAMING_CONVENTIONS['weather'])
    
    return list(set(suggestions))  # Remove duplicates
```

### **4. Enhanced Web Scraping Service**

#### **Multi-Field Extraction**
```python
class WebScraper:
    async def extract_multiple_fields(
        self,
        url: str,
        fields: List[MonitorField],
        wait_ms: int = 8000,
        use_playwright: bool = True
    ) -> MultiFieldResult:
        """Extract multiple fields from single page load"""
        
        fetch_result = await self.page_fetcher.fetch(
            url=url,
            use_playwright=use_playwright,
            wait_ms=wait_ms
        )
        
        field_results = []
        for field in fields:
            extract_result = await self.element_extractor.extract(
                html=fetch_result.html,
                selector=field.selector,
                extraction_type=field.extraction_type,
                attribute_name=field.attribute_name,
                normalization=field.normalization
            )
            
            field_results.append(FieldResult(
                field_name=field.name,
                raw_value=extract_result.value,
                normalized_value=extract_result.normalized_value,
                success=extract_result.success,
                error=extract_result.error
            ))
        
        return MultiFieldResult(
            success=True,
            fields=field_results,
            used_playwright=fetch_result.used_playwright,
            duration_ms=fetch_result.duration_ms
        )
```

### **4. Frontend Enhancements**

#### **Enhanced Monitor Creation Form**
```jsx
const MultiFieldMonitorForm = () => {
  const [isMultiField, setIsMultiField] = useState(false)
  const [fields, setFields] = useState([
    { name: 'value', selector: '', extraction_type: 'text' }
  ])
  
  const addField = () => {
    setFields([...fields, { 
      name: `field_${fields.length + 1}`, 
      selector: '', 
      extraction_type: 'text' 
    }])
  }
  
  const removeField = (index) => {
    setFields(fields.filter((_, i) => i !== index))
  }
  
  return (
    <div>
      <Toggle 
        value={isMultiField}
        onChange={setIsMultiField}
        label="Multi-Field Monitor"
      />
      
      {isMultiField ? (
        <div>
          {fields.map((field, index) => (
            <FieldEditor
              key={index}
              field={field}
              onChange={(field) => updateField(index, field)}
              onRemove={() => removeField(index)}
              onTest={() => testField(field)}
            />
          ))}
          <Button onClick={addField}>Add Field</Button>
        </div>
      ) : (
        <SingleFieldEditor />
      )}
      
      <ConditionBuilder 
        fields={fields}
        onChange={setCondition}
      />
    </div>
  )
}
```

#### **Enhanced Element Picker Integration**
```jsx
const ElementPicker = () => {
  const [selectedFields, setSelectedFields] = useState([])
  
  const handleElementPick = (fieldData) => {
    if (multiFieldMode) {
      setSelectedFields([...selectedFields, fieldData])
    } else {
      // Single field mode (existing behavior)
      setSelector(fieldData.selector)
      setValue(fieldData.value)
    }
  }
  
  return (
    <div>
      <Toggle 
        value={multiFieldMode}
        onChange={setMultiFieldMode}
        label="Multi-Field Mode"
      />
      
      <ElementPickerCanvas 
        onElementClick={handleElementPick}
        multiFieldMode={multiFieldMode}
      />
      
      {multiFieldMode && (
        <SelectedFieldsList 
          fields={selectedFields}
          onRemove={removeField}
          onEdit={editField}
        />
      )}
    </div>
  )
}
```

#### **Condition Builder**
```jsx
const ConditionBuilder = ({ fields, onChange }) => {
  const [condition, setCondition] = useState('')
  
  const fieldNames = fields.map(f => f.name)
  
  const exampleConditions = [
    `${fieldNames[0]} > ${fieldNames[1]}`,
    `${fieldNames[0]} + ${fieldNames[1]} == 166`,
    `Math.abs(${fieldNames[0]} - ${fieldNames[1]}) < 10`,
    `${fieldNames.join(' + ')} > 100`
  ]
  
  return (
    <div>
      <label>Monitor Condition (JavaScript Expression)</label>
      <Select 
        options={fieldNames}
        placeholder="Select field or type expression"
        value={condition}
        onChange={setCondition}
      />
      
      <HelpText>
        Available fields: {fieldNames.join(', ')}
        <br />
        Examples: {exampleConditions.map((ex, i) => (
          <div key={i}>{ex}</div>
        ))}
      </HelpText>
    </div>
  )
}
```

### **5. Database Migration**

#### **Alembic Migration**
```python
"""Add multi-field support to monitors

Revision ID: add_multi_field_support
Revises: initial
Create Date: 2026-04-03 21:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

def upgrade():
    # Add new columns to monitors table
    op.add_column('monitors', sa.Column('is_multi_field', sa.Boolean(), default=False))
    
    # Create monitor_fields table
    op.create_table('monitor_fields',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('monitor_id', sa.Integer(), sa.ForeignKey('monitors.id')),
        sa.Column('name', sa.String(100)),
        sa.Column('selector', sa.Text()),
        sa.Column('extraction_type', sa.String(50), default='text'),
        sa.Column('attribute_name', sa.String(100)),
        sa.Column('normalization', sa.String(200)),
        sa.Column('wait_selector', sa.Text()),
        sa.Column('position', sa.Integer(), default=0)
    )
    
    # Create field_results table for execution results
    op.create_table('field_results',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('execution_id', sa.Integer(), sa.ForeignKey('monitor_executions.id')),
        sa.Column('field_name', sa.String(100)),
        sa.Column('raw_value', sa.Text()),
        sa.Column('normalized_value', sa.Float()),
        sa.Column('extraction_time_ms', sa.Integer()),
        sa.Column('success', sa.Boolean()),
        sa.Column('error_message', sa.Text())
    )

def downgrade():
    op.drop_table('field_results')
    op.drop_table('monitor_fields')
    op.drop_column('monitors', 'is_multi_field')
```

## 🎯 Use Cases & Examples

### **1. Sports Betting Monitor**
```json
{
  "name": "Basketball Total Score",
  "url": "https://flashscore.com/match/...",
  "is_multi_field": true,
  "fields": [
    {
      "name": "home_score",
      "selector": "div.smh__score.smh__home.smh__part--current",
      "extraction_type": "text",
      "normalization": "extract_numbers"
    },
    {
      "name": "away_score", 
      "selector": "div.smh__score.smh__away.smh__part--current",
      "extraction_type": "text",
      "normalization": "extract_numbers"
    }
  ],
  "condition": "home_score + away_score > 150"
}
```

### **2. Financial Spread Monitor**
```json
{
  "name": "Stock Price Spread",
  "url": "https://finance.yahoo.com/quote/AAPL",
  "is_multi_field": true,
  "fields": [
    {
      "name": "bid_price",
      "selector": "td[data-test='BID-value']",
      "extraction_type": "text",
      "normalization": "extract_numbers"
    },
    {
      "name": "ask_price",
      "selector": "td[data-test='ASK-value']", 
      "extraction_type": "text",
      "normalization": "extract_numbers"
    }
  ],
  "condition": "Math.abs(bid_price - ask_price) < 0.01"
}
```

### **3. E-commerce Inventory Monitor**
```json
{
  "name": "Product Availability",
  "url": "https://amazon.com/dp/B08N5WRWNW",
  "is_multi_field": true,
  "fields": [
    {
      "name": "price",
      "selector": ".a-price-whole",
      "extraction_type": "text",
      "normalization": "extract_numbers"
    },
    {
      "name": "stock",
      "selector": "#availability span",
      "extraction_type": "text"
    },
    {
      "name": "rating",
      "selector": "[data-hook='average-star-rating']",
      "extraction_type": "attribute",
      "attribute_name": "data-rating"
    }
  ],
  "condition": "stock == 'In Stock' and price < 100"
}
```

## 🚀 Implementation Phases

### **Phase 1: Backend Foundation (Week 1)**
1. ✅ Database models and migration
2. ✅ Enhanced web scraping service
3. ✅ Multi-field test endpoint
4. ✅ Monitor execution logic

### **Phase 2: API Integration (Week 2)**
1. ✅ Monitor create/update endpoints
2. ✅ Multi-field validation
3. ✅ Enhanced test-selector
4. ✅ Execution result handling

### **Phase 3: Frontend Development (Week 3-4)**
1. ✅ Multi-field monitor form
2. ✅ Enhanced element picker
3. ✅ Condition builder UI
4. ✅ Results display

### **Phase 4: Testing & Polish (Week 5)**
1. ✅ Integration testing
2. ✅ Performance optimization
3. ✅ Documentation
4. ✅ User testing

## 🎯 Benefits

### **For Users**
- **Powerful monitoring**: Complex conditions across multiple data points
- **Flexible extraction**: Mix text, numbers, attributes
- **Better UX**: Clear field naming and organization
- **Advanced logic**: JavaScript expressions for conditions

### **For System**
- **Scalable architecture**: Clean separation of concerns
- **Backward compatible**: Single-field monitors still work
- **Performance**: Single page load for multiple fields
- **Maintainable**: Clear data model structure

## 📊 Success Metrics

### **Technical Metrics**
- **Extraction accuracy**: >95% for multi-field scenarios
- **Performance**: <3s for 5-field extraction
- **Reliability**: <1% failure rate
- **Backward compatibility**: 100% existing monitors work

### **User Experience Metrics**
- **Setup time**: <2 minutes for complex multi-field monitor
- **Learning curve**: <30 minutes for new users
- **Success rate**: >90% first-time monitor creation
- **Feature adoption**: >60% users try multi-field within first week

## � Use Cases & Examples

### **1. Sports Betting Monitor**
```json
{
  "name": "Basketball Total Score",
  "url": "https://flashscore.com/match/...",
  "is_multi_field": true,
  "fields": [
    {
      "name": "home_score",
      "selector": "div.smh__score.smh__home.smh__part--current",
      "extraction_type": "text",
      "normalization": "extract_numbers"
    },
    {
      "name": "away_score", 
      "selector": "div.smh__score.smh__away.smh__part--current",
      "extraction_type": "text",
      "normalization": "extract_numbers"
    }
  ],
  "condition": "home_score + away_score > 150"
}
```

### **2. Financial Spread Monitor**
```json
{
  "name": "Stock Price Spread",
  "url": "https://finance.yahoo.com/quote/AAPL",
  "is_multi_field": true,
  "fields": [
    {
      "name": "bid_price",
      "selector": "td[data-test='BID-value']",
      "extraction_type": "text",
      "normalization": "extract_numbers"
    },
    {
      "name": "ask_price",
      "selector": "td[data-test='ASK-value']", 
      "extraction_type": "text",
      "normalization": "extract_numbers"
    }
  ],
  "condition": "Math.abs(bid_price - ask_price) < 0.01"
}
```

### **3. E-commerce Inventory Monitor**
```json
{
  "name": "Product Availability",
  "url": "https://amazon.com/dp/B08N5WRWNW",
  "is_multi_field": true,
  "fields": [
    {
      "name": "price",
      "selector": ".a-price-whole",
      "extraction_type": "text",
      "normalization": "extract_numbers"
    },
    {
      "name": "stock",
      "selector": "#availability span",
      "extraction_type": "text"
    },
    {
      "name": "rating",
      "selector": "[data-hook='average-star-rating']",
      "extraction_type": "attribute",
      "attribute_name": "data-rating"
    }
  ],
  "condition": "stock == 'In Stock' and price < 100"
}
```

## 🔄 **Database Migration Requirements**

### **🗄️ Migration Overview**

**⚠️ Critical Requirement**: Yes, database refresh is **absolutely required** for multi-element fields feature.

### **📋 Schema Changes Needed**

#### **New Tables to Create:**

1. **`monitor_fields` Table**
```sql
CREATE TABLE monitor_fields (
    id SERIAL PRIMARY KEY,
    monitor_id INTEGER REFERENCES monitors(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    selector TEXT NOT NULL,
    extraction_type VARCHAR(50) DEFAULT 'text',
    attribute_name VARCHAR(100),
    normalization VARCHAR(200),
    wait_selector TEXT,
    position INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_monitor_fields_monitor_id ON monitor_fields(monitor_id);
CREATE INDEX idx_monitor_fields_name ON monitor_fields(name);
```

2. **`field_results` Table**
```sql
CREATE TABLE field_results (
    id SERIAL PRIMARY KEY,
    execution_id INTEGER REFERENCES monitor_executions(id) ON DELETE CASCADE,
    field_name VARCHAR(100) NOT NULL,
    raw_value TEXT,
    normalized_value DOUBLE PRECISION,
    extraction_time_ms INTEGER,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_field_results_execution_id ON field_results(execution_id);
CREATE INDEX idx_field_results_field_name ON field_results(field_name);
```

#### **Existing Table Modifications:**

**`monitors` Table - Add New Column:**
```sql
ALTER TABLE monitors ADD COLUMN is_multi_field BOOLEAN DEFAULT FALSE;
```

### **🔄 Alembic Migration Script**

```python
"""Add multi-field support to monitors

Revision ID: add_multi_field_support
Revises: initial
Create Date: 2026-04-03 21:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

def upgrade():
    # Step 1: Add new column to existing monitors table
    op.add_column('monitors', sa.Column('is_multi_field', sa.Boolean(), default=False, nullable=False))
    
    # Step 2: Create monitor_fields table
    op.create_table('monitor_fields',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('monitor_id', sa.Integer(), sa.ForeignKey('monitors.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('selector', sa.Text(), nullable=False),
        sa.Column('extraction_type', sa.String(50), default='text', nullable=False),
        sa.Column('attribute_name', sa.String(100), nullable=True),
        sa.Column('normalization', sa.String(200), nullable=True),
        sa.Column('wait_selector', sa.Text(), nullable=True),
        sa.Column('position', sa.Integer(), default=0, nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('NOW()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('NOW()'), nullable=False)
    )
    
    # Step 3: Create field_results table for execution results
    op.create_table('field_results',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('execution_id', sa.Integer(), sa.ForeignKey('monitor_executions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('field_name', sa.String(100), nullable=False),
        sa.Column('raw_value', sa.Text(), nullable=True),
        sa.Column('normalized_value', sa.Float(), nullable=True),
        sa.Column('extraction_time_ms', sa.Integer(), nullable=True),
        sa.Column('success', sa.Boolean(), default=True, nullable=False),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('NOW()'), nullable=False)
    )
    
    # Step 4: Create performance indexes
    op.create_index('idx_monitor_fields_monitor_id', 'monitor_fields', ['monitor_id'])
    op.create_index('idx_monitor_fields_name', 'monitor_fields', ['name'])
    op.create_index('idx_field_results_execution_id', 'field_results', ['execution_id'])
    op.create_index('idx_field_results_field_name', 'field_results', ['field_name'])

def downgrade():
    # Reverse order for safe rollback
    op.drop_index('idx_field_results_field_name')
    op.drop_index('idx_field_results_execution_id')
    op.drop_index('idx_monitor_fields_name')
    op.drop_index('idx_monitor_fields_monitor_id')
    op.drop_table('field_results')
    op.drop_table('monitor_fields')
    op.drop_column('monitors', 'is_multi_field')
```

### **⚠️ Migration Safety Measures**

#### **Pre-Migration Checklist:**
- [ ] **Database backup** created and verified
- [ ] **Staging environment** tested successfully
- [ ] **Rollback plan** documented and tested
- [ ] **Migration script** reviewed by team
- [ ] **Performance impact** assessed

#### **Migration Commands:**
```bash
# 1. Create backup
timestamp=$(date +%Y%m%d_%H%M%S)
pg_dump -h localhost -U postgres task2sms > backup_${timestamp}.sql
echo "Backup created: backup_${timestamp}.sql"

# 2. Generate migration file
alembic revision --autogenerate -m "Add multi-field support to monitors"

# 3. Review generated migration
cat alembic/versions/add_multi_field_support.py

# 4. Test migration on staging
alembic upgrade head

# 5. Verify migration success
psql -h localhost -U postgres -d task2sms -c "\dt monitor_fields"
psql -h localhost -U postgres -d task2sms -c "\dt field_results"
```

#### **Post-Migration Verification:**
```sql
-- Verify tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name IN ('monitor_fields', 'field_results');

-- Verify new column exists
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'monitors' AND column_name = 'is_multi_field';

-- Verify indexes created
SELECT indexname FROM pg_indexes 
WHERE indexname IN ('idx_monitor_fields_monitor_id', 'idx_monitor_fields_name');

-- Test data integrity
SELECT COUNT(*) as total_monitors FROM monitors;
SELECT COUNT(*) as multi_field_monitors FROM monitors WHERE is_multi_field = true;
SELECT COUNT(*) as total_fields FROM monitor_fields;
```

### **📊 Migration Impact Analysis**

#### **Storage Requirements:**
- **monitor_fields table**: ~50KB per 1,000 fields
- **field_results table**: ~100KB per 10,000 execution results  
- **Indexes**: ~20KB for performance optimization
- **Total overhead**: <1MB for typical deployment

#### **Performance Impact:**
- **Query speed**: Improved with proper indexing
- **Memory usage**: +5% for multi-field monitors
- **CPU usage**: No impact on existing single-field monitors
- **Network latency**: No change (same API endpoints)

#### **Backward Compatibility:**
- ✅ **Existing monitors**: Continue working unchanged
- ✅ **Single-field API**: Remains fully functional
- ✅ **Data migration**: Zero existing data modified
- ✅ **Feature flag**: Opt-in via `is_multi_field=true`

### **🚨 Risk Mitigation**

#### **Rollback Plan:**
```bash
# If migration fails, immediate rollback
alembic downgrade -1 add_multi_field_support

# Verify rollback success
psql -c "\dt" | grep -E "(monitor_fields|field_results)"
# Should return no results
```

#### **Monitoring During Migration:**
- **Database connections**: Monitor for spikes
- **API response times**: Check for degradation
- **Error rates**: Watch for anomalies
- **User feedback**: Collect migration issues

### **🔄 Zero-Downtime Deployment Strategy**

#### **Phase 1: Preparation (5 minutes)**
1. **Database backup** (2 minutes)
2. **Health check** (1 minute)  
3. **Load testing** (2 minutes)

#### **Phase 2: Migration (2 minutes)**
1. **Apply migration** (30 seconds)
2. **Verify success** (30 seconds)
3. **Update application** (1 minute)

#### **Phase 3: Validation (3 minutes)**
1. **Smoke tests** (1 minute)
2. **User acceptance** (1 minute)
3. **Monitor stability** (1 minute)

**Total migration time: ~10 minutes with zero downtime** transforms Task2SMS from a **simple value monitor** to a **comprehensive data extraction platform**. This opens up use cases in:

- **Sports betting**: Score combinations, player stats, odds
- **Financial markets**: Price spreads, volume analysis, indicators
- **E-commerce**: Price + stock + rating monitoring
- **Weather data**: Multiple sensor readings
- **Social media**: Engagement metrics across platforms

This feature positions Task2SMS as a **professional-grade monitoring solution** capable of handling complex, real-world monitoring scenarios.

---

**Ready for implementation! 🚀**
