---
"gooseworks": patch
---

goose-ads 3.2.0 sends new static or image ads (more like a winner, new words or font, a rejected ad, a social graphic) to the make-static-ads skill when it is installed or catalog_fetch opens it, instead of ads_generate. ads_generate stays only as the fallback while make-static-ads is not in the catalog. Pairs with the server's connect-note change (gooseworks-app, stacked on #2105).
