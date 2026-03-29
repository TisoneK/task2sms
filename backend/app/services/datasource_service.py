"""Proxy — re-exports from integrations subpackage."""
from app.services.integrations.datasource_service import *  # noqa
from app.services.integrations.datasource_service import (
    fetch_datasource, get_datasources, get_datasource,
)
