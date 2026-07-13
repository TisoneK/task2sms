# JSON Data Extraction Feature Plan

## 🎯 Problem Statement

Modern web applications increasingly store data in **JSON format** within HTML pages:
- **React/Vue/SPA apps** embed state in `<script>` tags
- **E-commerce sites** use JSON-LD for product data
- **Financial platforms** store real-time data in JavaScript objects
- **API responses** embedded as structured JSON

Current Task2SMS can only extract **text content** from HTML elements, missing this crucial data source.

## 🚀 Solution: JSON Data Extraction

### **Core Concept**
Extract and parse **JSON data** embedded in web pages using **JSON path navigation** (like XPath for JSON objects).

## 📋 Feature Requirements

### **1. Enhanced Data Models**

#### **MonitorField Model Enhancement**
```python
from enum import Enum

class ExtractionType(str, Enum):
    TEXT = "text"
    NUMBER = "number" 
    ATTRIBUTE = "attribute"
    JSON = "json"  # NEW: JSON extraction type

class MonitorField(Base):
    id: int = Column(Integer, primary_key=True)
    monitor_id: int = Column(Integer, ForeignKey("monitors.id"))
    name: str = Column(String(100))
    selector: str = Column(Text())
    extraction_type: str = Column(Enum(ExtractionType), default=ExtractionType.TEXT)
    attribute_name: Optional[str] = Column(String(100))  # For attribute extraction
    normalization: Optional[str] = Column(String(200))
    wait_selector: Optional[str] = Column(Text())
    position: int = Column(Integer)
    
    # NEW: JSON-specific fields
    json_path: Optional[str] = Column(String(500))  # JSON path like "product.price"
    json_filter: Optional[str] = Column(Text())  # JSON filter expression
```

#### **Enhanced Extraction Results**
```python
class JsonExtractionResult(Base):
    id: int = Column(Integer, primary_key=True)
    field_execution_id: int = Column(Integer, ForeignKey("field_executions.id"))
    raw_json: str = Column(Text())  # Raw JSON string
    parsed_data: str = Column(Text())  # Pretty-printed JSON
    extracted_value: str = Column(Text())  # Final extracted value
    extraction_time_ms: int = Column(Integer)
    success: bool = Column(Boolean)
    error_message: Optional[str] = Column(Text())
```

### **2. JSON Extraction Service**

