---
"gooseworks": patch
---

html-frames 1.2.0: scenes can now be timed by a voice track (`speech`, with `tail_s` held at the end) or held by how many words they show (`pace`). The page gets the voice track as `kit.speech` and each scene's words as `kit.scenes[i].words`. A style can mark where captions go (`caption_zone`) and which last scenes are the end card (`end_card_scenes`), and with `skip_blank` a step whose scenes have no text makes nothing instead of a blank video.
