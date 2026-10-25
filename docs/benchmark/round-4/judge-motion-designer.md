# TYPOMAN Round 4: Working Motion Designer (end user)

**Lens:** a freelancer shipping a YouTube intro, a website hero, and a 9:16
Instagram/TikTok story; Path Control, Export & Embed and UX weighted most.
**Snapshot:** the current working tree (uncommitted Round 4 work on top of
`9c89f08`): 41 registered presets (43 files in `js/presets/`, the other two
being helpers), 16 templates, and renderer/path changes in `js/engine/`.
Round 3 (this lens) was MC 8, TQ 8, PC 8.5, CR 8, EE 8.5, UX 8.5, PR 8,
EQ 7.5, overall 8.0.

| MC | TQ | PC | CR | EE | UX | PR | EQ | Mean |
|---|---|---|---|---|---|---|---|---|
| 8.0 | 8.0 | 8.5 | 8.5 | 8.5 | 8.5 | 8.0 | 8.0 | **8.25** |

This is one judge's mean (8.25), not the round's median band. It is **not
9/10**: the three deliverables below all ship, but the gaps in §"Top 3 gaps
blocking 9/10" are still open, and none of them is a Round 4 cosmetic issue.

## Environment limit — read this first

Google Fonts do not load in this sandbox: the smoke run reports
**0/60 catalogue fonts** and the browser log is `ERR_TUNNEL_CONNECTION_FAILED`
for every font request. My own Playwright check of the studio showed the same
four tunnel failures and nothing else. Font-dependent evidence therefore ran
on fallback fonts. **This is a sandbox network limit, not a product bug, and
it is not scored against the product.** It does limit what I could verify:
true italics, variable-axis motion (notably Axis Drift's weight breathing),
width-axis changes, and exact typeface appearance all need a real-font run.
The smoke suite's font-driven failures (italic/slnt instances, width axis,
87 console errors that are all tunnel failures) are attributed to this limit.
The one non-font smoke failure — old template `glitch-drop` flashing at
3.5/s — is discussed under PR; it touches no Round 4 code and, per the
round brief, the baseline smoke failures are identical on clean HEAD, so I
do not attribute it to Round 4 work.

## The three deliverables, actually tried

I built each template in the browser with user text `NIGHTSHIFT` and
checked the resulting scene (not just the template description):

| Deliverable | Template | Result |
|---|---|---|
| YouTube intro | `youtube-intro`, 16:9, 6 s, 3 layers | Headline layer takes `NIGHTSHIFT`; `EP. 01` and `WATCH NOW` stay as fixed, once-only furniture and are never overwritten by the user's text. Ships as a title card. |
| Website hero | `hero-sequence`, 16:9, 8 s, 3 layers | Headline takes `NIGHTSHIFT`; kicker and `Scroll to explore` cue stay once-only. One word still gets a shot (per the creative notes, the sequence splits lines, else words). Ships as a hero — but see EE: the scroll-scrub behaviour the cue implies is not offered by the share dialog, so a real hero page needs a hand-edited snippet. |
| 9:16 story | `story-pop`, 9:16 (1080×1920), 5 s, 3 layers | Headline takes `NIGHTSHIFT`, fit-sized for the narrow frame; `NEW` and `LINK IN BIO` stay once-only and clear of the centre headline. Ships as a story. |

All 16 templates list and build (`node --check` passes on
`templates.js`, `export-dialog.js`, `share-dialog.js`, `path.js`,
`renderer.js`, `boot.js`). The 8 new templates are
`youtube-intro`, `hero-sequence`, `story-pop`, `logo-zoom`,
`lyric-sequence`, `editorial-spotlight`, `kaleido-window`, `orbit-badge`.
The 8 new presets are `ticker`, `blob-reveal`, `floor-plane`, `ink-pen`,
`odometer`, `axis-drift`, `anaglyph`, `spiral` (25 curated looks between
them: 3 each except `axis-drift` with 4).

The sweep figure (602 configurations in Round 4 vs 516 before) is taken
from the round brief; I did not re-run the full sweep myself — I ran the
smoke suite and the template-build check above instead.

## Criteria

### 1. Motion Craft (MC) — 8.0

Evidence: the new presets are genuinely timed, not just decorated —
`ink-pen` writes letter by letter with seeded pressure swell, `odometer`
steps in quantised detents with reel ghosts, `ticker` lags letters as a
phase shift (never a clock shift) so the loop seam stays seamless, and
every new preset uses whole-cycle motion or a start/end-empty sequence.
No `Math.random`/`Date`/`performance.now` in the new preset code (the only
`performance.now` hit in the renderer is the timing stat, not motion).
Against: nothing in Round 4 changes the timing controls themselves, and
Round 3's craft flaws are untouched — Gravity's resting overlaps on
concave grounds and the Fill-mode morph repeat seam are still open.

What would move this up one point: fix the Gravity rest overlaps and the
Fill-morph seam ghost in exported frames, and give transform/path keys a
value graph or at least free retiming (see PC).