#### **Core JSON Extraction Logic**
```python
import json
import re
from typing import Any, Dict, List, Optional
from bs4 import BeautifulSoup

class JsonExtractor:
    def __init__(self):
        self.json_cache = {}  # Cache parsed JSON objects
    
    def extract_json_data(self, html: str, selector: str, json_path: str = None, 
                      json_filter: str = None) -> JsonExtractResult:
        """Extract JSON data from HTML page"""
        
        try:
            soup = BeautifulSoup(html, 'html.parser')
            
            # Find JSON script tags
            json_scripts = soup.find_all('script', type='application/json')
            
            for script in json_scripts:
                script_content = script.string or script.get_text()
                if not script_content:
                    continue
                
                try:
                    # Parse JSON data
                    data = json.loads(script_content.strip())
                    
                    # Apply JSON path if specified
                    if json_path:
                        value = self._navigate_json_path(data, json_path)
                    else:
                        value = data
                    
                    # Apply JSON filter if specified
                    if json_filter:
                        value = self._apply_json_filter(value, json_filter)
                    
                    return JsonExtractResult(
                        success=True,
                        raw_json=script_content,
                        parsed_data=json.dumps(data, indent=2),
                        extracted_value=str(value),
                        data_type=type(value).__name__
                    )
                    
                except json.JSONDecodeError as e:
                    continue  # Try next script
                    
        except Exception as e:
            return JsonExtractResult(
                success=False,
                error=f"JSON extraction failed: {str(e)}"
            )
        
        return JsonExtractResult(
            success=False,
            error="No valid JSON data found"
        )
    
    def _navigate_json_path(self, data: Any, path: str) -> Any:
        """Navigate JSON path like 'product.price' or 'user.profile.name'"""
        
        if not path or path == '.':
            return data
        
        # Split path into components
        parts = path.split('.')
        current = data
        
        try:
            for part in parts:
                if isinstance(current, dict) and part in current:
                    current = current[part]
                elif isinstance(current, list) and part.isdigit():
                    index = int(part)
                    if 0 <= index < len(current):
                        current = current[index]
                else:
                    return None
            return current
        except (KeyError, IndexError, TypeError):
            return None
    
    def _apply_json_filter(self, data: Any, filter_expr: str) -> Any:
        """Apply filter expression to JSON data"""
        
        # Simple filter syntax: "price > 100" or "status == 'active'"
        if not filter_expr:
            return data
        
        try:
            # Basic comparison operators
            if '>' in filter_expr:
                field, value = filter_expr.split('>', 1)
                field = field.strip()
                value = float(value.strip())
                return self._get_nested_value(data, field) > value
            
            if '<' in filter_expr:
                field, value = filter_expr.split('<', 1)
                field = field.strip()
                value = float(value.strip())
                return self._get_nested_value(data, field) < value
            
            if '==' in filter_expr:
                field, value = filter_expr.split('==', 1)
                field = field.strip()
                value = value.strip().strip('"\'')
                return str(self._get_nested_value(data, field)) == value
            
            # Add more operators as needed...
            
        except Exception:
            return data
    
    def _get_nested_value(self, data: Any, path: str) -> Any:
        """Get nested value from data structure"""
        if '.' not in path:
            return data.get(path)
        
        parts = path.split('.')
        current = data
        for part in parts[:-1]:
            if isinstance(current, dict) and part in current:
                current = current[part]
            else:
                return None
        return current

class JsonExtractResult:
    def __init__(self, success: bool, raw_json: str = None, parsed_data: str = None,
                 extracted_value: str = None, data_type: str = None, error: str = None):
        self.success = success
        self.raw_json = raw_json
        self.parsed_data = parsed_data
        self.extracted_value = extracted_value
        self.data_type = data_type
        self.error = error
```

#### **Enhanced Web Scraping Service**
```python
class WebScraper:
    def __init__(self):
        self.page_fetcher = PageFetcher()
        self.element_extractor = ElementExtractor()
        self.json_extractor = JsonExtractor()
    
    async def extract_field(self, url: str, selector: str, extraction_type: str,
                        attribute_name: str = None, json_path: str = None,
                        json_filter: str = None, wait_ms: int = 8000,
                        use_playwright: bool = True) -> ExtractResult:
        """Extract field using appropriate method"""
        
        # Fetch page content
        fetch_result = await self.page_fetcher.fetch(
            url=url, use_playwright=use_playwright, wait_ms=wait_ms
        )
        
        if extraction_type == ExtractionType.JSON:
            # JSON extraction
            result = self.json_extractor.extract_json_data(
                html=fetch_result.html,
                selector=selector,
                json_path=json_path,
                json_filter=json_filter
            )
        else:
            # Traditional HTML element extraction
            result = await self.element_extractor.extract(
                html=fetch_result.html,
                selector=selector,
                extraction_type=extraction_type,
                attribute_name=attribute_name
            )
        
        return ExtractResult(
            value=result.extracted_value,
            success=result.success,
            error=result.error,
            used_playwright=fetch_result.used_playwright,
            duration_ms=fetch_result.duration_ms
        )
```

### **3. API Endpoint Enhancements**

