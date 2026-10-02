---
name: make-custom-video
slug: make-custom-video
description: Create a complete branded video from a brief and optional reference, with timed script review, ingredient review, controlled generation, clip checks, assembly and final delivery.
owner: team
status: experimental
version: 1
created: 2026-10-02
updated: 2026-10-02
level: orchestrator
category: video
variant-of: null
tags: [video, ads]
---

## How to talk to the customer (applies to every message you send them)

The customer is a marketer or founder, not an engineer. Everything in this skill about tools,
fields, files, polling, models and pipeline steps is for YOU. Never pass it on to them.

- **Say what they get and what they need to decide, never how it's made.**
  Bad: "Checking the media-proxy helpers for voiceover timestamps and lipsync." / "Generated with
  gpt-image-2 at high quality, mouth closed, passes QC."
  Good: "Recording the voices now." / "Here are your two hosts."
- **Never mention** tool, file or field names, ids, JSON, commands, scripts, installed software,
  uploads, model or vendor names, timings in seconds or frames, retries, polling, internal statuses
  or your own quality checks. Fix what you can quietly. If they ask how something works, explain it
  simply.
- **Update them only at milestones they care about**: choices confirmed, script and voices done,
  visuals done, ready to review, finished. One short line each, then stay quiet until the next
  milestone. No update for setup, downloads, uploads or saving.
- **Money is in credits, with a number**: "the full video uses about N credits". Never "the cheap
  pieces" or "the expensive render".
- **Problems:** say what it means for them and what they can do, in one or two sentences. No error
  codes or stack traces. Only raise a problem that changes something for them.
- **Use their words**: script, voice, hook, scene, host, ending, logo, the product shot.
- **No filler**: no "Great question!", "Certainly!", "I hope this helps!", no restating what they
  just said at length.

Example. Instead of a dozen lines about render tools, scripts, uploads and portraits, send:
"Got it: warm tone, home podcast studio, Brielle as the skeptic and Mark as the believer." then
"Script and voices are done (about 34 seconds)." then "Ready for you to review: the script, voices,
both hosts and the ending. You can also review your recipe ingredients in the app: <link>. Say go
here and I'll make the full video (about N credits)."

# Make Custom Video

Create a branded video from a brief, with an optional reference for creative direction. Review the timed script first, then the actual storyboard, character, location and voice previews. Generate only approved work, inspect every clip, assemble and watch the final cut before delivery.

## Purpose

Use this when a video needs an original creative plan rather than a fixed template. The production host supplies saved project state, brand materials, authenticated human approvals, provider access, a budget and an output destination. A reference is inspiration, never the finished deliverable.

## Inputs

- Brand facts, audience, product materials, offer and CTA. Use supplied evidence; do not invent claims.
- A creative brief and optional accessible reference video.
- Target duration, aspect ratio and delivery requirements; choose sensible defaults from the brief.
- Saved script, scenes, ingredients, generation jobs, feedback, approved revision and remaining budget when resuming.
- A shell with Python, FFmpeg and FFprobe. Browser compositions additionally require an installed browser renderer; check before choosing that approach.

## Workflow

