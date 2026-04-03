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

### **3. Enhanced Web Scraping Service**

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

## 🎉 Conclusion

The multi-element fields feature transforms Task2SMS from a **simple value monitor** to a **comprehensive data extraction platform**. This opens up use cases in:

- **Sports betting**: Score combinations, player stats, odds
- **Financial markets**: Price spreads, volume analysis, indicators
- **E-commerce**: Price + stock + rating monitoring
- **Weather data**: Multiple sensor readings
- **Social media**: Engagement metrics across platforms

This feature positions Task2SMS as a **professional-grade monitoring solution** capable of handling complex, real-world monitoring scenarios.

---

**Ready for implementation! 🚀**