#### **JSON Field Test Endpoint**
```python
@router.post("/test-json-field")
async def test_json_field(request: JsonFieldTestRequest):
    """Test JSON field extraction"""
    
    result = await web_scraper.extract_field(
        url=request.url,
        selector=request.selector,
        extraction_type=ExtractionType.JSON,
        json_path=request.json_path,
        json_filter=request.json_filter,
        wait_ms=request.wait_ms,
        use_playwright=request.use_playwright
    )
    
    return {
        "success": result.success,
        "value": result.value,
        "raw_json": result.raw_json if hasattr(result, 'raw_json') else None,
        "parsed_data": result.parsed_data if hasattr(result, 'parsed_data') else None,
        "data_type": result.data_type,
        "error": result.error,
        "used_playwright": result.used_playwright,
        "duration_ms": result.duration_ms
    }

class JsonFieldTestRequest(BaseModel):
    url: str
    selector: str
    json_path: Optional[str] = None
    json_filter: Optional[str] = None
    wait_ms: int = 8000
    use_playwright: bool = True
```

#### **Enhanced Monitor Create/Update**
```python
class MonitorFieldCreate(BaseModel):
    name: str
    selector: str
    extraction_type: str = ExtractionType.TEXT
    attribute_name: Optional[str] = None
    normalization: Optional[str] = None
    wait_selector: Optional[str] = None
    position: int = 0
    
    # NEW: JSON-specific fields
    json_path: Optional[str] = None
    json_filter: Optional[str] = None

class MonitorCreate(BaseModel):
    # Existing fields...
    fields: Optional[List[Union[MonitorFieldCreate, JsonFieldCreate]]] = []
    is_multi_field: bool = False
    condition: Optional[str] = None
```

### **4. Frontend JSON Extraction Components**

#### **JSON Field Builder**
```jsx
const JsonFieldBuilder = ({ value, onChange, onTest }) => {
  const [extractionType, setExtractionType] = useState('text')
  const [jsonPath, setJsonPath] = useState('')
  const [jsonFilter, setJsonFilter] = useState('')
  const [preview, setPreview] = useState('')
  
  const examples = {
    json: [
      { path: 'product.price', desc: 'Product price from JSON data' },
      { path: 'user.profile.name', desc: 'Username from user profile' },
      { path: 'gameData.homeScore', desc: 'Home score from game data' },
      { path: 'config.theme', desc: 'App theme setting' }
    ]
  }
  
  const buildPreview = () => {
    if (jsonPath && extractionType === 'json') {
      const example = examples.find(ex => ex.path === jsonPath)
      setPreview(example ? `Will extract: ${example.desc}` : 'Enter a JSON path')
    }
  }
  
  return (
    <div>
      <Select
        label="Extraction Type"
        options={[
          { value: 'text', label: 'HTML Element Text' },
          { value: 'number', label: 'HTML Element Number' },
          { value: 'attribute', label: 'HTML Element Attribute' },
          { value: 'json', label: 'JSON Data Extraction' }
        ]}
        value={extractionType}
        onChange={setExtractionType}
      />
      
      {extractionType === 'json' && (
        <div>
          <Input
            placeholder="product.price, user.name, gameData.homeScore"
            value={jsonPath}
            onChange={setJsonPath}
            onFocus={buildPreview}
          />
          
          <Input
            placeholder="price > 100, status == 'active'"
            value={jsonFilter}
            onChange={setJsonFilter}
          />
          
          {preview && (
            <Preview>
              {preview}
            </Preview>
          )}
          
          <HelpText>
            <strong>JSON Path Examples:</strong>
            {examples.map((ex, i) => (
              <div key={i}>
                <code>{ex.path}</code> - {ex.desc}
              </div>
            ))}
          </HelpText>
        </div>
      )}
      
      <Button onClick={() => onTest({
        extractionType,
        jsonPath,
        jsonFilter
      })}>
        Test JSON Extraction
      </Button>
    </div>
  )
}
```