1. **Read and resume.** Load saved state before doing work. Identify the current approval and unaddressed feedback. Reuse valid uploaded assets and completed provider jobs. A restart is not permission to repeat paid work. Check the toolchain and available provider capabilities before promising an approach.
2. **Study the brand and reference.** Watch accessible reference frames and listen/transcribe its audio. Record its hook, scene order, pacing, visual treatment, voice, captions, music and CTA. Keep those creative mechanisms; replace all names, products and claims with the current brand's evidence. If the reference is inaccessible, disclose that and continue from the brief only when the customer wants that route.
3. **Plan an original concept.** Pick one coherent idea with a strong opening and one message. Match visuals to the spoken line at the same timestamp. Plan character and location continuity, logo/end card, audio and captions. Split the video into stable scene IDs with numeric start/end seconds, shot direction and exact spoken/on-screen copy. Show a readable concept and timed script. Estimate preview operations separately from final clips and assembly.
4. **Script gate.** Save the exact script and preview estimate to the host. Stop for a real human approval of that revision and budget. A generated quote, agent message, local file or inferred enthusiasm is not approval. Script edits invalidate this approval and all dependent ingredient approvals.
5. **Prepare reviewable ingredients.** Within the approved preview budget, make storyboard frames, character/location anchors and voice auditions. Use approved catalog voices; keep separate character and environment references. Show actual images/audio, with labels and provenance. Never substitute descriptions for a promised preview. Use real product and logo assets instead of generating approximations. Save every successful asset immediately, along with its provider job and input fingerprint.
6. **Ingredient gate.** Save the complete review set and final-generation estimate. The customer can replace/regenerate specific ingredients or leave feedback. Replacement invalidates ingredient approval, while unchanged copy can retain script approval. Stop until the host records approval of the current ingredients and total budget. Native generated speech cannot be auditioned separately: explain that before approval, provide an approved separate voice route when required, and review the actual voice with its clip.
7. **Generate clips.** Recheck approval and budget before every paid operation. Use a stable fingerprint for retries and retrieve existing jobs instead of resubmitting. Apply locked character/location references and exact approved dialogue. Keep clip duration and scene purpose explicit. Inspect motion, identity/product fidelity, continuity, voice/script agreement, crop and duration immediately. Save a named pass/fail result for each check. Do not assemble a failed clip. Repair at most twice within the approved budget; otherwise save the issue and ask for a focused decision.
8. **Assemble and caption.** Normalize clips to one frame rate, resolution and audio format. Join them in approved scene order. Align VO to the scene timeline; duck music beneath speech and avoid doubling generated speech with a second voice track. Composite real logos/type. Add captions as the final visual post-production step, using a supported caption provider or local ASS when the provider cannot faithfully spell the brand. Keep text readable inside safe areas. Export H.264/AAC MP4 with fast-start metadata. Use the included assembly helper for a conventional clip sequence; browser-only layouts require a verified browser renderer.
9. **Final review and bounded polish.** Probe the actual export, sample transition and text frames, watch the full cut and listen/transcribe it. Check source adaptation, brand, product, hook/scene order, voice/script, captions, end card/CTA, duration/ratio and visual artifacts. Record unresolved issues. A status of passed cannot accompany failed checks. Make targeted fixes while preserving approved unaffected assets; stop for new approval if scope, ingredients or budget changes.
10. **Deliver and preserve.** Upload the real final video, saved production manifest and clip/final quality evidence. Pin a final version only after all gates pass. Keep previous versions and timestamped feedback. State actual media spend, any unresolved issue and the review/delivery location. Never call a placeholder, provider preview or reference copy the completed creative.

## Output

A playable final video, a readable timed script, actual reviewed ingredients, version history, a production manifest with model/settings/asset provenance, clip and final quality reports, and actual spend. The host retains all state required to resume.

## Quality Checks

- Brand claims and product identity come from evidence.
- Script and ingredient approvals belong to the exact current revisions.
- Every paid operation is attributed, deduplicated and within its approved budget.
- Every scene has passing visual, brand, product, voice/script and duration/ratio checks.
- The actual assembled video has been watched and probed, including captions and transitions.
- Interrupted runs retrieve existing jobs/assets; failed work stays visible and recoverable.

## Failure Modes

| Symptom | Recovery |
| --- | --- |
| Reference is private, expired or unsupported | Save the failure; accept a public file or a brief-only plan. |
| Provider submission times out | Keep its outstanding budget; retrieve the known job before retrying. |
| Toolchain lacks a browser renderer | Choose an approved FFmpeg composition before spending, or name the missing capability. |
| Ingredient or script changes after approval | Save the edit, invalidate the affected gate and obtain current approval. |
| Budget cannot cover a repair | Save the issue and revised estimate; do not silently exceed consent. |
| Clip/final QC fails twice | Preserve the candidate and ask for one focused change. Do not pin it as successful. |

## Related

- [[derived-from::video-orchestrator-with-control-plane]]
- [[references::lock-script]]
- [[references::create-storyboard]]
- [[references::create-clips]]
- [[references::review-video]]
- [[references::polish]]

---

# Human version

This adapter connects the production playbook to GooseWorks. Customers review their script, actual ingredients and budget in Studio. The agent continues in the same conversation and saves the checked final video to the project.

---

# Agent version

## GooseWorks custom-video adapter

The generic production phases run in the Growth sandbox or a connected agent with a shell. GooseWorks owns the project, approvals, budget, uploads and final selection. This adapter replaces Studio desktop files and Tauri approval events with the product contract below.

