---
"gooseworks": patch
---

The `gooseworks` router (2.2.1), `goose-ads` (3.2.1) and `goose-product-photos` (1.1.1) now send their own name and version in `client` on every GooseWorks call. The server compares it with the published version and, in a terminal app with an older or unversioned copy, adds one step saying to run `gooseworks update` and start a new session. Release after the gooseworks-app change that accepts `client.skill` and `client.skill_version`: an older server refuses those fields.
