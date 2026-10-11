# try-style: make a video from a style file on this computer

**What it is.** A script that makes one whole video from a `style.json`, a `plan.json` and a `brand.json`, with no server. It runs the real kit (`makeVideo`: bindings, parts, layers, the check and the upload) against a private line that lives inside the script.

**Why.** Before this, a style could only be run after the server had approved a video for it, and only in the exact version the server pinned. Now any style folder and any goose-skills checkout can be tried, including unpublished parts.

**Key points**
- **Free by default.** Paid calls get labelled stand-ins of the right size, length and timing. Nothing leaves the computer.
- **Real calls only on request**, with `--providers real`, a per-run cap and a night cap. Every real call is priced first and written to a spend ledger.
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
| `--cap-usd <n>` | Real mode: the most this run may spend (required) |
| `--spend-ledger <file>` | Real mode: the ledger (required; also `GOOSE_TRY_SPEND_LEDGER`) |
| `--night-cap-usd <n>` | Real mode: the most the whole ledger may reach. Default 200 (also `GOOSE_TRY_NIGHT_CAP_USD`) |
| `--tools-home <dir>` | Where the kit's pinned ffmpeg and headless browser are set up once. Default `~/.gooseworks-try-style` |

**Outputs in `--out`**

| File | What it is |
|---|---|
| `final/final.mp4` | The finished video (the exact bytes the check passed and the line received) |
| `final/checked-cut.mp4` | Only when the check failed: the cut the check judged |
| `verdict.json` | The check layer's verdict (`pass`, `checks[]`), plus `run` (status, message, seconds, spend) |
| `contact.png` | One frame per second, six across |
| `pieces.jsonl` | One line per paid piece: key, provider, model, mode, status, and the estimate in real mode |
| `home/videos/<id>/` | The kit's own run folder: `log.ndjson`, each step's `record.json` and outputs |

The exit code is 0 only when the video was made and no check failed.

## How it works

- **The line** (`line.ts`) answers the kit on `http://127.0.0.1:47999`, an address nothing listens on. It answers the hand-over, pieces, hosted files, progress and upload. Every other address is refused.
- **The hand-over** carries the plan, the brand, `styleHash(style.json)`, `parts_lock: null` and the layer set from the parts folder's `layers.json`. With no lock, the kit loads parts from `GOOSE_KIT_PARTS_DIR` and takes models from each part's manifest.
- **Tools.** The script sets up the kit's own pinned ffmpeg (only from its GitHub release) and headless browser in `--tools-home`, then passes them to the kit. Secret-looking environment variables are never passed to the kit.

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