## Start and resume

Fetch the current schemas with catalog_fetch before using a tool. For a new brief, call video_project_upsert with brand_id, name, format:"custom", custom_mode:"generate", brief:{prompt, audience, objective, product_name, cta, ratio, duration_seconds}, optional reference_url and a stable idempotency_key. Use only brief fields present in the schema. Instagram references have a metered public-data lookup; direct files are downloaded, probed and stored. generated_video_url and media_id mean finished-file imports, never references. Do not use import mode to bypass a generation project's review gates.

Read video_project_read on every resume. Its project and custom_review are authoritative. Growth creates and retains origin_session_id from trusted chat context. The Studio creative page is the human review surface. Continue in Growth resumes that conversation. A connected agent can present the same app_url and poll for approvals; it cannot fabricate them using patch.approve/user_quote.

If reference preparation failed, explain custom_review.reference.error. Continue from the brief if requested, or retry with patch:{retry_reference:true}. A live preparation claim is protected for twenty minutes; after interruption an explicit retry reuses a saved resolved URL when possible. Never invent a reference analysis when no reference was viewed.

## Saved review schema

Save through video_project_upsert {brand_id,project_id,patch:{script:{script_drafts,script,expected_plan_revision}}}. script_drafts contains format:"custom", title, duration_target_sec (<=180), aspect_ratio, scenes:[{scene:1,time:"0–5s",text,caption,direction}], preview_estimate:{total_credits,basis,operations:[...]}, optional render_estimate in the same shape, voices and ingredients:[{container,label,subtitle,url,text,note,pending}]. Use numeric scene IDs consistently. The plain script is joined spoken copy. Read project.plan_revision and pass it as expected_plan_revision on every existing-draft save; a stale write is refused. Store concept, reference_analysis, continuity, planned operations and job/asset provenance as extra draft fields; keep the review set under 256 KB.

Before script approval, only plan/save free text. preview_estimate quotes future storyboard images and voice auditions. custom_review.script_approved permits priced image previews on supported fal image endpoints and ElevenLabs text-to-speech auditions. Unknown endpoints require ingredient approval. Use catalog voice previews when possible; do not silently select a paid model outside the preview allowlist.

Upload actual previews with media_upload/media_confirm. Put public/durable URLs on image/avatar/background/endcard/voice/audio/video ingredients. Text containers can carry inline text; a voice or image description cannot replace its preview. Save a render_estimate for remaining clips/assembly and show the complete ingredients. Stop until custom_review.ingredients_approved. Script and ingredient tokens are independent; do not infer approval from project.status.

## Paid execution and resume

Every managed media call carries project_id (GW_PROJECT_ID in scripts) and a stable input fingerprint. Use the managed fal/ElevenLabs endpoints and credentials supplied by Growth; never request customer provider keys. Do not expose those credentials in logs. Recheck custom_review before dispatch. The backend reserves estimated outstanding costs atomically, enforces the approved total (maximum3,000 credits) and prevents duplicate submissions. At most a20% overrun can be newly approved; this is not automatic permission to spend above the customer's selected limit.

The supported preview fal endpoints include gpt-image-1/1.5/2, nano-banana/2/pro and their edit variants, flux/dev, flux/schnell, flux-2 and flux-2/edit, birefnet and esrgan. Use the exact current provider paths from the media tool catalog. A400 model/path failure costs no authorized job; unknown pricing/model support must be resolved before spending. Final clip models require ingredient approval. Existing-job polls remain permitted after edits; retrieval does not authorize new media.

Save provider request IDs and actual uploaded URLs promptly. Custom operations with known rejection can retry safely; ambiguous timeouts keep their authorization until reconciled. Media spend is metered through the shared gateway. Custom videos have no extra template base render fee. Imported finished files still file for zero credits.

## Clips, assembly and quality

Fetch the supported model/provider skill when needed. Keep anchors and exact lines fixed. Use the included Python assembly helper for actual existing clips. It needs only Python, FFmpeg and FFprobe; it does not call a provider or require Chromium. Inspect generated clips before assembly, and watch the final export after assembly/captions.

Open a render with video_render_run {brand_id,project_id,kind:"full"}; executor:"cloud_agent" for Growth when exposed by the current schema. Report live workflow_stage/progress_note/progress_percent while producing it. Upload the final file to scope:"video_project", scope_id:project_id. The tool opens/reports a client-executed render; fixed server orders remain paused.

