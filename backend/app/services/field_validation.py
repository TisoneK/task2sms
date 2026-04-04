"""
Field name validation for multi-element monitors.

Rules:
  - snake_case only: starts with lowercase letter, then lowercase letters/digits/underscores
  - 3–50 characters
  - Not a reserved system keyword
  - Unique within the monitor (checked at call site)
"""
import re
from typing import List, Optional
from dataclasses import dataclass

# ── Reserved names (mirrors scraper_monitors column names + common conflicts) ──

RESERVED_NAMES: set[str] = {
    'id', 'name', 'url', 'selector', 'selector_type', 'attribute',
    'condition', 'condition_operator', 'condition_value',
    'is_active', 'status', 'is_multi_field', 'multi_field_condition',
    'last_checked_at', 'last_value', 'last_alerted_at', 'error_message',
    'duration_ms', 'used_playwright', 'created_at', 'updated_at',
    'monitor_id', 'user_id', 'value', 'prev_value', 'result',
}

# ── Domain-specific naming suggestions ────────────────────────────────────────

FIELD_SUGGESTIONS: dict[str, list[str]] = {
    'sports':    ['home_score', 'away_score', 'total_score', 'match_status',
                  'game_time', 'quarter', 'team_name', 'player_name'],
    'finance':   ['bid_price', 'ask_price', 'volume', 'market_cap',
                  'change_percent', 'opening_price', 'closing_price', 'spread'],
    'ecommerce': ['price', 'stock_level', 'rating', 'reviews_count',
                  'availability', 'discount_price', 'brand', 'sku'],
    'weather':   ['temperature', 'humidity', 'pressure', 'wind_speed',
                  'visibility', 'uv_index', 'precipitation', 'feels_like'],
}

# Prefix → suggestions for autocomplete
PREFIX_SUGGESTIONS: dict[str, list[str]] = {
    'home':   ['home_score', 'home_team', 'home_points'],
    'away':   ['away_score', 'away_team', 'away_points'],
    'price':  ['price', 'bid_price', 'ask_price', 'discount_price'],
    'stock':  ['stock_level', 'stock_status', 'stock_count'],
    'score':  ['score', 'total_score', 'home_score', 'away_score'],
    'team':   ['team_name', 'team_score', 'team_abbreviation'],
    'bid':    ['bid_price', 'bid_size'],
    'ask':    ['ask_price', 'ask_size'],
    'temp':   ['temperature', 'temp_high', 'temp_low'],
    'wind':   ['wind_speed', 'wind_direction'],
    'change': ['change_percent', 'change_amount'],
    'total':  ['total_score', 'total_price', 'total_count'],
    'open':   ['opening_price', 'open_interest'],
    'close':  ['closing_price', 'close_time'],
    'vol':    ['volume', 'volatility'],
}

_VALID_PATTERN = re.compile(r'^[a-z][a-z0-9_]{2,49}$')


@dataclass
class ValidationResult:
    valid: bool
    error: Optional[str] = None
    suggestion: Optional[str] = None   # cleaned alternative name
    autocomplete: List[str] = None     # prefix-based autocomplete

    def __post_init__(self):
        if self.autocomplete is None:
            self.autocomplete = []


def validate_field_name(
    name: str,
    existing_names: Optional[List[str]] = None,
) -> ValidationResult:
    """
    Validate a field name.

    Args:
        name: Proposed field name.
        existing_names: Already-used field names in the same monitor (for dupe check).

    Returns:
        ValidationResult with valid flag and error/suggestions.
    """
    if not name:
        return ValidationResult(valid=False, error="Field name is required")

    # Pattern
    if not _VALID_PATTERN.match(name):
        suggestion = _clean_name(name)
        return ValidationResult(
            valid=False,
            error="Field name must start with a lowercase letter and contain only "
                  "lowercase letters, digits, and underscores (3–50 characters)",
            suggestion=suggestion if suggestion != name else None,
        )

    # Reserved
    if name in RESERVED_NAMES:
        return ValidationResult(
            valid=False,
            error=f"'{name}' is a reserved system name — choose a different name",
        )

    # Duplicate
    if existing_names and name in existing_names:
        return ValidationResult(
            valid=False,
            error=f"Field name '{name}' already exists in this monitor",
        )

    # Valid — return autocomplete suggestions based on prefix
    autocomplete = _get_autocomplete(name)
    return ValidationResult(valid=True, autocomplete=autocomplete)


def _clean_name(raw: str) -> str:
    """Convert arbitrary text to a valid snake_case field name."""
    # Lowercase, replace non-alphanumeric sequences with underscore
    cleaned = re.sub(r'[^a-z0-9]+', '_', raw.lower().strip())
    # Strip leading/trailing underscores and leading digits
    cleaned = cleaned.strip('_')
    cleaned = re.sub(r'^[0-9_]+', '', cleaned)
    # Truncate
    cleaned = cleaned[:50]
    return cleaned or 'field'


def _get_autocomplete(prefix: str) -> List[str]:
    """Return autocomplete suggestions matching the given prefix."""
    results = []
    first_word = prefix.split('_')[0]
    if first_word in PREFIX_SUGGESTIONS:
        results.extend(PREFIX_SUGGESTIONS[first_word])
    # Also check if any suggestion starts with the full prefix
    for suggestions in PREFIX_SUGGESTIONS.values():
        for s in suggestions:
            if s.startswith(prefix) and s not in results:
                results.append(s)
    return list(dict.fromkeys(results))[:6]   # deduplicated, max 6


def get_domain_suggestions(url: str) -> List[str]:
    """Return domain-appropriate field name suggestions based on the URL."""
    url_lower = url.lower()
    for domain_key, keywords in {
        'sports':    ['flashscore', 'espn', 'nba', 'nfl', 'sofascore', 'bbc.co.uk/sport'],
        'finance':   ['yahoo.com/quote', 'bloomberg', 'reuters', 'investing.com', 'binance', 'coinbase'],
        'ecommerce': ['amazon', 'ebay', 'shopify', 'jumia', 'alibaba', 'etsy'],
        'weather':   ['weather.com', 'accuweather', 'noaa', 'met.no', 'openweathermap'],
    }.items():
        if any(kw in url_lower for kw in keywords):
            return FIELD_SUGGESTIONS[domain_key]
    return []
