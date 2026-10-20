# TYPOMAN Round 3: Art Director

**Snapshot:** commit `f25ca23`, headless Chromium via Playwright (software raster), real Google Fonts.
**Overall band 8.0** (mean 7.81), up from 7.5 in Round 2.

| MC | TQ | PC | CR | EE | UX | PR | EQ | Overall |
|---|---|---|---|---|---|---|---|---|
| 7.5 | 7.5 | 8 (prov.) | 8 | 8.5 | 8 (prov.) | 7.5 | 7.5 | **8.0** |

Round 2 (this lens): MC 7, TQ 6.5, PC 8 (prov.), CR 7, EE 8, UX 7.5 (prov.), PR 7, EQ 7.5, overall 7.5.
PC is provisional because path typography was measured on all 22 shapes, not tested in the editor by
hand; UX because there was no keyboard/accessibility audit.

**Evidence collected:** contact sheets of 33 presets × defaults and looks (143 configurations) at 7
phases; seams, exact loops, determinism and flash counts for all 143; per-glyph motion residual and
overlap; five path presets on all 22 shapes; all 8 templates with stock and user text; RTL in every
preset; kerning and ligature overlays; 1,056 edge-case renders; UI exports checked with ffprobe and PSNR.

## Round 3 claims, verified

| Claim | Verdict |
|---|---|
| Phrase Morph | Works, with a severe bug: a phrase wider than 90 % of the frame collapses (bug 1) |
| Particles | Works; exact loops. Emoji become grey squares |
| Gravity | Works: deterministic rigid-body bounce, tilt and settle onto the drawn path, open or closed |
| Axis Wave | Works across XROT, YEAR, MORF, SOFT, BNCE, CASL, wdth; RTL lines off-centre (bug 4) |
| 8 templates | All present; Lyric Morph breaks with user text, Title Window's matte keeps "CINEMA" |
| Track mattes | Works (inside and outside) |
| Transform keys | Works; no value graph |
| Stagger curve + jitter | Works; the "Starts" strip shows the distribution |
| Custom springs | Works, but over-normalised (bug 13) |
| Ligatures | Fixed: Playfair "office fluffy staff" matches a native run at 0.00 % (8.1 % with ligatures off) |
| Italics and slnt | Works: real italics; Roboto Flex slant 10 → slnt −10; Recursive cursive forms at 15° |
| Figure features | Work but thin: tnum 412 → 529 px; only tnum, pnum, lnum on catalogue fonts |
| Uploaded fonts | Works: real names and weights, variable axes, GSUB features; Axis Wave animates an upload |
| Collision-free Path Flow | Mostly: 0 % overlap on 14 of 18 non-self-crossing shapes; Star illegible (bug 2) |
| RTL across presets | 31 of 33 correct; Axis Wave off-centre |
| Flash safety | All 143 shipped configurations ≤ 3/s; studio and export warn. Other presets exceed 3/s at short loops (bug 9) |
| Embeds | Per-page text, hover trigger and scroll scrub verified |
| Exact loops at any fps | 3.3 s loop: 79 frames at 24 fps, 83 at 25 fps, 36.7–39.9 dB |

## Bugs (most severe first)

1. **HIGH: Phrase Morph draws at full size after fitting a smaller layout.** `phrase-morph.js:56`
   shrinks the size for the widest phrase, but `drawGlyph` (`:76`, `:99`, `:121`) never passes `size`.
   Repro: type "SUMMER SALE" → Templates → Lyric Morph: "SUMMERSALE" is crushed. A single phrase
   never morphs.
2. **HIGH (for that shape): Path Flow on the Star path is an illegible pile** (100 % of frames overlap).
3. **MEDIUM-HIGH: Draw On collides at corners and cusps** (Bounce 65 %, Zigzag 60 %, Heart 63 %, Star
   65 % of frames); on Frame the text runs off the top.
4. **MEDIUM: Axis Wave centres RTL lines wrongly** (Hebrew ink centre x = 681, Arabic 711 vs 480 at
   960 px). `axis-wave.js:133` adds a logical-order kern when measuring that the RTL branch doesn't draw.
