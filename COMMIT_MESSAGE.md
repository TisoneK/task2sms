fix: AT statusCode 100 as success; full error display pipeline; SMS History naming; filter sync

## Changes

### backend/app/services/messaging/sms_service.py
- Treat AT statusCode 100 (Queued) AND 101 (Sent) as success — both mean AT accepted
  the message. Previously only 101 was treated as success, so Airtel messages that
  returned 100 were marked FAILED even though they delivered
- Expand AT status code map from 8 codes to full set (100–106, 401–407, 409, 500, 501)
  with correct success/failure classification and actionable solution text per code
- Store raw AT statusCode on SMSResult so the route and frontend can use it directly
- Fallback to AT status text field for unknown codes

### backend/app/api/routes/notifications.py
- Include statusCode (raw AT integer) in every result row returned to frontend —
  was previously dropped, forcing fragile string parsing downstream

### frontend/src/pages/SendSMSPage.jsx
- parseResult() uses statusCode integer lookup first, falls back to error string parsing
- statusCode 100 (Queued) renders as success with an amber queued note, not failure
- Toast states: all sent (green), all failed (red "details below"), mixed (warning)
- Auto-scroll to results panel via useRef + useEffect — toast said "see details below"
  but results were off-screen with no way to find them; now page scrolls automatically
- Toast wording simplified: removed "see", removed implication of a link/button

### frontend/src/pages/NotificationsPage.jsx
- Fix filter bug: Pending tab count included both 'pending' and 'retrying' statuses
  (so count showed 11) but the filter only matched status === 'pending' exactly,
  causing 'retrying' records to be excluded and the tab to show "No messages"
- Fix: filter === 'pending' now matches both pending and retrying records
- Fix empty state description for pending tab: "No pending or retrying messages"
- Page title: "Notification History" → "SMS History"
- Subtitle: "X total SMS messages" → "X total messages"
- Empty state title: "No notifications" → "No messages"

### frontend/src/components/ui/Layout.jsx
- Nav label: "History" → "SMS History"

### frontend/src/pages/DashboardPage.jsx
- Dashboard "Recent SMS" section link: "View all" → "SMS History →"

### backend/test_sms_debug.py
- Carrier detection uses 3-digit prefixes (was 2-digit)
- 741 now correctly identified as Safaricom (was Airtel)
- Complete CA Kenya number allocation map for all current ranges
