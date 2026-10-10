---
"gooseworks": patch
---

`gooseworks video make` tells the server why a video stopped: a failed step, a failed final check or a stop before the steps (such as a withdrawn part) sends its step, a code and the same plain words the person sees, so the card can say what happened. A server that doesn't take the reason yet gets the report without it. A step that fails the same way on every run now asks for a changed plan instead of saying to run the same command again, and stop messages no longer name parts or steps; those go to the run log. Style package refusals no longer name files either. A WebM or Matroska recording written as a stream, with no length in its header, is no longer refused: the kit reads its length from the stream or its last packet.
