---
"gooseworks": patch
---

Device sign-in prints the link the server returns for its environment (for example the staging Growth app), falling back to the CLI's own frontend address only when that link is not a GooseWorks `/link` URL.

Staging sign-in and staged skill links now use the staging Growth app, `ads-staging.gooseworks.ai`, instead of the retired `app.staging.gooseworks.ai`.