#### **JSON Path Visualizer**
```jsx
const JsonPathVisualizer = ({ jsonPath, jsonData }) => {
  const [highlightedPath, setHighlightedPath] = useState([])
  
  const navigatePath = (path) => {
    const parts = path.split('.')
    let current = jsonData
    
    try {
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i]
        if (typeof current === 'object' && current[part]) {
          current = current[part]
          setHighlightedPath([...highlightedPath, parts.slice(0, i + 1)])
        } else {
          return null
        }
      }
      
      if (parts.length === 1) {
        return current
      }
      
      const lastPart = parts[parts.length - 1]
      if (typeof current === 'object' && current[lastPart]) {
        return current[lastPart]
      }
    } catch (e) {
      return null
    }
  }
  
  return (
    <div>
      <h4>JSON Path: {jsonPath}</h4>
      <div className="json-visualizer">
        {highlightedPath.map((part, i) => (
          <span key={i} className="path-part">{part}</span>
        ))}
        <span className="path-arrow"> → </span>
        <span className="result-value">
          {navigatePath(jsonPath)}
        </span>
      </div>
    </div>
  )
}
```

### **5. Database Migration**

#### **JSON Extraction Schema Changes**
```python
def upgrade():
    # ... existing multi-field migration ...
    
    # Add JSON-specific columns to monitor_fields
    op.add_column('monitor_fields', sa.Column('json_path', sa.String(500)))
    op.add_column('monitor_fields', sa.Column('json_filter', sa.Text()))
    
    # Create json_extraction_results table
    op.create_table('json_extraction_results',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('field_execution_id', sa.Integer(), sa.ForeignKey('field_executions.id')),
        sa.Column('raw_json', sa.Text()),
        sa.Column('parsed_data', sa.Text()),
        sa.Column('extracted_value', sa.Text()),
        sa.Column('data_type', sa.String(50)),
        sa.Column('extraction_time_ms', sa.Integer()),
        sa.Column('success', sa.Boolean()),
        sa.Column('error_message', sa.Text())
    )
```

## 🎯 Use Cases & Examples

### **1. E-commerce Product Data**
```json
{
  "name": "Amazon Product Monitor",
  "url": "https://amazon.com/dp/B08N5WRWNW",
  "fields": [
    {
      "name": "product_info",
      "selector": "script[type='application/json']",
      "extraction_type": "json",
      "json_path": "product"
    },
    {
      "name": "product_price",
      "selector": "script[type='application/json']", 
      "extraction_type": "json",
      "json_path": "product.price",
      "normalization": "extract_numbers"
    },
    {
      "name": "product_availability",
      "selector": "script[type='application/json']",
      "extraction_type": "json", 
      "json_path": "product.availability",
      "json_filter": "status == 'In Stock'"
    }
  ],
  "condition": "product_price < 1000 && product_availability == true"
}
```

**Extracted JSON Data:**
```json
{
  "product": {
    "id": "B08N5WRWNW",
    "name": "iPhone 15",
    "price": 999.99,
    "availability": true,
    "specs": {
      "storage": "128GB",
      "color": "Blue"
    }
  }
}
```

### **2. Sports Game Data**
```json
{
  "name": "Basketball Game Monitor",
  "url": "https://flashscore.com/match/...",
  "fields": [
    {
      "name": "game_state",
      "selector": "script",
      "extraction_type": "json",
      "json_path": "gameData"
    },
    {
      "name": "home_score",
      "selector": "script", 
      "extraction_type": "json",
      "json_path": "gameData.homeScore"
    },
    {
      "name": "away_score",
      "selector": "script",
      "extraction_type": "json", 
      "json_path": "gameData.awayScore"
    }
  ],
  "condition": "home_score + away_score > 150"
}
```

### **3. Financial Market Data**
```json
{
  "name": "Stock Quote Monitor",
  "url": "https://finance.yahoo.com/quote/AAPL",
  "fields": [
    {
      "name": "bid_price",
      "selector": "script[type='application/json']",
      "extraction_type": "json",
      "json_path": "quoteData.bid"
    },
    {
      "name": "ask_price",
      "selector": "script[type='application/json']",
      "extraction_type": "json",
      "json_path": "quoteData.ask"
    },
    {
      "name": "volume",
      "selector": "script[type='application/json']",
      "extraction_type": "json",
      "json_path": "quoteData.volume"
    }
  ],
  "condition": "Math.abs(bid_price - ask_price) < 0.01"
}
```

