"""
Core domain objects for web scraping operations

These represent the fundamental data structures used across all scraping components.
"""

from dataclasses import dataclass
from typing import Optional
import time
import logging

from app.services.integrations.scraper_service import _fetch_static, _fetch_dynamic, _extract

logger = logging.getLogger(__name__)


@dataclass
class FetchResult:
    """Result of fetching a page"""
    html: str
    method: str  # "static" | "playwright" 
    duration_ms: int
    error: Optional[str] = None


@dataclass 
class ExtractResult:
    """Result of extracting value from HTML"""
    value: Optional[str]
    error: Optional[str] = None
    diagnosis: Optional[str] = None


@dataclass
class ScrapeResult:
    """Complete result of scraping operation (fetch + extract)"""
    success: bool
    value: Optional[str]
    html_preview: Optional[str]
    duration_ms: int
    fetch_method: str
    used_playwright: bool
    error: Optional[str] = None
    diagnosis: Optional[str] = None


class PageFetcher:
    """
    Single responsibility: Fetch HTML from URLs
    
    Consolidates all fetching logic from picker, test-selector, and monitors.
    """
    
    @staticmethod
    async def fetch(
        url: str,
        use_playwright: bool = False,
        wait_selector: Optional[str] = None,
        wait_ms: int = 8000,
        user_agent: Optional[str] = None,
        extra_headers: Optional[dict] = None,
        timeout: int = 30
    ) -> FetchResult:
        """
        Fetch HTML from URL using appropriate method
        
        Args:
            url: Target URL
            use_playwright: Whether to use Playwright (JavaScript execution)
            wait_selector: CSS selector to wait for (Playwright only)
            wait_ms: Milliseconds to wait (Playwright only)
            user_agent: Custom user agent
            extra_headers: Additional HTTP headers
            timeout: Request timeout in seconds
            
        Returns:
            FetchResult with HTML and metadata
        """
        start = time.monotonic()
        
        try:
            if use_playwright:
                logger.info(f"PageFetcher: Using Playwright for {url}")
                html = await _fetch_dynamic(
                    url,
                    user_agent=user_agent,
                    wait_selector=wait_selector,
                    wait_ms=wait_ms
                )
                method = "playwright"
                logger.info(f"PageFetcher: Playwright completed, got {len(html)} characters")
            else:
                logger.info(f"PageFetcher: Using static fetch for {url}")
                html = await _fetch_static(url, user_agent, extra_headers, timeout)
                method = "static"
                logger.info(f"PageFetcher: Static fetch completed, got {len(html)} characters")
            
            duration_ms = int((time.monotonic() - start) * 1000)
            
            return FetchResult(
                html=html,
                method=method,
                duration_ms=duration_ms
            )
            
        except Exception as e:
            duration_ms = int((time.monotonic() - start) * 1000)
            logger.error(f"PageFetcher failed for {url}: {e}")
            
            return FetchResult(
                html="",
                method="playwright" if use_playwright else "static",
                duration_ms=duration_ms,
                error=str(e)
            )


class ElementExtractor:
    """
    Single responsibility: Extract values from HTML using selectors
    
    Consolidates all extraction logic from picker, test-selector, and monitors.
    """
    
    @staticmethod
    def extract(
        html: str,
        selector_type: str,
        selector: str,
        attribute: Optional[str] = None
    ) -> ExtractResult:
        """
        Extract value from HTML using selector
        
        Args:
            html: HTML content to extract from
            selector_type: css, xpath, text, regex, js_expr
            selector: CSS selector or expression
            attribute: HTML attribute to extract (optional)
            
        Returns:
            ExtractResult with value and diagnostic information
        """
        try:
            value = _extract(html, selector_type, selector, attribute)
            
            # Generate diagnosis if extraction failed
            diagnosis = None
            if value is None:
                if selector_type == "js_expr":
                    diagnosis = (
                        "JS expression returned no value. Check that each css('...') "
                        "selector matches an element and the text is numeric."
                    )
                else:
                    diagnosis = (
                        "Selector not found in page. "
                        "The element may not exist or the selector may be incorrect."
                    )
            elif value == "":
                diagnosis = (
                    "Element found but its text/value is empty. "
                    "This might be a JavaScript-populated element."
                )
            
            return ExtractResult(
                value=value,
                diagnosis=diagnosis
            )
            
        except Exception as e:
            logger.error(f"ElementExtractor failed: {e}")
            return ExtractResult(
                value=None,
                error=str(e),
                diagnosis=f"Extraction failed: {str(e)}"
            )


