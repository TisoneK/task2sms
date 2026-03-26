from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, JSON, Text, Enum, func
import enum
from app.core.database import Base


class DataSourceType(str, enum.Enum):
    HTTP = "http"           # REST API poll
    POSTGRES = "postgres"   # SQL query
    MYSQL = "mysql"
    SQLITE = "sqlite"
    CSV_URL = "csv_url"     # remote CSV


class DataSource(Base):
    __tablename__ = "data_sources"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(200), nullable=False)
    type = Column(Enum(DataSourceType), nullable=False)

    # HTTP source
    url = Column(String(500), nullable=True)
    http_method = Column(String(10), default="GET")
    http_headers = Column(JSON, nullable=True)
    http_body = Column(Text, nullable=True)
    json_path = Column(String(200), nullable=True)  # e.g. "data.results"

    # DB source
    connection_string = Column(Text, nullable=True)
    query = Column(Text, nullable=True)

    # Auth
    auth_type = Column(String(20), nullable=True)   # none | bearer | basic | apikey
    auth_value = Column(Text, nullable=True)

    is_active = Column(Boolean, default=True)
    last_fetched_at = Column(DateTime(timezone=True), nullable=True)
    last_result = Column(JSON, nullable=True)        # cached last fetch

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
