---
"gooseworks": patch
---

When `gooseworks video make` or `gooseworks video check` needs a sign-in where no one may be watching (CI, or no terminal), it prints the approval link and asks to run the same command again, instead of waiting.