### **4. SPA Application State**
```json
{
  "name": "React App Monitor",
  "url": "https://example.com/app",
  "fields": [
    {
      "name": "user_name",
      "selector": "script#__NEXT_DATA__",
      "extraction_type": "json",
      "json_path": "props.initialState.user.profile.name"
    },
    {
      "name": "app_theme",
      "selector": "script#__NEXT_DATA__",
      "extraction_type": "json",
      "json_path": "props.initialState.theme"
    },
    {
      "name": "feature_flags",
      "selector": "script#__NEXT_DATA__",
      "extraction_type": "json",
      "json_path": "props.initialState.features"
    }
  ]
}
```

### **5. API Response Monitoring**
```json
{
  "name": "API Response Monitor",
  "url": "https://api.example.com/data",
  "fields": [
    {
      "name": "response_data",
      "selector": "pre[id='api-data']",
      "extraction_type": "json",
      "json_path": "$"  # Root JSON object
    },
    {
      "name": "user_count",
      "selector": "pre[id='api-data']",
      "extraction_type": "json",
      "json_path": "users.length"
    },
    {
      "name": "server_status",
      "selector": "pre[id='api-data']",
      "extraction_type": "json",
      "json_path": "status",
      "json_filter": "status == 'healthy'"
    }
  ]
}
```

## 🚀 Implementation Phases

### **Phase 1: JSON Extraction Engine (Week 1)**
1. ✅ JsonExtractor class with path navigation
2. ✅ JSON filter expressions (>, <, ==, contains)
3. ✅ Enhanced error handling and validation
4. ✅ Performance caching for parsed JSON

### **Phase 2: API Integration (Week 2)**
1. ✅ JSON field test endpoint
2. ✅ Enhanced monitor creation/update with JSON fields
3. ✅ JsonFieldTestRequest model
4. ✅ Integration with existing WebScraper

### **Phase 3: Frontend Development (Week 3)**
1. ✅ JsonFieldBuilder component with path visualizer
2. ✅ JSON path examples and auto-completion
3. ✅ Filter expression builder
4. ✅ Real-time preview functionality

### **Phase 4: Database & Testing (Week 4)**
1. ✅ Database migration for JSON columns
2. ✅ Performance testing with real-world JSON data
3. ✅ Error handling and edge case coverage
4. ✅ Documentation and examples

## 🎯 Benefits

### **For Users:**
- **Structured data access** instead of HTML parsing
- **More reliable** extraction from JSON APIs
- **Better performance** (no HTML parsing needed)
- **Advanced filtering** with JSON expressions
- **Visual path building** with live preview

### **For System:**
- **Modern web compatibility** with React/Vue/SPA apps
- **Clean separation** of JSON vs HTML extraction
- **Extensible design** for future data formats
- **Performance optimized** with JSON caching

## 📊 Success Metrics

### **Technical Metrics:**
- **JSON extraction accuracy**: >98% for valid JSON
- **Path navigation speed**: <100ms for complex paths
- **Memory efficiency**: 50% less than HTML parsing
- **Error rate**: <2% for malformed JSON

### **User Experience Metrics:**
- **JSON path setup time**: <1 minute with examples
- **Learning curve**: <15 minutes for JSON basics
- **Success rate**: >95% for structured data sites
- **Feature adoption**: >80% users prefer JSON for modern sites

## 🎉 Conclusion

JSON Data Extraction transforms Task2SMS from a **HTML-only scraper** to a **comprehensive data extraction platform** capable of handling:

- **Traditional HTML elements** (existing functionality)
- **Multi-element field combinations** (planned feature)
- **Structured JSON data** (this new feature)

This positions Task2SMS as a **future-proof monitoring solution** ready for modern web applications and APIs.

---

**Ready for implementation! 🚀**
