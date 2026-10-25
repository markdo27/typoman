# TYPOMAN Round 6: Working Motion Designer (end user)

**Lens:** a freelancer shipping a YouTube intro, a website hero, and a 9:16
Instagram/TikTok story; Path Control, Export & Embed and UX weighted most.
**Snapshot:** the current working tree (uncommitted Round 5 + Round 6 work on
top of `9c89f08`). Round 5 (this lens) was MC 8.0, TQ 8.0, PC 9.0, CR 8.5,
EE 9.0, UX 8.5, PR 8.0, EQ 8.0, mean 8.4. The Round 5 jury median was 8.2/10.
Round 6, for this judge, is a two-claim round — long-loop flash analysis and
Path Flow / Draw On geometry — plus their tests. No new preset, template,
studio surface or embed route is claimed in the Round 6 notes, and I score
on that basis; the rest of the tree diff against `9c89f08` is the Round 5
work I already judged, not new Round 6 evidence.

| MC | TQ | PC | CR | EE | UX | PR | EQ | Mean |
|---|---|---|---|---|---|---|---|---|
| 8.0 | 8.0 | 9.0 | 8.5 | 9.0 | 8.5 | 8.5 | 8.5 | **8.5** |

Mean is 68.0 / 8 = **8.5**. This is one judge's mean, not the round's
median. It is **not 9/10**, and the rise from 8.4 is deliberately small:
Round 6 closes the single biggest trust problem in the product (the flash
checker aliasing on long loops) and finishes the Path Flow closed-lane
story, but it does so at a steep wall-time cost in this sandbox, leaves
the one visible Loop overlap untouched by design, and changes nothing
about fonts, path-key editing, or the embed routes. A 9 needs those, not
another geometry tweak.

## Environment limit — read this first

Google Fonts do not load in this sandbox: Round 5 reported **0/60
catalogue fonts** (`ERR_TUNNEL_CONNECTION_FAILED`), and the Round 6 notes
report the same tunnel failures. **This is a sandbox network limit, not a
product bug, and it is not scored against the product.** It does limit
what I could verify, exactly as in Round 5: every type measurement below
ran on fallback-font widths, and italics, variable axes, width-axis
behaviour, Axis Drift weight breathing, and the real Monoton / Big
Shoulders Display flash rates remain unverified. The two claims I was
asked to verify are, usefully, the two least font-sensitive ones: the
long-loop test uses solid fills, and the path harnesses measure glyph
boxes at a fixed size. That is why they can be verified here at all —
and why a 9 still cannot rest on this round alone.

## The two Round 6 claims — verified, not taken on trust

### Claim 1: long-loop flash analysis fixed to full frame rate in slices — VERIFIED

I ran `node tests/flash-long-loop.mjs` myself in Chromium in this
sandbox. It passed, with every reading matching the claim:

| Case | My run |
|---|---|
| 60 s @ 60 fps, 15 Hz strobe | 3600 frames = 60 fps analysis, **15/s, ok: false** |
| 2 s @ 60 fps, 15 Hz strobe (control) | 120 frames, 15/s, ok: false |
| 60 s @ 60 fps, 4 Hz strobe (control) | 3600 frames, 4/s, ok: false |
| 60 s @ 60 fps, 15 Hz saturated-red strobe | 3600 frames, 15/s general, **15/s red**, ok: false |
| 4 s @ 60 fps, seam pulse (white on frame 0 only) | 240 frames, **1/s, ok: true** — the seam rise still counts |
| 4 s @ 60 fps, 15 Hz strobe (anchor) | 240 frames, 15/s, ok: false |

The code change is exactly what the note describes, and I read it rather
than trusting the summary: `js/engine/safety.js` drops the
`Math.min(opts.maxFrames || 900, …)` cap, sets `n = round(duration ×
fps)`, renders in 240-frame slices accumulating into the same
preallocated series, and yields at every slice boundary even for a
large `yieldMs`. The transition and worst-field counting are untouched,
so short loops read exactly as before — the controls above confirm that
rather than asserting it. Deliberately ignoring a caller-passed
`maxFrames` instead of raising it is the right call for a safety
function: a cap option is an aliasing option. The old test pinned the
aliasing and therefore had to be rewritten, not weakened; the new test
pins the fixed behaviour (3600 frames, ~15/s, fail) and I agree with
that rewrite.

