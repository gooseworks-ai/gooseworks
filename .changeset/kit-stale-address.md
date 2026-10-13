---
"gooseworks": patch
---

`gooseworks video make` and `gooseworks video check` use a saved sign-in only when it belongs to the selected environment's own address (or when `GOOSEWORKS_API_BASE` is set). A sign-in saved for any other address, such as a developer's local server, no longer sends a customer's video there: the kit talks to the environment's address and treats the computer as not signed in. When the computer is not signed in, the same command now opens GooseWorks sign-in itself and carries on, instead of stopping with "Sign in first." A worker is unchanged.
