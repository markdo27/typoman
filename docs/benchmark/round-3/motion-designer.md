# TYPOMAN Round 3: Working Motion Designer (end user)

**Lens:** a freelancer shipping YouTube intros, website heroes and Instagram/TikTok stories; Path Control,
Export & Embed and UX weighted most. **Snapshot:** `f25ca23`. Playwright Chromium, desktop 1440×900/1000
with real mouse, keyboard, file chooser and clipboard, plus a 390×844 @2× touch pass. Every export checked
with `ffprobe -count_frames` and frame extraction.

| MC | TQ | PC | CR | EE | UX | PR | EQ | Overall |
|---|---|---|---|---|---|---|---|---|
| 8 | 8 | 8.5 | 8 | 8.5 | 8.5 | 8 | 7.5 (prov.) | **8.0** (mean 8.125) |

Round 2 (this lens): MC 7.5, TQ 7.5, PC 8.5, CR 7.5, EE 8.5, UX 8, PR 7.5, EQ 7.5, overall 8.0 (7.81).

**Verdict.** All seven deliverables shipped through the real UI with exact frame counts and durations.
Round 3 closed almost every Round 2 polish bug and added what a freelancer bills for: templates that take the
headline, track mattes, keyframes on the timeline, real springs, and embeds that scrub on scroll, play on
hover and carry per-page copy. Every embed route is bit-identical to the studio, mattes and transform keys
included. What still stands between this and an AE-grade tool: type on a path at hard corners and mid-morph,
Phrase Morph with long lines, a Gravity look that stacks letters at rest, and embed features the dialog
doesn't offer.

## Round 2 bugs

Fixed: Big Shoulders, Remix replacing drawn paths (plus a Path lock), HTML-tab font note, play-once end
frame, "null" tooltips (58/58 clean), Stack static on one word (and Science Gothic by default), 9:16 path
toolbar, hint/toast collisions. Mostly fixed: phone gaps (transform diamonds not on the phone chart).
Partly fixed: corner/morph collisions (default scene clean; a sharp pen V still splits "FRID  AY" at the
default Corner smoothing 0.5); uploaded font naming (read from the tables, but each file its own family).
Still open: HD tagged BT.601.

## Bugs (most severe first)

1. **HIGH: Path Flow in Fill mode: during a path morph the repeat seam lands mid-frame** and letters
   cross-fade over each other ("NEW D[R]FRIDAY"), in an exported 9:16 story. Persists at Corner smoothing 1.
2. **HIGH: Phrase Morph squeezes phrases wider than the frame into a smear** (e.g. a long `text=` sentence);
   it ignores Wrap: Auto. *Fixed after the round: glyphs draw at the fitted size and one line morphs word
   to word.*
3. **MEDIUM-HIGH: Gravity "Candy drop" overlaps letters at rest** in the wave ground's valleys.
4. **MEDIUM: the default Corner smoothing (0.5) still splits words at a sharp pen corner.**
5. **MEDIUM: the Embed & share dialog offers none of Round 3's embed features** (`text=`, hover, scroll
   scrub, the iframe `progress` API all work, but only in source comments); no font route for iframe and
   web-component embeds of uploaded fonts.
6. **MEDIUM: two styles of one uploaded family become two families** (Bold + Bold Italic; the italic one
   disables the Italic switch).
7. **MEDIUM: heavy exports freeze the studio for 16–29 s at a time,** and Cancel lands after ~20 s.
8. **LOW-MEDIUM: the export estimate cries wolf on light scenes** (1 min 02 s estimated, 15.3 s actual).
9. **LOW-MEDIUM: turning on Animate path leaves path A targeted,** so the next library click silently
   replaces a pen-drawn path (undo recovers it).
10. **LOW: the flash rate reads differently on each surface** (Motion panel 19.5 then 9; dialogs 9.5).
11. **LOW: path key times are fixed equal shares,** and path keys aren't on the timeline.
12. **Small:** BT.601 tags on HD; a Ligatures switch where nothing changes; the `willReadFrequently` warning
    from the flash check; the iframe posts `pause` before `ready`; "↵ to finish" on touch; Lyric Morph with
    a one-word headline stops morphing.

## Scenarios