One honest discrepancy on cost, which matters for the score below: the
safety note reports ~4.4–5.2 s per 60 s case in this sandbox. My run
took **19–25 s per 60 s case** (19.2 s, 18.1 s, 25.3 s; 76 s total for
the suite). A first attempt of mine also hit my own 120 s wrapper
timeout, which was my harness limit, not a product failure, and I do
not count it against the product. But the per-case times are the
product's: slicing keeps the page responsive, it does not make 3600
renders cheap, and on this sandbox's hardware a 60 s export gate is a
~20 s wait, not a ~5 s one. That variance — 5 s claimed, ~20 s
measured here — is itself a reason not to score Performance at 9:
the cost is real, hardware-dependent, and undisguised only if the
studio debounces/caches the check instead of re-running it per edit.

Remaining safety caveats, all disclosed in the note and all real:
unnormalised scenes are not clamped inside `flashes()` itself, so the
16.6 MB / 3600-frame bound holds only for normalised scenes (a raw
600 s @ 60 fps caller would allocate ~166 MB); analysis stays at
24×24 cells, so a flash under 25% of a 10° field passes by WCAG
definition, not by oversight; and text-preset flash rates measured
here are fallback-font readings.

### Claim 2: Path Flow Travel/Still closed-lane fit, Draw On residuals cleared — VERIFIED, with Loop excepted

I re-ran the round's own Chromium harnesses (`/tmp/r6-flow.mjs`,
`/tmp/r6-draw3.mjs`, 960×540, 65 px type, "TYPE IN MOTION") against the
current tree. Every headline number reproduced:

**Path Flow Travel/Still on closed lanes (fit extended from Fill):**

| Case | Before (notes) | My after run |
|---|---|---|
| Travel Star long, p 0 / .25 / .5 / .75 | close pairs 5/3/6/8, min 3.6–6.0 px | **0 / 0 / 0 / 0**, min 17.5–19.1 px, scale 0.437 |
| Still Star long, all phases | 5, 3.6 px | **0**, 17.5 px, scale 0.437 |
| Travel/Still Circle long | 1, 13.6 px | **0**, 30.8 px, scale 0.932 |
| Travel Star short | — (nearly meeting at closure, 24.9 px) | scale 0.887, min 53.5 px |
| Fill Circle short (seam fix) | separator 2.8 px from next repeat | **0 close pairs**, 26.4 px, scale 0.796, calls still 26 |

The design is right: `fit = min(1, lane.length / line.width)` scales
advances *and* glyph size about the untouched start `s0`, so travel
start, offset, ease and cycle keep their meaning, the run still crosses
the seam, and open paths keep fit = 1 (their overflow is meant to
scroll off). The Fill reps fix is the subtler, better change: choosing
`reps` from the *unfitted* unit and capping the fit by the whole tiled
run removes a genuine seam pile that Round 5's calls-and-scale controls
could not see. Fill rows that were already correct are byte-identical
in the notes, and my run confirms Circle short and Frame long behave
as claimed.

**Draw On vertex-local pop-shrink (chosen over per-pair spacing):**

My run of the 22-shape table reproduces the notes' totals exactly:
**mean-model 42 → 9, per-glyph 33 → 2, depth > 0.5 px 2 → 2**. The
Round 5 residuals are gone on both models (zigzag, lissajous, frame
all 0), the 7 remaining mean-model counts are all 0 on the per-glyph
model (narrow-I-against-wide-neighbour artefacts of the mean model,
correctly not chased), and non-Loop shrinks are 1–2% (invisible).
The rejected alternative matters to the judgement: per-pair spacing
cleared more on paper (per-glyph 33 → 2 as well) but *worsened* Loop
N–M from 18.79 px to 21.37 px, because pushing along a folding lane
moves a glyph toward its predecessor in space. Shrinking only the
later glyph, capped at 20% over at most 3 iterations, can only reduce
overlaps and moves nothing along the lane — so pen timing, lead and
lane positions are untouched. That is a well-reasoned rejection, not
a headline-chasing one.

**Loop remains, honestly:** Loop I–N 1.31 px and N–M 16.82 px (my run:
16.82 px per-glyph, 17.13 px mean-model) are still there, at the 20%
cap, because the lane itself crosses there. Clearing N–M would need a
>50% shrink or a >20 px move that the spacing experiment proved makes
things worse. I agree with leaving it: it is a shape/size property
(Loop at 65 px with this text), and the fix belongs to a Loop-specific
lane or a smaller default size for that shape, not a bigger shrink cap
that would make one glyph tiny while still overlapping. But it is a
visible overlap on a shipped shape, and it is why Path Control stays
at 9.0 rather than rising — output on the measured shapes is
near-expert, but one shape still ships an overlap a client can see.

