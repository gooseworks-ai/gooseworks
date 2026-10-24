---
"gooseworks": minor
---

The six entry skills (gooseworks, goose-ads, goose-video, goose-video-local, make-custom-video, goose-product-photos) now come from the public goose-skills catalog (`skills/entry/<slug>/`) instead of being built into the CLI. `install`, `update` and the login refresh download every file each entry lists in the catalog index and write them to the same skills folder, with the same protection for edited files. If the catalog can't be reached, the command says so and changes no skill files. `skills status` now compares installed files with the catalog's copies, and the CLI with the published npm version. The npm package no longer ships a `skills/` folder.
