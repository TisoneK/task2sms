"""Proxy — re-exports from core subpackage."""
from app.services.core.user_service import *  # noqa
from app.services.core.user_service import (
    get_user_by_id, get_user_by_email, get_user_by_username,
    create_user, authenticate_user,
)