Save patch.production with version:1, pipeline:[{step,model,settings}], style, characters, scenes:[{id,line,still_prompt,motion_prompt,duration_s}], voice/music/assembly, fixes and clips:[{scene,url,checks:[{check,status,note}]}]. Each clip must include exactly these five named checks: visual_artifacts, brand, product, voice_and_script, duration_and_ratio. All must pass. Reuse the same numeric scene as script_drafts.scenes.

Complete with video_render_run {brand_id,project_id,render:{render_id,status:"complete",output_url,quality_status:"passed",quality_report:{version:1,summary,checks:{source,brand,product,hook_and_scene_order,voice_and_script,captions,endcard_and_cta,duration_and_ratio,visual_artifacts},detected_issues:[],repair_actions:[],checked_at}}}. Each final check is {status:"pass"|"fail"|"not_applicable",note}; brand/product/scene order/duration/visual artifacts must pass. Save a failed candidate as blocked/failed with its issue, not complete. Final completion binds approval revisions, output and quality evidence to the render; pin with patch.final_render_id only after passing.

## Feedback and delivery

Studio saves script/ingredient/video feedback before continuation and invalidates the affected approvals. Read custom_review.feedback on every turn. Replace only the affected assets; save revised estimates and stop for renewed approval. Deliver the playable current_render_url with render_artifact kind:"video" in Growth, show the Studio app_url and actual project spend. Keep final history; never create another project just because an agent restarted.

## Reviewed snapshot, voices and supported pricing

custom_review returns script_drafts and plan_revision from the same saved snapshot as its tokens. Studio renders that snapshot and uses the revision for edits. Spoken copy (text) and on-screen copy (caption) are separate fields. Voice audition ingredients carry role and voice_id; script_drafts.voices maps each role to its selected voice_id/name. Every selected role needs an actual matching playable preview before approval.

A pending/processing/failed reference blocks script approval. The human can explicitly choose Continue from brief without reference in Studio; this saves skipped and fences the older worker. Do not silently replace a requested reference with brief-only production.

Custom provider submits require a conservative request-price bound, including quantity and supported dimensions/audio. Unknown/token/GPU pricing and unsupported parameter combinations are refused before dispatch; choose a supported fixed per-image/megapixel or fixed per-second text/image-to-video model and update the quote. Motion-control and source-duration video routes are refused until the source duration can be bounded reliably. A conservative reservation is released to actual charged spend when the provider result settles. Final output must be a confirmed, stored video_asset in this exact organization/project, and completion binds its media_id to the render. External hotlinks cannot be pinned as generated custom finals. The portable helper checks FFmpeg's libass capability before local captions, rejects clips shorter than their timeline and validates video-stream duration.


## Portable assembly helper

Save the following as assemble.py in your temporary production directory. Run it with Python, a saved JSON plan and an output MP4 path. It makes no provider calls and does not mark the result visually approved.