| Call | Who calls it (part@version) | Answer `json` | `file_url` | Pointer the part reads | Stand-in |
|---|---|---|---|---|---|
| ElevenLabs `POST /v1/text-to-speech/<voice>/with-timestamps` | voice-elevenlabs@1.0.1 | `{alignment, normalized_alignment}`, each `{characters[], character_start_times_seconds[], character_end_times_seconds[]}` | mp3 | `/file_url`; alignment from `json` | 220 Hz tone, 0.065 s per character, characters timed evenly |
| ElevenLabs `POST /v1/text-to-speech/<voice>` | none today | none | mp3 | `/file_url` | same tone |
| ElevenLabs `POST /v1/music` | music-elevenlabs@1.0.2 | none | mp3 | `/file_url` | silence of `music_length_ms` |
| ElevenLabs `POST /v1/music/detailed` | song-elevenlabs@1.0.0 (planned, W0-27) | `{composition_plan, song_metadata, words_timestamps: [{word, start_ms, end_ms}]}` | mp3 | `/file_url`; words from `json` | silence of the summed `sections[].duration_ms`; each section's `lines` words spread over its middle 80%. Refuses `music_length_ms` together with a plan. **The JSON shape is assumed until W0-13 parses the real multipart reply; W0-13 and W0-27 must agree with this row** |
| ElevenLabs `POST /v1/sound-generation` | sfx-elevenlabs@1.0.1 | none | mp3 | `/file_url` | a 20 ms click, padded to `duration_seconds` |
| fal `fal-ai/whisper` | transcribe-whisper@1.0.1, captions-layer@1.1.0 | `{text, chunks: [{text, timestamp: [start, end]}], inferred_languages, diarization_segments}` | none | `results: []`; words from `json.chunks` | the plan's spoken lines, word by word, spread over the audio's length |
| fal `fal-ai/nano-banana`, `fal-ai/nano-banana/edit`, `openai/gpt-image-2(/edit)` and other image models | image-nano-banana@1.0.1; image-gpt-image-2, cast-plate (planned) | `{images: [{url, width, height, content_type, file_name}], description, seed}` | none | `/json/images/0/url` | a bright, noisy, gridded picture with the prompt's first 60 characters, at `size` (`WxH`), `image_size`, or `aspect_ratio` (long side 1344), else 1024x1024. Bright on purpose: dark stand-ins trip the check's black-frame test |
| fal `bytedance/seedance-2.0/*`, `fal-ai/kling-video/*`, Veo, `minimax/h3-max/*` | video-seedance-2@1.0.1, creator-h3@1.0.2; video-kling, video-veo-3 (planned) | `{video: {url, content_type, file_name, width, height}, seed}` | none | `/json/video/url` | ffmpeg `testsrc2` labelled with the model and piece, `duration` seconds (default 5, Veo 8), size from `resolution` + `aspect_ratio` (else the first image's shape), a 330 Hz tone when `generate_audio` is true or the model speaks by default (H3, Veo, Seedance) |
| fal `veed/fabric-1.0` | lipsync-veed (planned, W0-28) | same as video | none | `/json/video/url` | `testsrc2` as long as the `audio_url` audio, with that audio as its track |
| fal `fal-ai/birefnet(/v2)` | product-cutout (planned, W0-30) | `{image: {url, width, height, content_type, file_name}}` | none | `/json/image/url` | the input with an alpha channel (an ellipse) |
| anything else | | | | | **refused**: add a stand-in here and a row to this table |

Files a part sends (`gooseworks-file:<id>` in a payload) are hosted by the line exactly as the kit expects. Stand-ins read them from disk; real mode sends them to fal as data URIs.

## Real mode

```bash
FAL_KEY=... ELEVENLABS_API_KEY=... npx tsx scripts/try-style.ts ... \
  --providers real --cap-usd 1 --spend-ledger <file>
```

- **Keys come from the environment only.** They are never printed, logged or written, and never passed to the kit or its parts.
- **Each call is priced before it is sent**, at a deliberately high list price (`usdEstimate` in `providers.ts`). A call with no known price is refused.
- **Caps.** A call is refused when it would take this run past `--cap-usd`, or the ledger's total past `--night-cap-usd`. A refusal stops the video, as an over-quote stop would.
- **The ledger** gets one JSON line per call, written when the call ends: `{time, piece, model, usd_estimate, status, provider, run}`. `status` is `done`, `failed`, `unknown` or `refused` (refused lines count $0). A call the provider refused at submit counts $0. The night total is the sum of `usd_estimate` over every line.
- **fal** is called through its queue API (`queue.fal.run`), polled every 3 s for up to 20 minutes. Result links in fal's answer are served to the kit through the local line.
- **Not forwarded:** `/v1/music/detailed` (the line does not carry it yet, and its multipart reply is not parsed here).

## Known gaps

- **transcribe-whisper@1.0.1 and the captions layer's own transcription cannot work on the real line today.** They send `speech.m4a` (`audio/mp4`), and both the kit (`HOSTABLE_TYPES`) and the server host only `audio/mpeg` and `audio/wav`. The kit stops with "a audio/mp4 file can't be sent to a provider". try-style shows the same failure, which is correct. The fix belongs in those parts (send mp3 or wav).
- **Music stand-ins are silence**, so the check's `sound` line is `not_applicable` on styles whose only sound is music.
- **Stand-ins say nothing about looks.** Faces, voices, product accuracy and taste need a real or staging render.

## Smoke style

`smoke/` holds a style (`try-paid-parts`) that calls every paid part published today (voice, nano-banana, Seedance, H3, sound effects, music), with a plan and a brand:

```bash
GOOSE_KIT_PARTS_DIR=<goose-skills> GOOSE_KIT_STYLES_DIR=scripts/try-style/smoke/styles \
npx tsx scripts/try-style.ts --style try-paid-parts \
  --plan scripts/try-style/smoke/plan.json --brand scripts/try-style/smoke/brand.json --out /tmp/try-smoke
```
