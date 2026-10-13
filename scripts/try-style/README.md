# try-style: make a video from a style file on this computer

**What it is.** A script that makes one whole video from a `style.json`, a `plan.json` and a `brand.json`, with no server. It runs the real kit (`makeVideo`: bindings, parts, layers, the check and the upload) against a private line that lives inside the script.

**Why.** Before this, a style could only be run after the server had approved a video for it, and only in the exact version the server pinned. Now any style folder and any goose-skills checkout can be tried, including unpublished parts.

**Key points**
- **Free by default.** Paid calls get labelled stand-ins of the right size, length and timing. Nothing leaves the computer.
- **Real calls only on request**, with `--providers real`, after a passing stand-in run of the same style file, under a per-run cap and a night cap. Every real call is priced first and reserved in a spend ledger before it is sent.
- **Native take timing uses the actual part planner.** The fake runner reloads the active take inputs, requires the planner version and generated provider prompt/duration to match, and uses those beat windows for speech, quiet ambience and Whisper words. Silent beats stay silent except for a quiet bed. Video pieces have deterministic coarse grain that stays visually distinct after the checker resizes them.
- **Proves wiring, not looks.** A stand-in run proves step order, bindings, lengths, captions, the end card, layers and the check. It says nothing about how a generated picture or voice looks or sounds.

---

## Run it

```bash
GOOSE_KIT_PARTS_DIR=<goose-skills checkout> \
GOOSE_KIT_STYLES_DIR=<goose-studio>/one-shot-videos \
npx tsx scripts/try-style.ts \
  --style <style-id> --plan plan.json --brand brand.json --out <dir> [--fresh]
```