1. **YouTube intro: PASS.** Hot Chrome look; spring editor `spring(474,8)`; inCubic stagger curve + jitter
   0.35. MP4 AV1 1080p30 120 frames / 4.000 s at 43.3–43.8 dB; WebM VP9 240 frames at 43.6 dB.
2. **Website hero: PASS.** Phrase Morph "MAKE IT MOVE / MAKE IT LAST". Cross-origin: per-page `text=`,
   `scrub="scroll"` (t 0 → 3.915 s), `trigger="hover"` (tap on touch; still under reduced motion), iframe
   `progress` from parent scroll, clean play-once end, hostile `text=` rendered as text. iframe vs engine and
   web component vs iframe: 0 differing pixels.
3. **9:16 story on a pen path with keys: PASS** for the workflow (off-frame pen points, one undo step;
   A → Zigzag → S-curve in Cycle), with the craft flaws in bugs 1 and 4.
4. **Title + subtitle on the timeline: PASS.** Lane drag gave exactly 1.000 s delay, once & hold;
   transform keys added at the playhead; diamond drag 25 % → 40 %; delete and undo.
5. **Brand font, transparent export: PASS.** Caladea Bold at 700 with Features chips; transparent WebM
   `alpha_mode=1`, opaque ink in brand orange; the 399 KB HTML file inlines the font.
6. **Starter template: PASS.** All 8 took "NIGHTSHIFT" as one undo step; Title Window exported at 36.6 dB.
7. **Hand-built track matte: PASS.** Inside, Outside, Undo; bottom layer disabled with an explanation;
   MP4 at 35.4 dB; embeds bit-identical.

Other claims: exact 2.7 s loop at 24 fps (65 frames; seam step 0.147 vs median 0.257); Strobe Cut safe by
default with warnings when fast strobe is allowed; Stack → Science Gothic with a "Keep Anton" toast; true
italic, ligatures, Figures and custom axes all change the render; phone parity for templates, timing and
transform.

## Criteria

- **MC 8 (+0.5):** springs, stagger curve with jitter, retimable transform keys, exact loops. Against: the
  Fill-morph seam ghost, Gravity resting overlaps, equal-share path key times.
- **TQ 8 (+0.5):** italic, ligatures, features, custom axes, preferred fonts, uploaded weights. Against:
  Phrase Morph overflow, word splits at a V, ungrouped upload families.
- **PC 8.5 (=):** pen with off-frame points, 22 shapes, A/B/C keys with eases, Remix keeps the path.
  Below 9: bugs 1 and 4, path keys not on the timeline, the Animate-path trap.
- **CR 8 (+0.5):** 110 looks, 8 art-directed templates, combinable mattes, signature presets.
- **EE 8.5 (=):** exact frame counts, real alpha, 35–43 dB, bit-identical embeds, working new embed
  features, flash warnings, true font notes. Held back by hidden options, no embed font route, BT.601.
- **UX 8.5 (+0.5):** every Round 2 polish bug fixed; clear matte, transform and spring UIs; draft badge.
- **PR 8 (+0.5):** zero console errors; deterministic renders; graceful edge cases. Against: export freezes.
- **EQ 7.5 (prov., =):** five CI jobs and documented contracts; `labs/` still in the repo; Round 3 UI
  checks only look for labels.

## Recommendations (ranked)

1. Make type on paths clean in exported frames: never cross-fade the Fill repeat seam over visible text
   during a morph; auto-raise corner smoothing at sharp pen corners; gate both in CI.
2. Guard every preset against long copy, Phrase Morph first; a fit check for `text=` in the Embed dialog.
3. Put the new embed features in the Embed dialog (hover, scroll scrub with the progress snippet, per-layer
   page text) and give embeds a font route.
4. Fix Gravity's resting overlaps on concave grounds, with a rest-overlap test.
5. Keep the studio responsive during export (yield every frame or a worker; Cancel under a second).
6. Path timing: draggable path-key diamonds with free times; confirm before replacing a custom path.
7. Group uploaded files into one family by their name tables; hide unsupported font controls.
8. Small items: BT.709 tags, one flash figure everywhere, `ready` before `pause`, touch copy, transform
   diamonds on the phone chart, template headlines that adapt to the user's line count.