```python
#!/usr/bin/env python3
"""Assemble reviewed local clips. No provider calls or automatic quality verdict."""
import argparse
import json
import subprocess
import tempfile
from pathlib import Path


def run(args):
    subprocess.run(args, check=True, capture_output=True, text=True, timeout=600)


def probe(file):
    return json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(file)], text=True, timeout=60))


def assemble(plan, output):
    sizes = {'9:16': (1080, 1920), '16:9': (1920, 1080), '1:1': (1080, 1080), '4:5': (1080, 1350)}
    width, height = sizes[plan.get('aspect_ratio', '9:16')]
    width, height = plan.get('width', width), plan.get('height', height)
    fps = plan.get('fps', 30)
    if not isinstance(fps, int) or not 1 <= fps <= 60 or any(not isinstance(v, int) or v <= 0 or v % 2 for v in (width, height)):
        raise ValueError('Use an integer fps between1 and60 and positive even pixel dimensions')
    expected_ratio = sizes[plan.get('aspect_ratio', '9:16')][0] / sizes[plan.get('aspect_ratio', '9:16')][1]
    if abs(width / height - expected_ratio) > 0.01:
        raise ValueError('Output dimensions must match the reviewed aspect ratio')
    if plan.get('captions_ass') and ' ass ' not in subprocess.check_output(['ffmpeg', '-hide_banner', '-filters'], text=True, stderr=subprocess.DEVNULL):
        raise ValueError('Captions need an FFmpeg build with libass; install/use that supported build before assembly')
    clips = plan['clips']
    if not clips or len(clips) > 60:
        raise ValueError('Supply one to sixty reviewed clips')
    duration = sum(float(clip['duration_s']) for clip in clips)
    if not 0 < duration <= 180 or any(float(clip['duration_s']) <= 0 for clip in clips):
        raise ValueError('Clip durations must be positive, totaling at most180 seconds')
    output = Path(output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='video-assembly-') as folder:
        root = Path(folder)
        normalized = []
        for index, clip in enumerate(clips):
            source = Path(clip['path']).resolve()
            info = probe(source)
            if not any(stream['codec_type'] == 'video' for stream in info['streams']):
                raise ValueError(f'Clip {index + 1} has no video')
            video_stream = next(stream for stream in info['streams'] if stream['codec_type'] == 'video')
            visual_duration = float(video_stream.get('duration', 0))
            if visual_duration + 0.05 < float(clip['duration_s']):
                raise ValueError(f'Clip {index + 1} is shorter than its reviewed timeline; generate or explicitly revise it first')
            target = root / f'{index:03d}.mp4'
            command = ['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', str(source)]
            has_audio = any(stream['codec_type'] == 'audio' for stream in info['streams'])
            if not has_audio:
                command += ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo']
            command += ['-map', '0:v:0', '-map', '0:a:0' if has_audio else '1:a:0', '-t', str(clip['duration_s']), '-vf', f'scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},setsar=1,fps={fps}', '-af', 'aresample=48000', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ac', '2', '-ar', '48000', str(target)]
            run(command)
            normalized.append(target)
        listing = root / 'clips.txt'
        listing.write_text(''.join(f"file '{file.as_posix()}'\n" for file in normalized))
        joined = root / 'joined.mp4'
        run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', str(listing), '-c', 'copy', str(joined)])
        command = ['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', str(joined)]
        voice = plan.get('voice_path')
        music = plan.get('music_path')
        if voice:
            command += ['-i', str(Path(voice).resolve())]
        if music:
            command += ['-stream_loop', '-1', '-i', str(Path(music).resolve())]
        audio_source = '1:a' if voice else '0:a'
        if music:
            music_source = '2:a' if voice else '1:a'
            # Duck the quiet bed under the selected speech; preserve native clip audio otherwise.
            command += ['-filter_complex', f'[{audio_source}]apad,asplit=2[main][side];[{music_source}]volume=0.12[bed];[bed][side]sidechaincompress=threshold=0.04:ratio=6[ducked];[main][ducked]amix=inputs=2:duration=first:normalize=0[mix]', '-map', '0:v:0', '-map', '[mix]']
        else:
            command += ['-map', '0:v:0', '-map', audio_source]
        captions = plan.get('captions_ass')
        if captions:
            path = Path(captions).resolve().as_posix().replace('\\', '\\\\').replace(':', '\\:').replace("'", "\\'")
            command += ['-vf', f"ass=filename='{path}'"]
        command += ['-t', str(duration), '-c:v', 'libx264' if captions else 'copy', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', str(output)]
        run(command)
    info = probe(output)
    actual = float(info['format']['duration'])
    visual = next(stream for stream in info['streams'] if stream['codec_type'] == 'video')
    visual_actual = float(visual.get('duration', 0))
    if abs(visual_actual - duration) > max(0.15, 2 / fps):
        raise ValueError(f'Visual duration {visual_actual} differs from reviewed timeline {duration}')
    if abs(actual - duration) > max(0.15, 2 / fps):
        raise ValueError(f'Export duration {actual} differs from reviewed timeline {duration}')
    return {'output': str(output), 'duration_s': actual, 'width': width, 'height': height, 'technical_probe': info, 'quality_status': 'requires_visual_and_audio_review'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('plan', help='JSON: aspect_ratio, clips:[{path,duration_s}], optional voice_path/music_path/captions_ass')
    parser.add_argument('output')
    args = parser.parse_args()
    print(json.dumps(assemble(json.loads(Path(args.plan).read_text()), args.output)))


if __name__ == '__main__':
    main()

```