| Flag | Meaning |
|---|---|
| `--style` | Folder name under `GOOSE_KIT_STYLES_DIR` (reads `<style>/style.json` and its fonts and frames) |
| `--plan` | The plan body: `{aspect, scenes, products, voice, music, cast, answers, footage}`. Missing keys get today's defaults |
| `--brand` | The brand: `{name, logo, colors, fonts{heading, body}, pronunciations, cta}` |
| `--out` | Output folder. Running again resumes: finished steps and pieces are reused |
| `--fresh` | Start the run over (removes this run's folder under `--out` only) |
| `--fixtures <dir>` | Extra folders to find files and `media/index.json` in (repeatable; also `GOOSE_TRY_FIXTURES`) |
| `--providers fake\|real` | Default `fake` |
| `--cap-usd <n>` | Real mode: the most this run may spend (required; at most the style's `cost.high_usd` and at most 40) |
| `--spend-ledger <file>` | Real mode: the ledger (required; also `GOOSE_TRY_SPEND_LEDGER`) |
| `--night-cap-usd <n>` | Real mode: the most the whole ledger may reach. Default and maximum 200 (also `GOOSE_TRY_NIGHT_CAP_USD`) |
| `--env-file <.env>` | Real mode: read `FAL_API_KEY` (as `FAL_KEY`) or `FAL_KEY`, and `ELEVENLABS_API_KEY`, from this file only. Without it, the same names are read from the environment |
| `--reason "<text>"` | Real mode: required for a second real run of a style the ledger already holds; written on every ledger line |
| `--tools-home <dir>` | Where the kit's pinned ffmpeg and headless browser are set up once. Default `~/.gooseworks-try-style` |

**Outputs in `--out`**

| File | What it is |
|---|---|
| `final/final.mp4` | The finished video (the exact bytes the check passed and the line received) |
| `final/checked-cut.mp4` | Only when the check failed: the cut the check judged |
| `verdict.json` | The check layer's verdict (`pass`, `checks[]`), plus `run` (status, message, seconds, spend) |
| `contact.png` | One frame per second, six across |
| `run.json` | `run_id`, `providers`, `style_id`, `style_sha` (sha256 of the style file), `status` (`done` only when the video was made, no check failed and the contact sheet exists), part and layer versions, `seconds`, `seconds_per_output_second`. Real mode's stand-in gate reads it |
| `spend.json` | Real mode only: this run's estimate, cap and ledger path |
| `pieces.jsonl` | One line per paid piece: key, provider, model, mode, status, and the estimate in real mode |
| `home/videos/<id>/` | The kit's own run folder: `runs/<run>.ndjson` (one log per run, listed in `log.ndjson`), each step's `record.json` and outputs |

The exit code is 0 only when the video was made, no check failed and the contact sheet was made.

## How it works

- **The line** (`line.ts`) answers the kit on `http://127.0.0.1:47999`, an address nothing listens on. It answers the hand-over, pieces, hosted files, progress and upload. Every other address is refused.
- **The hand-over** carries the plan, the brand, `styleHash(style.json)`, `parts_lock: null` and the layer set from the parts folder's `layers.json`. With no lock, the kit loads parts from `GOOSE_KIT_PARTS_DIR` and takes models from each part's manifest.
- **Tools.** The script sets up the kit's own pinned ffmpeg (only from its GitHub release) and headless browser in `--tools-home` once, then passes them to the kit, so step hashes match a customer's machine. To use other copies, set `FFMPEG_PATH` and `FFPROBE_PATH` (the kit's own override) and `PLAYWRIGHT_BROWSERS_PATH`. `KIT_FFMPEG` and `PLAYWRIGHT_CORE_PATH` (the goose-skills part-test variables) are not read. Secret-looking environment variables are never passed to the kit.
- **The style folder is copied into the run folder.** Before each run the script copies `<GOOSE_KIT_STYLES_DIR>/<style>/` to `<out>/home/videos/try_<style>/dev-styles/<style>/` (an APFS clone where the disk allows it, so it costs no space) and points the kit's `GOOSE_KIT_STYLES_DIR` at `dev-styles/`. The kit sends a provider only files inside the video's folder, as in production, where the style package is downloaded there. Without the copy, a step that sends one of the style's own files (whiteboard-explainer's `style_refs` picture) stops with "a file outside this video was named in a payload". The copy is made afresh every run, so an edited style is what runs. `style_sha` in `run.json` (and the real-mode gate) is still the sha256 of the original `style.json`; the copy has the same bytes.
- **Resume.** Finished provider answers are kept in `<out>/line/answers/<inputs_hash>.json`, and the links handed out in `<out>/line/served.json` and `mirrors.json`, so a resumed run never orders a finished piece again. `--fresh` clears them.

## Naming files in a plan or brand

| Written as | Becomes |
|---|---|
| A media id (`"fx-mist-pouch-cutout"`) in `products[].images[]` | a `FrozenFile`, looked up in a `media/index.json` next to the JSON, one or two folders up, or in `--fixtures` |
| `scenes[].image_asset_id`, `footage[].asset_id`, `cast[].image_asset_id` | `scenes[].image`, `footage[].file`, `cast[].image` as a `LineFile` (a file the line hosts), the way the app freezes them at the yes |
| `{ "file": "media/p.png" }` or `"file:media/p.png"` | a `FrozenFile`, anywhere in the plan or brand |
| A bare path (`"media/p.png"`) in a file slot (`brand.logo`, `brand.fonts.*`, `products[].images[]`, `scenes[].image`, `footage[].file`, `cast[].image`) | a `FrozenFile` |
| A `FrozenFile` whose `url` is a relative path | the same file, checked against its `sha256` |

Paths are found next to the JSON file, one folder up, in `--fixtures`, then in the working folder.

## The answers (the contract stand-ins and parts share)

A piece's answer reaches the kit as `{ json, file_url }`, and a part names each result file by a JSON pointer into that object (`results[].pointer`). The private line (gooseworks-app `services/video-line/providers.ts`) gives fal answers as the fal result JSON with no file, and ElevenLabs answers as a file, plus the reply JSON without `audio_base64` for `/with-timestamps`. The stand-ins keep exactly those shapes.

**The contract is recorded, and tested.** `tests/kit/fixtures/try-style-replies/<model>.json` holds, for every model in GOOSE-4015 MASTER-PLAN §4.8, the example request and the exact answer the kit gets, copied from fal's and ElevenLabs' published schemas (W0-62). `tests/kit/try-style-replies.test.ts` runs each stand-in and checks its answer against the recording: the same keys in the same order, the same JSON types, nulls where the recording has null, whole numbers for ms, bytes, pixels and seeds, and the same `content_type`. A new model needs a recording and passes the same test.

| Call | Who calls it (part@version) | Answer `json` | `file_url` | Pointer the part reads | Stand-in |
|---|---|---|---|---|---|
| ElevenLabs `POST /v1/text-to-speech/<voice>/with-timestamps` | voice-elevenlabs@1.0.1 | `{alignment, normalized_alignment}`, each `{characters[], character_start_times_seconds[], character_end_times_seconds[]}` | mp3 | `/file_url`; alignment from `json` | 220 Hz tone, 0.065 s per character, characters timed evenly |
| ElevenLabs `POST /v1/text-to-speech/<voice>` | none today | none | mp3 | `/file_url` | same tone |
| ElevenLabs `POST /v1/music` | music-elevenlabs@1.0.2 | none | mp3 | `/file_url` | silence of `music_length_ms` (a bed sits under a voice, and the check judges sound on the voice) |
| ElevenLabs `POST /v1/music/detailed` (send `with_timestamps: true` for words) | song-elevenlabs@1.0.0 (planned, W0-27) | the reply's `application/json` part verbatim: `{composition_plan, song_metadata, words_timestamps: [{word, start_ms, end_ms}]}` (whole ms) | the reply's `audio/*` part | `/file_url`; words at `/json/words_timestamps` | a 220 Hz tone (audible: in a song style the song is the only sound, and the check fails `sound` on silence) of the summed `sections[].duration_ms`; each section's `lines` words spread over its middle 80%. Refuses what the line refuses (`songProblem`): a query on the path, `music_length_ms`, `prompt`, `force_instrumental` or `generation_mode` beside the plan, and anything but 1 to 30 `sections` of whole-number `duration_ms` from 3000 to 120000 |
| ElevenLabs `POST /v1/sound-generation` | sfx-elevenlabs@1.0.1 | none | mp3 | `/file_url` | a 20 ms click, padded to `duration_seconds` |
| fal `fal-ai/whisper` | transcribe-whisper@1.0.1, captions-layer@1.1.0 | `{text, chunks: [{timestamp: [start, end], text}], inferred_languages, diarization_segments}`; each chunk's text starts with a space, as fal's does | none | `results: []`; words from `json.chunks` | the plan's spoken lines, word by word, spread over the audio's length |
| fal `fal-ai/nano-banana`, `fal-ai/nano-banana/edit` | image-nano-banana@1.0.1 | `{images: [{url, content_type, file_name, file_size, width, height}], description}` | none | `/json/images/0/url` | a bright, noisy, gridded picture with the prompt's first 60 characters, at `size` (`WxH`), `image_size`, or `aspect_ratio` (long side 1344), else 1024x1024. Bright on purpose: dark stand-ins trip the check's black-frame test |
| fal `openai/gpt-image-2`, `openai/gpt-image-2/edit` | image-gpt-image-2, cast-plate (planned) | `{images: [...as above]}` (no `description`) | none | `/json/images/0/url` | the same picture, at `image_size` |
| fal, other image models | none today | `{images: [...], seed}` (not in the contract yet) | none | `/json/images/0/url` | the same picture |
| fal `fal-ai/kling-video/{v2.1/standard, v2.5-turbo/pro, v3/standard}/image-to-video`, `fal-ai/veo3(.1)(/fast)/image-to-video`; `bytedance/seedance-2.0/*`; `minimax/h3-max/*` | video-kling, video-veo-3 (planned); video-seedance-2@1.0.1; creator-h3@1.0.2 | Kling and Veo `{video: {url, content_type, file_name, file_size}}`; Seedance adds `seed`; H3 adds `seed`, `timings: null`, `expanded_prompt: null` | none | `/json/video/url` | ffmpeg `testsrc2` labelled with the model and piece, `duration` seconds (default 5, Veo 8), size from `resolution` + `aspect_ratio` (else the first image's shape), a 330 Hz tone when `generate_audio` is true or the model speaks by default (H3, Veo, Seedance) |
| fal `veed/fabric-1.0` | lipsync-veed (planned, W0-28) | `{video: {url, content_type, file_name, file_size}}` | none | `/json/video/url` | `testsrc2` as long as the `audio_url` audio, with that audio as its track |
| fal `fal-ai/birefnet(/v2)` | product-cutout (planned, W0-30) | `{image: {url, width, height, content_type, file_name}}` | none | `/json/image/url` | the input with an alpha channel (an ellipse) |
| anything else | | | | | **refused**: add a stand-in here and a row to this table |

Files a part sends (`gooseworks-file:<id>` in a payload) are hosted by the line exactly as the kit expects. Stand-ins read them from disk; real mode puts them in fal storage (below).

## Real mode

```bash
npx tsx scripts/try-style.ts ... --out $SCRATCH/runs/<style>-real-1 \
  --providers real --cap-usd <style cost.high_usd> --spend-ledger $SCRATCH/spend.jsonl \
  --env-file /Users/akhil/projects/content-goose/.env
```

- **Gates, checked before anything is read or sent** (`gates.ts`; any one refuses the run, exit 3):
  - a folder next to `--out` holds a passing stand-in run of the same style id and the **same style file sha256** (`run.json` with `providers: "fake"` and `status: "done"`, `verdict.json` with no `fail`, `final/final.mp4`);
  - `--cap-usd` is at most the style's `cost.high_usd` and at most 40 (a style with no `cost.high_usd` is refused);
  - `--night-cap-usd` is at most 200, and the ledger is below it;
  - the ledger holds no earlier real run of this style id, unless `--reason` is given (checked again under the ledger lock before each reserve, so two runs started together can't both spend).
- **Keys** come from `--env-file` (only those two names are read, and nothing is put in the environment), else from the environment. They are never printed, logged or written, and never passed to the kit or its parts.
- **Each call is priced before it is sent.** fal: the live list price (`GET api.fal.ai/v1/models/pricing`) times the units read from the request (images, seconds); when that price or unit can't be read, the runner's own table (`usdEstimate`). ElevenLabs: the app's rates (TTS $0.10 per 1k characters, music $0.15 per minute), the same ones styles' `cost.high_usd` is built from. A call nothing can price is refused.
- **Caps.** A call is refused when it would take this run past `--cap-usd`, or the ledger past the night cap. A refusal stops the video, as an over-quote stop would.
- **The ledger.** Under a lock file shared by every runner, the night total is checked and a `reserve` line written before the call; a `done` or `failed` line follows. Lines: `{ts, run_id, style_id, style_sha, step, piece_key, provider, model, est_usd, event, billed?, reason?}`. The night total is every reserve, less reserves a provider refused at submit (`failed` with `billed: false`); a crash leaves the reserve counted. Lines from this runner's first format (`usd_estimate`) count at that value. An unreadable line refuses all spending until it is fixed by hand.
- **fal** is called through its queue API (`queue.fal.run`), polled every 3 s for up to 20 minutes. Result links in fal's answer are served to the kit through the local line.
- **Files in a fal payload go to fal storage first**, because fal can't fetch this computer's links. Each `gooseworks-file:<id>` is uploaded once per run the way `@fal-ai/client`'s `storage.upload` does it: `POST https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3` with `{content_type, file_name}` returns a signed `upload_url` and the `file_url`; the bytes are `PUT` to the `upload_url` **without** the key, and the payload gets the `file_url`. Uploads are free and happen before the reserve, so a failed upload spends nothing and is retried once by the kit. A payload naming a link on this computer (`127.0.0.1`, `localhost`) is refused before anything is sent. Files over 90 MB are refused (fal's client switches to a multipart upload there; this runner does not).
- **The fal key** is sent only to `api.fal.ai` (prices), `rest.fal.ai` (storage) and `queue.fal.run` (jobs), never to a signed upload link or a result link.
- **ElevenLabs `/with-timestamps`** answers JSON with the audio as `audio_base64`: the audio becomes the file and the rest is `json`, as the line does.
- **ElevenLabs `/v1/music/detailed`** answers `multipart/mixed`: the `application/json` part becomes `json` verbatim and the `audio/*` part the file. Parts are found by their Content-Type, not their order, and CRLF or LF line ends both parse, and a missing boundary parameter falls back to the body's first line: the reader is a port of the line's (`services/video-line/multipart.ts`, W0-13), so real mode takes exactly the replies production takes. A `+json` part counts as the JSON part; the audio keeps the type it was sent with (`audio/mp4` is saved as `.m4a`). A reply without both parts fails the piece. The call is refused before anything is reserved when the line would refuse it (`songProblem`, the same rules as the stand-in); in particular the path takes **no query**, since the line always asks for the default `mp3_44100_128`.

## Known gaps

- **transcribe-whisper@1.0.1 and the captions layer's own transcription cannot work on the real line today.** They send `speech.m4a` (`audio/mp4`), and both the kit (`HOSTABLE_TYPES`) and the server host only `audio/mpeg` and `audio/wav`. The kit stops with "a audio/mp4 file can't be sent to a provider". try-style shows the same failure, which is correct. The fix belongs in those parts (send mp3 or wav).
- **The music bed stand-in is silence** (the song stand-in is a tone). A style whose only sound is a `/v1/music` bed gets no audible stand-in sound.
- **Stand-ins say nothing about looks.** Faces, voices, product accuracy and taste need a real or staging render.

## Smoke style

`smoke/` holds a style (`try-paid-parts`) that calls every paid part published today (voice, nano-banana, Seedance, H3, sound effects, music), with a plan and a brand:

```bash
GOOSE_KIT_PARTS_DIR=<goose-skills> GOOSE_KIT_STYLES_DIR=scripts/try-style/smoke/styles \
npx tsx scripts/try-style.ts --style try-paid-parts \
  --plan scripts/try-style/smoke/plan.json --brand scripts/try-style/smoke/brand.json --out /tmp/try-smoke
```
