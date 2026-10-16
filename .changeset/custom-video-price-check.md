---
"gooseworks": patch
---

The make-custom-video entry (3.6.1) prices paid requests with one read-only data_price_provider call instead of estimate_only=1, so Codex's auto-review no longer reviews, and can no longer refuse, a price check. Release with the server's data_price_provider (gooseworks-app #2082) and the matching entry text (#2086).