class WebScraper:
    """
    High-level service: Coordinates PageFetcher and ElementExtractor
    
    This is the main interface used by picker, test-selector, and monitors.
    Provides a complete scraping operation in a single method call.
    """
    
    @staticmethod
    async def scrape(
        url: str,
        selector_type: str,
        selector: str,
        attribute: Optional[str] = None,
        use_playwright: bool = False,
        wait_selector: Optional[str] = None,
        wait_ms: int = 8000,
        user_agent: Optional[str] = None,
        extra_headers: Optional[dict] = None,
        timeout: int = 30
    ) -> ScrapeResult:
        """
        Complete scraping operation: fetch page + extract value
        
        Args:
            url: Target URL
            selector_type: css, xpath, text, regex, js_expr
            selector: CSS selector or expression
            attribute: HTML attribute to extract (optional)
            use_playwright: Whether to use Playwright (JavaScript execution)
            wait_selector: CSS selector to wait for (Playwright only)
            wait_ms: Milliseconds to wait (Playwright only)
            user_agent: Custom user agent
            extra_headers: Additional HTTP headers
            timeout: Request timeout in seconds
            
        Returns:
            ScrapeResult with complete operation results
        """
        # Step 1: Fetch the page
        fetch_result = await PageFetcher.fetch(
            url=url,
            use_playwright=use_playwright,
            wait_selector=wait_selector,
            wait_ms=wait_ms,
            user_agent=user_agent,
            extra_headers=extra_headers,
            timeout=timeout
        )
        
        # If fetch failed, return early
        if fetch_result.error:
            return ScrapeResult(
                success=False,
                value=None,
                html_preview=None,
                duration_ms=fetch_result.duration_ms,
                fetch_method=fetch_result.method,
                used_playwright=fetch_result.method == "playwright",
                error=fetch_result.error,
                diagnosis=f"Failed to fetch page: {fetch_result.error}"
            )
        
        # Step 2: Extract the value
        extract_result = ElementExtractor.extract(
            html=fetch_result.html,
            selector_type=selector_type,
            selector=selector,
            attribute=attribute
        )
        
        # Combine results
        success = extract_result.value is not None and extract_result.value != ""
        
        return ScrapeResult(
            success=success,
            value=extract_result.value,
            html_preview=fetch_result.html[:500] + "..." if fetch_result.html and len(fetch_result.html) > 500 else fetch_result.html,
            duration_ms=fetch_result.duration_ms,
            fetch_method=fetch_result.method,
            used_playwright=fetch_result.method == "playwright",
            error=extract_result.error,
            diagnosis=extract_result.diagnosis
        )


class SelectorValidator:
    """
    Utility class for quick selector validation
    
    Used by monitor creation/update to validate selectors before saving.
    """
    
    @staticmethod
    async def validate(
        url: str,
        selector_type: str,
        selector: str,
        attribute: Optional[str] = None,
        use_playwright: bool = False,
        wait_ms: int = 3000
    ) -> tuple[bool, Optional[str]]:
        """
        Quick validation for monitor creation/update
        
        Args:
            url: Target URL
            selector_type: css, xpath, text, regex, js_expr
            selector: CSS selector or expression
            attribute: HTML attribute to extract (optional)
            use_playwright: Whether to use Playwright
            wait_ms: Milliseconds to wait (Playwright only)
            
        Returns:
            (is_valid, error_message)
        """
        result = await WebScraper.scrape(
            url=url,
            selector_type=selector_type,
            selector=selector,
            attribute=attribute,
            use_playwright=use_playwright,
            wait_ms=wait_ms
        )
        
        if result.success:
            return True, None
        else:
            error_msg = result.diagnosis or result.error or "Selector validation failed"
            return False, error_msg