5. **MEDIUM: Stack lowercase descenders collide** ("jumpy" into "quay", which clips at the bottom).
6. **MEDIUM: Phrase Morph letters overlap mid-transition** in 8–12 % of frames.
7. **MEDIUM: Templates don't adapt to user text** (Title Window's matte keeps "CINEMA"; Kinetic Poster
   with long words goes flat).
8. **LOW-MEDIUM: Wave's default amplitude makes three-line text touch.**
9. **LOW-MEDIUM: Only Strobe Cut and Glitch have a hard flash guard.** At a 1 s loop: Path Flow and
   Kaleido 10/s, Cylinder and Fly In 9/s, Split Flap 5/s; at max speed Path Flow 16/s, Stack 12/s,
   Scramble 11.5/s. The studio warns, but the export isn't stopped.
10. **LOW-MEDIUM: Kinetic Grid still breaks words across rows** ("MOT / ION").
11. **LOW: Particles turns emoji and flags into grey squares.**
12. **LOW: Picking the Spring tab commits `spring(180,12)` at once**, and Esc doesn't revert it.
13. **LOW: Springs are over-normalised;** stiffness barely changes the feel, and out-of-range specs
    silently fall back.
14. **LOW: A track matte with no overlap leaves the stage blank** with no hint.
15. **LOW (engineering):** `SEPARATORS` copied in 6 presets; `stack.js:211` sets the private `f._font`;
    `labs/` still ships.

## Round 2 issues re-checked

**Fixed:** kerning (0.00 %), gradient fill erasing decoration, Big Shoulders, Path Flow lanes crossing,
Magnet jitter (8 → 0.57 px), Fly In flips and knots, RTL in Typewriter and Split Flap, reproducible
looks, Kinetic Grid cut-outs, a photosensitivity guard, Sequence's counter dive, Outline Draw pops, gaps
inside words at bends, balanced auto-wrap.
**Partly fixed:** Wave line collisions, Stack descenders (caps only), Spotlight's dwell.
**Not fixed:** Kinetic Grid word breaks.

## Evidence by criterion

- **MC 7.5 (+0.5).** All 143 configurations loop bit-exactly; every Round 2 motion artefact is gone;
  stagger curve, jitter, springs and transform keys arrived; Gravity has real secondary motion. Against:
  Phrase Morph overlaps, Draw On corners, over-normalised springs, no graph editor.
- **TQ 7.5 (+1).** Kerning, ligatures, true italics and slnt, figure features, real names and axes for
  uploads, auto-wrap, RTL in 31 of 33. Against: bugs 1–5; only three OpenType features in the catalogue.
- **PC 8 (prov.).** Path Flow clean on most shapes; Gravity a strong new path consumer. Against: Star;
  Draw On and Ribbon don't use the collision-free spacing.
- **CR 8 (+1).** 33 presets, 110 looks, 8 templates, mattes and transform keys; Title Window is the
  strongest frame in the app. Against: templates fragile with user text.
- **EE 8.5 (+0.5).** Exact loops at any fps, 36.7–39.9 dB, flash note in export, live-embed features.
- **UX 8 (prov.).** Templates tab with live user-text previews and undo; "Show me" flash warning;
  Spring mode; stagger "Starts" strip; phone parity. Against: bugs 12 and 14.
- **PR 7.5.** 1,056 edge-case renders, 0 errors; ≤ 9.6 ms mean per 1080p frame. Against: bugs 1, 2, 4, 5.
- **EQ 7.5 (flat).** Documented APIs, `TM.sfnt`, ~2,700 new test lines. Against: the motion test covers
  only path presets (so bugs 1 and 6 slipped through); bug 15.

## To reach the next band (ranked)

1. Fix Phrase Morph's size, split single phrases into words, and make templates adapt to user text.
2. Apply the collision-free carrier and spacing to Draw On, Ribbon and Fly In; fix Star.
3. Extend overlap and motion CI to every preset (long text, RTL, lowercase, all 22 shapes).
4. Fix layout faults: Axis Wave RTL, descender-aware Stack rows, Wave amplitude vs leading, Kinetic
   Grid rows by word.
5. Raise the timing ceiling: a value-graph editor, springs whose stiffness reads as frequency, Phrase
   Morph arrivals that wait for their slot.
6. Real OpenType on catalogue fonts; colour sampling in Particles.
7. An export confirmation above 3 flashes/s, and guards on the fast presets.
8. Engineering hygiene (bug 15).