**Frame horizontal clipping — no guard added, and I agree with
not forcing one:** at the default 65 px type there is no horizontal
clipping to fix (spread/above box inside by 1.4 px; the Round 5
vertical clamp's headroom already covers the side extent). At 108 px
it is real but small (≤ 5.4 px, corner glyphs only). Neither guard form
is look-neutral — a scalar `up` guard shrinks the designed gap for
every glyph, a per-glyph x-clamp detaches intentionally cropped glyphs
from their lane and cannot tell a Frame inset border from a custom
path meant to run off-frame. The three design questions the note puts
to the parent (must closed-path text ever be canvas-cropped? scalar
or per-glyph guard? what minimum gap survives?) are the right ones,
and answering them is a product decision, not something to invent in
a preset file. This is documented restraint, not an oversight — but
it is still an open decision, and it counts against a 9.

What I did not verify live: the sweep rows for these presets (taken
from the notes: 0 render errors, deterministic, worst seam 1.00× for
path-flow and 0.00× for path-draw, failing only on the sandbox font
console errors), and anything needing a real font or a second type
size. The notes are explicit that all type measurements are
single-size (65 px), fallback-font — I treat the sub-pixel graze
counts accordingly, as geometry evidence, not as pixel-perfect
product-visible defects.

## The three deliverables, re-checked against Round 6

| Deliverable | Round 6 effect | Result |
|---|---|---|
| YouTube intro | Nothing in Round 6 changes intro building; the export gate behind it is now trustworthy on long loops | Ships, with the same share dialog as Round 5. A 60 s intro's flash check is now a real check — at ~20 s in this sandbox, which the studio should not re-run on every keystroke. |
| Website hero | Path text on a closed lane (Star/Circle marquee hero) no longer piles in Travel/Still, and Fill seams no longer pile | Ships. This is the most visible Round 6 win for a hero: a long marquee that used to wrap onto itself now fits the loop at 0.437–0.932 scale instead. |
| 9:16 story | Long-loop strobe detection now fails a 15 Hz story instead of passing it at 0/s | Ships, more honestly than in Round 5. The story that would previously have exported a non-compliant file on a long loop is now blocked by the gate — provided the gate's measurement is the full-rate one, which it now is. |

## Criteria

### 1. Motion Craft (MC) — 8.0 (unchanged)

Evidence: the Round 5 timing discipline stands — whole-cycle motion,
seeded variation, deterministic loops. Nothing in Round 6 changes
timing controls, and the Round 5 craft flaws are untouched: Gravity's
resting overlaps on concave grounds, the Fill-mode morph repeat seam,
and no value graph or free retiming for transform/path keys. The
path fits shrink glyphs (Star long to 0.437) rather than retiming
them, which is correct for a capacity problem but is not a craft
improvement — a designer who wants the long text at full size on a
small loop still has no retiming tool, only a smaller render.
Against a rise: same as Round 5.

What would move this up: fix the Gravity rest overlaps and the
Fill-morph seam, and give keys a value graph or at least free
retiming.

### 2. Typographic Quality (TQ) — 8.0 (unchanged)

Evidence: all presets still draw through `f.drawGlyph` without
padding, truncating or replacing user text; the Round 5 title-window
fix stands. Against: the Stack descender question from Round 4/5 is
still disputed, not closed (never re-tested on the named variants
with extrude on and off on a real font); Axis Wave RTL centring and
uploaded-font family grouping are untouched; and every
font-dependent claim remains fallback-only in this sandbox. The
Round 6 path shrinks are typographically honest (proportional
advance + size, 1–2% on Draw On, no letterspacing hacks), but they
do not change type quality — they change fit.

What would move this up: close Stack on the named test texts with
extrude on and off on a real font, fix Axis Wave RTL centring, and
group uploaded files into one family by name table.

### 3. Path Control (PC) — 9.0 (unchanged, at its ceiling)

Evidence: this round completes the closed-lane story Round 5 left
half-finished. Travel/Still no longer pile on Star or Circle at any
phase; Fill's seam pile is fixed without changing correct rows; Draw
On's honest floor is Loop only (per-glyph 33 → 2, both on Loop).
The fit has no new param, no API change, and `place()` already took
a scale argument — the change is proportionate to the problem.
Against — and this is why 9.0 is a ceiling here: Loop still ships a
16.82 px overlap; Frame horizontal clipping at large sizes is an
undecided design question, not a fix; path-key times are still fixed
equal shares, shown but not editable, with no timeline diamonds for
path keys; and folds straddling a closed path's seam are still
untrimmed in `offset()` (engine scope, noted not patched). A 9.0 for
output correctness on the measured shapes coexists with a workflow
gap that still blocks a full 9 overall, exactly as in Round 5 — only
now the output side is as good as this approach gets, and the
remaining work is workflow and one shape, not more shrink.

What would move PC further, and what blocks 9 overall: freely
draggable/editable path-key times, a Loop-specific lane or default
size, and the Frame horizontal-guard decision (scalar vs per-glyph,
and which paths it applies to).

### 4. Creative Range & Originality (CR) — 8.5 (unchanged)

Evidence: the shelf is still 41 registered presets and 16 templates
— genuinely broad, and Round 6 makes more of that shelf usable (long
path text, long loops) rather than longer. Against: the Round 6 notes
claim no new mechanism, preset or template, and I found none claimed;
the long-text limits that remain are stated frankly (Spiral glyphs
shrink without a floor, the orbit core is still not fit-sized, a long
kaleido headline still just gets denser). No combinable system
(presets as effects on one another, cross-family remix) has appeared.

What would move this up: a genuinely surprising combinable system
rather than more single-mechanism presets, plus fit-sizing for the
orbit core and a Spiral minimum-size / overflow decision.

### 5. Export & Embed (EE) — 9.0 (unchanged)

Evidence: Round 6 strengthens EE indirectly but materially — the
export gate I verified live in Round 5 now rests on a measurement
that can be trusted on long loops, which is the difference between a
gate and a gate-shaped warning for any loop over ~15 s. The share
dialog, snippet encoding, and per-layer text behaviour from Round 5
are untouched and still stand. Against — the same two flaws as
Round 5, both untouched this round: there is still **no
iframe/web-component route for uploaded fonts** (the dialog warns
and points at the self-contained HTML file — an honest workaround,
not a route, so a brand font still cannot ship in an iframe hero);
and when a flash check fails outright and no preset estimate exists,
the gate cannot block on a measurement it never got, so the export
proceeds on a "Couldn't check" warning. A gate that is trustworthy
when it measures, but still defaults to proceeding when it cannot,
is not a clean 9 in isolation — it is a 9.0 held by its neighbours.

What would move this up: an uploaded-font route (or one-click font
hosting) for iframe/web-component embeds, and a gate behaviour for
the unmeasurable case that does not default to proceeding.

### 6. Studio UX & Visual Design (UX) — 8.5 (unchanged)

Evidence: the dialog surfaces a user ships through are unchanged
from Round 5 and still good — the share dialog surfaces what was
hidden, the export gate explains itself in plain language. Against:
Round 6 adds a UX cost even as it adds trust — a 60 s flash check
measured at 19–25 s per case in this sandbox (against ~5 s in the
notes) is noticeable if the studio re-runs it on every edit, and the
note itself says the fix for that belongs in the studio
(debounce/cache), not in downsampling the detector. That studio fix
is not in this round. The Round 5 UX gaps are also untouched:
path-key times shown but not editable, the phone chart gap
(transform diamonds not on the phone chart), and no
keyboard/accessibility audit in this round, so I do not claim a 9
on unexamined ground.

What would move this up: editable path-key timing in place, a
debounced/cached long-loop check in the studio, the phone-chart gap
closed, and a keyboard/accessibility pass to back a 9.

### 7. Performance & Robustness (PR) — 8.5 (up from 8.0)

Evidence for the rise: the Round 5 verdict's decisive objection is
gone. The checker no longer aliases: a 60 s 15 Hz strobe reads 15/s
and fails (verified by me, above), controls and the seam are
unchanged, red flashes count at full rate, slicing keeps the page
responsive during a long check, and memory is bounded for normalised
scenes (~16.6 MB series + ~2.1 MB hit arrays at 3600 frames). The
sweep rows for the path presets show 0 render / determinism / seam
failures. Evidence against a further rise, and it is substantial:
wall time. My measured 19–25 s per 60 s case is 4–5× the note's
~5 s, and whether that is sandbox hardware, contention, or both, a
freelancer on comparable hardware faces a ~20 s gate on a long
export — acceptable as a one-off export gate, not as a per-edit
check. Add the unnormalised-scene caveat (~166 MB at 600 s, no clamp
inside `flashes()` itself), the still-open Round 4 items (heavy
exports freezing the studio, Cancel landing after ~20 s), and the
fact that all text-preset flash rates here are still fallback-font
readings. The checker is now trustworthy; it is not yet cheap, and
trustworthy-but-slow is 8.5, not 9.

What would move this up: a debounced/cached studio check so the
~20 s cost is paid once per scene version, a clamp or streaming
pass for unnormalised scenes, sub-second Cancel on heavy exports,
and a real-font flash run.

### 8. Engineering Quality (EQ) — 8.5 (up from 8.0)

Evidence for the rise: Round 6's engineering is careful in the ways
that matter. The safety fix preserves short-loop readings exactly by
leaving the counting code untouched and changing only the frame
count and its rendering loop; the path fixes are scoped to their
files, add no params or look names, and document their rejected
alternatives (per-pair spacing, both guard forms) with the
measurements that rejected them; the long-loop test was rewritten
to pin the fixed behaviour rather than weakened to keep passing;
and the notes name what was not verified as prominently as what
was. Evidence against a further rise: the whole round, like Round 5,
sits uncommitted in the working tree; the Round 4 structural debt is
untouched (`labs/` still in the repo, PathKit and MotionKit still
split, no per-preset `supports` list, no guard for the renderer's
no-mutation contract); the path checks are still harness-only, not
gated in CI the way flash now is; and there is already small doc
drift — the CI workflow's flash-job comment still describes the
long-loop check as pinning the 900-frame cap, when the rewritten
test pins its removal. Small, but a 9 does not ship stale comments
about its own safety test.

What would move this up: commit the round, gate the path checks in
CI alongside flash, remove or fence `labs/`, unify the preset kits,
and fix the stale workflow comment.

## Top 3 gaps blocking 9/10

1. **Font-dependent verification is still outstanding, and uploaded
   fonts still have no iframe/web-component embed route.** Every
   flash rate, italic, variable-axis and width-axis claim in this
   round rests on fallback fonts because Google Fonts do not load
   in this sandbox (0/60 in Round 5, same tunnel failures in Round
   6). A 9 needs a real-font CI run. In the same gap: a freelancer
   with a brand font still cannot ship an iframe hero in that font
   — the dialog warns honestly and points at the HTML file, but
   that is a workaround, not a route.
2. **Path workflow is still display-only, and Loop still overlaps.**
   Path-key times are fixed equal shares with no timeline diamonds
   and no in-place editing; Draw On Loop still overlaps at 1.31 px
   (I–N) and 16.82 px (N–M) at 65 px type; and the Frame horizontal
   guard is an undecided design question (scalar vs per-glyph,
   which paths, what minimum gap). Round 6 took path *output* to
   its honest floor — the remaining path work is workflow and one
   shape, and it is the work a client actually sees when a path
   deliverable needs retiming rather than rebuilding.
3. **The trustworthy check is not yet a cheap check, and the studio
   has not caught up with it.** A 60 s flash check measured 19–25 s
   per case in my sandbox run against ~5 s in the notes; unnormalised
   scenes are still unclamped inside `flashes()`; heavy exports
   still freeze the studio with slow Cancel; and the gate still
   defaults to proceeding on a "Couldn't check" warning when no
   measurement exists. Until the studio debounces/caches the check
   and the unmeasurable case stops defaulting to proceed, the safety
   story is trustworthy in the detector and unfinished in the
   product around it.

Runner-up gaps, named so they are not lost: the stale CI workflow
comment about the long-loop test; Spiral's missing minimum-size
floor for extreme text; the Stack descender question, still
disputed; folds straddling a closed path's seam, still untrimmed in
`offset()`; and the whole round still uncommitted.

## Verdict

Round 6 does what it claimed, and I verified both claims myself
rather than trusting the notes: the 60 s 15 Hz strobe now reads
15/s and fails (with controls, red flashes and the seam all correct),
and Path Flow Travel/Still no longer pile on closed lanes while
Draw On's residuals are down to Loop alone — at scales and distances
that reproduce the notes to the decimal. That closes the Round 5
verdict's top blocker and completes the closed-lane story, which is
worth the rise to 8.5. It is not 9, because the check that is now
trustworthy costs ~20 s on a long loop in this sandbox and has not
been given a debounced studio home, because Loop still ships a
visible overlap and path timing is still not editable, and because
everything font-dependent is still unverified on fallback fonts.
Fix those three — a real-font run plus a font embed route, path
timing plus Loop, and a cheap, cached, never-default-to-proceed
safety story — and a 9 is in reach, with narrower and better
instrumented work remaining than in any previous round.