### 2. Typographic Quality (TQ) — 8.0

Evidence: all new presets draw through `f.drawGlyph`, never pad, truncate
or replace the user's text (Odometer's ghosts are copies of the same
glyph); sizes stay relative to cap height / frame fractions, so type
scales cleanly. `axis-drift` is a real typographic idea — breathing
through the variable weight axis in steps of 10 so canvas font strings
stay cached — with an honest scale-pulse fallback on non-variable fonts.
Against, on fallback fonts only: I could not verify the weight breathing,
true italics or width-axis behaviour here (see environment note). The
Round 3 type flaws that survive are real: Stack's lowercase descenders
still collide/clip (block height uses cap height only), and the Axis Wave
RTL centring bug is a preset bug Round 4 deliberately did not touch.

What would move this up one point: fix Stack descenders and the Axis Wave
RTL centre, and group uploaded files into one family by their name tables
(Round 3 bug: Bold + Bold Italic become two families).

### 3. Path Control (PC) — 8.5

Evidence: this is still the strongest part of the tool for a working
designer — pen editor with off-frame points, 22 library shapes, A/B/C
keys with per-step eases, Remix keeping the path, and a Path lock.
Round 4's `offset()` fold trim is a real, measured improvement: on the
Node harness, bounce goes from 2 adjacent overlaps to 0 and the zigzag
fold pair (two glyphs 30 px apart along the lane landing 5.2 px apart in
space) is gone; every other shape's offset length is unchanged, so this
is surgical, not a behaviour rewrite.
Against: it is not a clean fix — zigzag still has 2 residual overlaps,
and lissajous (2), heart (2) and star (1) are unchanged, because tall
boxes rotated ~90°+ apart across an acute vertex still touch even when
spaced correctly. Path Flow on Star is still an illegible pile (a
preset-side fit bug: a ~700 px line placed on a 506 px lane wraps and
piles onto the start). Path key times are still fixed equal shares
(`path.js` sequence: "Each step takes an equal share of the loop";
the panel only displays "at X% of the loop"), and path keys are still
not draggable diamonds on the timeline — only transform keys are.

What would move this up one point: fit Path Flow lines to lane capacity
(or refuse to wrap), smooth Draw On corners at acute vertices, and make
path-key times freely draggable on the timeline.

### 4. Creative Range & Originality (CR) — 8.5 (up from 8.0)

Evidence: 41 presets and 16 templates is a genuinely broad shelf, and
Round 4's additions are mechanisms, not colour swaps — a floor
projection (`floor-plane`), a writing nib (`ink-pen`), a counter drum
(`odometer`), a generated Archimedean spiral laid out by arc length
(`spiral`), a chromatic depth split that never bursts (`anaglyph`).
The templates are art-directed pairings with distinct timing and
typography, and two Round 3 template bugs are closed by construction:
`kaleido-window` makes the headline itself the matte (both matte source
and clipped layer carry the headline role, so user text can never leave
the old word showing through), and `hero-sequence`/`lyric-sequence`
split headlines into shots instead of breaking on long or single-word
input.
Against: several new looks are familiar genre pieces (marquee, anaglyph,
counter drum next to Split Flap), and the long-text limits are stated
frankly in the notes — spiral crowds near its tight centre, the orbit
core is not fit-sized so a long word crowds the badge, and a long
kaleido headline just gets denser. Combinability is unchanged (mattes,
layers, transform keys still combine well).

What would move this up one point: a genuinely surprising combinable
system (e.g. presets that can be layered as effects on one another, or a
remix that crosses preset families) rather than more single-mechanism
presets, plus fit-sizing for the orbit core and spiral centre.

### 5. Export & Embed (EE) — 8.5

Evidence: no export or embed code changed in Round 4, and the Round 3
verified strengths stand — offline frame-accurate MP4/WebM/GIF/PNG/PNG
sequence, resolution and fps options, transparent WebM with real alpha,
After Effects JSX, and embeds (iframe, web component, self-contained
HTML) that were bit-identical to the studio in Round 3. The export
dialog still shows the codec it will really use, progress with ETA and
Cancel, and a flash warning.
Against — all three are Round 3 recommendations still open, and they are
exactly what a freelancer hits when shipping the hero above: (a) the
Embed & share dialog still offers only autoplay/loop/controls/
transparent/fit — the working `trigger="hover"`, `scrub="scroll"`,
per-layer `text=` and iframe `progress` API exist in `player.js` and
are documented in `embed.html` comments, but are not in the dialog;
(b) there is still no font route for iframe/web-component embeds of
uploaded fonts (the dialog says so honestly and points at the HTML
file, which does inline them); (c) the flash check still warns but the
export is not stopped above 3/s — the export dialog's own copy says
"the export still works".

What would move this up one point: put hover, scroll scrub and per-layer
page text in the share dialog, give iframe/web-component embeds an
uploaded-font route (or a one-click font-hosting step), and stop — or
require explicit confirmation for — exports above the flash limit.

### 6. Studio UX & Visual Design (UX) — 8.5

Evidence: the studio itself did not change in Round 4, and its Round 3
strengths carry over — clear matte/transform/spring UIs, undo/redo with
labels, draft badge, labelled dialogs with focus traps, and templates
that take the headline in one undo step. The 8 new templates are
discoverable as starting points, which is a real UX gain for a new user:
a YouTube intro, a hero and a story are now one click away instead of
a build from scratch.
Against: the Round 3 UX gaps that Round 4 did not touch are still the
ones a user trips on — embed features hidden from the dialog (see EE),
path-key times shown but not editable (see PC), and the phone gap
(transform diamonds not on the phone chart). I did not re-audit
keyboard/accessibility in this round, so I do not claim a 9 on
unexamined ground.

What would move this up one point: surface the hidden embed features,
make path-key timing editable in place, and close the phone-chart gap,
with a keyboard/accessibility pass to back a 9.

### 7. Performance & Robustness (PR) — 8.0

Evidence: Round 4's renderer work is careful and measured, not
hand-waved — supersampled transform-key layers (cap ×2, ≤16 Mpx) fix
the Round 3 blur bug for enlarging keys (a 2160p layer still gains
~1.4×) while leaving every non-enlarging scene byte-identical;
per-frame memoisation (`_setupFor`/`_pathFor` token per render) and
skipping invisible/degenerate transforms cut redundant work with no
behaviour change; new presets are deterministic by construction. The
smoke suite's determinism/seam/edge checks ran for all 41 presets in
this sandbox; the failures it reports are the font-tunnel failures and
the old `glitch-drop` flash item (see environment note), not new
Round 4 breakage.
Against: the Round 3 robustness gaps Round 4 did not close — heavy
exports still freeze the studio for 16–29 s with Cancel landing after
~20 s; scale above the ×2 cap (or buffers over 16 Mpx) still upscales
a raster and softens; folds straddling a closed path's seam are still
untrimmed; and the flash guard still does not stop an export (see EE).
The `glitch-drop` 3.5/s smoke reading is a standing safety question
for an old template, whatever its font dependence turns out to be
under real fonts.

What would move this up one point: keep the studio responsive during
export with Cancel under a second, raise or remove the supersampling
cap trade-off for large keys, and resolve the `glitch-drop` flash
reading with a real-font run.

### 8. Engineering Quality (EQ) — 8.0 (up from 7.5 provisional)

Evidence: the Round 4 diff is small and well-bounded — boot manifest,
templates, two engine files, eight preset files, three notes; no
preset, studio, export, boot or template file was touched by the
rendering work, and vice versa. The preset contract holds: each new
preset is a self-contained registration with params, looks and a
determinism discipline, and the notes document exactly what changed,
what was verified with Node harnesses, and what was not verified
(smoke for the new templates was explicitly left unverified by the
creative team — this judge ran it instead, see above). `FLASH_LIMIT`
is now exposed as `TM.Renderer.FLASH_LIMIT` so surfaces share one number.
Against: pre-existing structure debt is untouched — `labs/` is still
in the repo, PathKit and MotionKit are still split, there is still no
per-preset `supports` list, and the renderer memoisation adds a subtle
contract (presets must not mutate the scene mid-render) that is
documented in a comment but not enforced.

What would move this up one point: remove or fence `labs/`, unify the
preset kits, add per-preset capability declarations, and gate the
known path/flash regressions in CI so they cannot silently return.

## Top 3 gaps blocking 9/10

1. **Type on paths is still not clean at hard corners, and path timing
   is still not editable.** Path Flow on Star piles text, Draw On
   still overlaps at acute vertices, and path keys keep equal shares
   with no timeline diamonds. This is the PC gap, and it is the one a
   client actually sees in a delivered story.
2. **The share dialog hides the embed features the player already
   has.** Hover trigger, scroll scrub and per-layer page text work in
   `player.js` but are not offered in the dialog, and uploaded fonts
   still have no iframe/web-component route. This is the EE gap, and
   it is the one that makes the website hero harder to ship than the
   YouTube intro or the story.
3. **Exports and edge cases still have rough edges a pro bills around
   rather than through.** Heavy exports freeze the studio with slow
   Cancel, the flash guard warns but does not stop an export, and
   long text still crowds the spiral centre and orbit core while
   Stack descenders still collide. Until those are fixed, the tool is
   very good (8.25) rather than near-expert (9).

## Verdict

Round 4 is a real step up in range — 8 distinct presets and 8
art-directed templates that genuinely take the user's text — and a
careful renderer improvement, but it does not close the Round 3 gaps
that stand between this tool and 9/10. Those gaps are all in shipping:
paths at corners, embed options in the dialog, and export
responsiveness and safety. Fix those three, with a real-font
verification run, and a 9 is in reach.
