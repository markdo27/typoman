# TYPOMAN Round 5: Working Motion Designer (end user)

**Lens:** a freelancer shipping a YouTube intro, a website hero, and a 9:16
Instagram/TikTok story; Path Control, Export & Embed and UX weighted most.
**Snapshot:** the current working tree (uncommitted Round 5 work on top of
`9c89f08`): 41 registered presets, 16 templates — the same counts as
Round 4; Round 5 adds no new preset or template, it fixes Round 4's
blockers. Round 4 (this lens) was MC 8.0, TQ 8.0, PC 8.5, CR 8.5, EE 8.5,
UX 8.5, PR 8.0, EQ 8.0, mean 8.25. Round 4 median was 8.1/10.

| MC | TQ | PC | CR | EE | UX | PR | EQ | Mean |
|---|---|---|---|---|---|---|---|---|
| 8.0 | 8.0 | 9.0 | 8.5 | 9.0 | 8.5 | 8.0 | 8.0 | **8.4** |

Mean is 67.0 / 8 = 8.375, reported as **8.4**. This is one judge's mean,
not the round's median. It is **not 9/10**: two Round 4 blockers are
genuinely closed (path pile-ups, hidden embed features / warn-only
export), but the safety checker itself still cannot be trusted on long
loops, path timing is still not editable, and the font-dependent
evidence is still fallback-only. Those are the gaps in §"Top 3 gaps
blocking 9/10", and none of them is cosmetic.

## Environment limit — read this first

Google Fonts do not load in this sandbox: the smoke run reports
**0/60 catalogue fonts** (`ERR_TUNNEL_CONNECTION_FAILED`). My own
Playwright spot checks showed the same tunnel failures (4 at boot) and
no non-font console error. Font-dependent evidence therefore ran on
fallback fonts. **This is a sandbox network limit, not a product bug,
and it is not scored against the product.** It does limit what I could
verify, and this round that limit bites harder than in Round 4: every
Round 5 flash fix below is confirmed on fallback fonts only, and true
italics, variable-axis motion, Axis Drift weight breathing, width-axis
behaviour, and the real Monoton / Big Shoulders Display flash rates are
all still unverified. A 9 cannot rest on fallback-font flash numbers
alone, and this scorecard does not pretend otherwise.

## What I checked myself, and what I took from the round's verification

I did **not** re-run the full smoke, sweep or flashes-a suites myself.
The suite numbers below are the parent-verified Round 5 figures, which
I checked for internal consistency against the round's notes rather
than re-running: smoke templates 16/16 ok; studio 74 passed / 3 failed
(the 3 are boot font-console failures, and the export section passes
with the gate confirmation); sweep 602 configurations, 0 render errors,
0 determinism failures, 0 seam failures; full flashes-a, all 176
configurations ≤3/s, failing only on 54 font console errors. Where a
claim mattered to my lens, I verified it myself in Chromium
(Playwright, headless, this sandbox):

- **Share dialog, live:** opened it on a `youtube-intro` scene built
  with user text `NIGHTSHIFT`. The dialog offers Play on hover, Scroll
  scrub, and three visible per-layer inputs (placeholders `NIGHTSHIFT`,
  `EP. 01`, `WATCH NOW`; rows beyond the layer count hidden). With
  hover + scrub on, the iframe snippet carries `id="typoman-embed"`
  and `&trigger=hover`, and a separate scroll-scrub script textarea
  posts `{ typoman: 'progress', value }` with the component's viewport
  formula; the web-component snippet carries `trigger="hover"` and
  `scrub="scroll"`. With per-layer texts `PAGE ONE` and `A&B "C"`,
  the iframe snippet carries `&text=PAGE%20ONE&text2=A%26B%20%22C%22`
  and the component carries `text="PAGE ONE"`
  `text-2="A&amp;B &quot;C&quot;"` — encoding correct in both routes.
- **Export gate, live, both directions:** on a safe `editorial-quote`
  scene the gate box stays hidden and Export is enabled — safe exports
  are untouched. On `glitch-drop` with the glitch rate forced back to
  8 (my own measurement with `TM.Safety.flashes`: **3.5/s, ok: false**,
  reproducing the round's figure exactly), the dialog shows
  "Export blocked: flashes above the limit — This scene flashes about
  3.5 times a second, above the limit of 3 a second in WCAG 2.3.1",
  Export is disabled, checking "Export anyway" enables it, and
  **unchecking re-blocks it**. That is the sensible behaviour: block
  by default, confirm explicitly, and never silently stay confirmed.
  (A first probe that used single-line text `DROP` measured 0/s — the
  smaller ink area does not trip the 25%-of-field detector — which is
  a useful reminder that flash readings are text- and size-dependent,
  not a property of a preset name alone.)
- **Code reads:** `js/studio/share-dialog.js` (hover/scrub/per-layer
  options, snippet builders, scrub script), `js/studio/export-dialog.js`
  (gate box, scene-keyed confirmation, `start()` re-check, clearing on
  close/reopen/edit), `js/templates/templates.js` (glitch-drop rate 6,
  title-window `Inside` headline role), and all six Round 5 notes in
  `docs/benchmark/round-5/`.

What I did not verify live: the Path Flow / Draw On / Spiral geometry
(the round's custom Chromium harness numbers are taken from
`path-notes.md`, same-harness before/after, and are internally
consistent), the cylinder flash retimings (taken from the per-fix
notes, same-tool before/after), and anything needing a real font.

## The three deliverables, spot-checked

| Deliverable | Check this round | Result |
|---|---|---|
| YouTube intro | `youtube-intro` built with `NIGHTSHIFT`, opened in the share dialog | Headline placeholder takes the user text; `EP. 01` and `WATCH NOW` survive as separate per-layer inputs, so per-page copy can now be set without hand-editing a snippet. Ships. |
| Website hero | Share dialog on that scene (see above) | The Round 4 hero complaint is closed: hover trigger, scroll scrub and per-layer text are now offered in the dialog itself, with correct encoding in both embed routes. The remaining hero caveat is the uploaded-font route (see EE). Ships. |
| 9:16 story | `glitch-drop` (9:16) measured and gated | At its shipped rate 6 it reads 1/s (round figure); forced back to rate 8 it reads 3.5/s and the export gate blocks it until confirmed. A story built from a stock template no longer ships a non-compliant file by accident. Ships. |

## Criteria

### 1. Motion Craft (MC) — 8.0 (unchanged)

Evidence: the Round 4 timing discipline stands — whole-cycle motion,
seeded (not random) variation, deterministic loops (sweep: 0
determinism failures over 602 configurations). The cylinder retimings
are motion changes with a real aesthetic price, honestly documented:
Neon Drum trades linger-then-whip for constant rotation (4/s → 1/s),
Paper Column trades perspective swell for flat perspective and maximum
back shading (1:1 3.5/s → 2/s) — the drum reads flatter than before,
and that trade-off, not just the number, is what a designer judges.
Against: nothing in Round 5 changes the timing controls themselves,
and the Round 4 craft flaws are untouched — Gravity's resting overlaps
on concave grounds, the Fill-mode morph repeat seam, and no value graph
or free retiming for transform/path keys. The Paper Column candidate
table is a warning for future craft work: stop-count effects were
non-additive (6 stops broke the 1:1 wall, 8 did not), so "smoother =
safer" is false for this look.

What would move this up: fix the Gravity rest overlaps and the
Fill-morph seam, and give keys a value graph or at least free retiming.

### 2. Typographic Quality (TQ) — 8.0 (unchanged)

Evidence: the title-window leak is fixed, and it matters for type
correctness: `title-window` built with user text now reads
`[HELLO, HELLO, A FILM BY TYPOMAN]` instead of leaking the hard-coded
`CINEMA` grid inside the window, matching the kaleido-window pattern.
All presets still draw through `f.drawGlyph` without padding,
truncating or replacing user text. Against: the Stack descender
disagreement from Round 4 is **not** closed. The path notes' pixel
check (default scene, "big gypsy jumping") supports the art-director
reading — three clean ink clusters, 30 px / 28 px gaps — but the
motion-designer's claim was never re-tested on the exact variants it
may have rested on (extrude on, other fonts), so I score Stack as
unresolved, not fixed. Axis Wave RTL centring and uploaded-font
family grouping (Bold + Bold Italic as two families) are untouched,
and every font-dependent claim (italics, variable axes, width axis)
remains fallback-only in this sandbox.

What would move this up: close the Stack question on the named test
texts with extrude on and off on a real font, fix Axis Wave RTL
centring, and group uploaded files into one family by name table.

### 3. Path Control (PC) — 9.0 (up from 8.5)

Evidence: this is Round 5's clearest win, and it is the criterion I
weighted most. Path Flow on Star in Fill mode no longer piles text:
the closed-lane repeat is scaled to lane capacity (fit 0.746 on the
short line, 0.399 on a deliberately overflowing line; close pairs 5 →
0 on the latter). Draw On's rounded carrier lane cuts adjacent overlaps
13 → 5 on the same strict box harness (heart 1 → 0, star 4 → 0,
zigzag 3 → 2, lissajous 3 → 2, frame 2 → 1), and the Frame off-top
clamp pulls glyph tops inside the frame (lane-centre minimum y
12.9 px → 27.2 px at 65 px type). Spiral's centre knot is fixed for
the measured 119-character case (crowded pairs 90 → 0, glyph scale
0.511, short text byte-identical). Sweep rows for all three presets
show 0 render / determinism / seam failures.
Against — and this is why 9.0 here is a ceiling, not a stepping stone:
the residuals are corner touches at 42–53 px centre distance, not
pile-ups, but they are systematic on zigzag, lissajous and frame, not
rare; Path Flow Travel/Still on a closed lane still wraps and piles
because the fit is Fill-only; Draw On left/right clipping on Frame is
unclamped by design decision, not by fix; and path-key times are still
fixed equal shares, shown but not editable, with no timeline diamonds
for path keys. A 9.0 for output correctness on the measured shapes
coexists with a workflow gap that still blocks a full 9 overall.

What would move PC further, and what blocks 9 overall: freely
draggable/editable path-key times, the Travel/Still closed-lane fit,
and a per-vertex spacing (or vertex-crossing shrink) that clears the
last Draw On corner touches without regressing lissajous/frame.

### 4. Creative Range & Originality (CR) — 8.5 (unchanged)

Evidence: 41 presets and 16 templates is still a genuinely broad
shelf, and Round 5 makes more of that shelf usable rather than longer:
long Spiral text is now a usable input instead of a knot, and the
cylinder looks are shippable at all three aspects instead of failing
at 1:1. Against: Round 5 adds no new mechanism, preset or template —
range, strictly, is unchanged — and the long-text limits that remain
are stated frankly in the notes: Spiral glyphs shrink without a floor
(a product decision about minimum readable size, not yet made), the
orbit core is still not fit-sized, and a long kaleido headline still
just gets denser. No combinable system (presets as effects on one
another, cross-family remix) has appeared.

What would move this up: a genuinely surprising combinable system
rather than more single-mechanism presets, plus fit-sizing for the
orbit core and a Spiral minimum-size / overflow decision.

### 5. Export & Embed (EE) — 9.0 (up from 8.5)

Evidence: both of Round 4's named EE blockers that this round took on
are closed, and I verified both live (see above). The share dialog
now offers exactly the embed features the player already had — hover
trigger, scroll scrub (with the iframe postMessage script the dialog
generates, since `embed.html` has no scrub flag), and per-layer page
text with correct URL-encoding / HTML-escaping in both routes, blank
meaning "keep the scene's text", overrides reset on reopen so copy
never leaks between scenes. The export dialog now blocks over-limit
exports behind an explicit, rate-naming confirmation, enforced in
`start()` as well as in button state, keyed to the scene, cleared on
close/reopen/edit, with a safe alternative spelled out; the studio
suite's export section passes with the gate confirmation (74 passed,
3 font-console failures). The share dialog still warns honestly that
hover/scrub take over from autoplay on the component and that scrub
effectively wins over hover while scrubbing.
Against — the one flaw that keeps EE from being a clean 9 in
isolation, and that I count in the top gaps: there is still **no
iframe/web-component route for uploaded fonts**; the dialog warns and
points at the self-contained HTML file, which does inline them. That
is an honest workaround, not a route: a freelancer with a brand font
cannot ship an iframe hero in that font. Second, smaller: when a flash
check fails outright and no preset estimate exists, the gate cannot
block on a measurement it never got, so the export proceeds on a
"Couldn't check" warning — a known limit, stated in the code, but a
limit on the gate's completeness.

What would move this up: an uploaded-font route (or one-click font
hosting) for iframe/web-component embeds, and a gate behaviour for
the unmeasurable case that does not default to proceeding.

### 6. Studio UX & Visual Design (UX) — 8.5 (unchanged)

Evidence: the two dialog surfaces a user actually ships through are
both better: the share dialog surfaces what was hidden, and the
export gate explains itself in plain language (measured rate, WCAG
limit, safer option, explicit confirmation) instead of a bare warning.
Templates taking the headline correctly (title-window) and stock
templates being flash-safe (glitch-drop 1/s) remove two ways a new
user could ship someone else's word or a non-compliant file without
knowing. Against: the Round 4 UX gaps Round 5 did not touch are still
the ones a user trips on — path-key times shown but not editable,
the phone chart gap (transform diamonds not on the phone chart), and
no keyboard/accessibility audit in this round, so I do not claim a 9
on unexamined ground. One UX wart my own probe surfaced: safe scenes
still show "Slow export" notes (editorial-quote ~3–6 min at full
resolution in this sandbox) — honest cost surfacing, but the
underlying template cost (glitch-drop median up to ~132 ms/frame at
1080p in the budget run) is a UX fact for anyone exporting at full
size, not just a number.

What would move this up: editable path-key timing in place, the
phone-chart gap closed, and a keyboard/accessibility pass to back a 9.

### 7. Performance & Robustness (PR) — 8.0 (unchanged)

Evidence for: the shipped surface is safer and better guarded than in
Round 4 — glitch-drop 3.5/s → 1/s, cylinder Neon Drum 4/s → 1/s,
Paper Column 1:1 3.5/s → 2/s (all three aspects now ≤2/s), full
flashes-a 176/176 within the limit on fallback fonts, sweep 602
configurations with 0 render / determinism / seam failures, and a new
1080p frame-cost budget test passing 57/57. Evidence against, and it
is decisive against a rise: **the flash checker itself is untrustworthy
on long loops**. The 900-frame cap means a 60 s loop at 60 fps is
analysed at 15 fps, and a 15 Hz full-frame strobe reads **0/s and
passes** (the new long-loop test pins this as documented behaviour,
exit 0 — the test passing is the finding, not a clean bill of health).
Any loop over ~15 s at 60 fps has unverified flash safety above
7.5 Hz, and that compounds with the export gate: the gate is only as
good as the measurement it trusts. Add the still-open Round 4 items —
heavy exports freezing the studio (16–29 s, Cancel landing after
~20 s), the 200 ms budget being a <5 fps guardrail rather than a
speed claim (template medians move materially between runs, e.g.
glitch-drop 108.8 ms vs 132.35 ms), and the glitch preset's own
`flashes()` estimate returning 0 where `TM.Safety` measures 3.5/s, so
any surface trusting the estimate alone misses this class of flash.
CI now guards against regression (see EQ), but guarding a checker
with a known aliasing hole is not the same as closing the hole.

What would move this up: analyse long loops in full-rate slices (or
raise the cap with a documented cost), keep the studio responsive
during export with sub-second Cancel, and split the loose 200 ms
guardrail into preset/template budgets once CI hardware variance is
measured.

### 8. Engineering Quality (EQ) — 8.0 (unchanged)

Evidence for: Round 5's verification work is the most careful part of
the round — flashes-a is now a CI job (matching the existing jobs step
for step), plus a long-loop aliasing test and a 1080p frame-cost
budget test, all syntax-checked, with the sweep's misread "22
problems" confusion resolved in documentation (22 console-error
entries collapsing 53 tunnel events, 0 seam failures — not 22 seam
problems, and that misreading must not be carried forward). The
product diffs are small and bounded per agent (one param on one
cylinder look; one line on Paper Column; template-only rate change;
dialog-only share/export changes), and the notes document what was
not verified as prominently as what was. Evidence against: the
Round 4 structural debt is untouched — `labs/` still in the repo,
PathKit and MotionKit still split, no per-preset `supports` list, no
guard for the renderer's no-mutation contract, mutation catch still
8/23 — and the known path regressions (Draw On residuals, Star fit)
are documented but not gated in CI the way flash now is. The whole
round, like Round 4, sits uncommitted in the working tree.

What would move this up: remove or fence `labs/`, unify the preset
kits, add per-preset capability declarations, gate the path checks
in CI alongside flash, and commit the round.

## Top 3 gaps blocking 9/10

1. **The safety checker cannot be trusted on long loops — and the
   gate inherits that.** A 15 Hz strobe on a 60 s loop passes at 0/s
   because of the 900-frame analysis cap; the unmeasurable export
   case defaults to proceeding on a warning; and the glitch preset's
   own flash estimate reads 0 where the full check reads 3.5/s. Until
   long loops are analysed in full-rate slices, a freelancer cannot
   promise a client that a long-form export is photosafe, whatever
   the dialog says. Real-font confirmation of every flash fix rides
   on this gap too: all 176 ≤3/s readings are fallback-font readings.
2. **Path timing is still not editable, and closed-lane paths still
   pile outside Fill mode.** Path keys keep equal shares with no
   timeline diamonds and no in-place time editing; Path Flow
   Travel/Still on a closed lane still wraps overlong text onto
   itself; Draw On still touches at acute vertices on zigzag (2),
   lissajous (2) and frame (1). This is the PC workflow gap, and it
   is the one a client actually sees when a path deliverable needs
   retiming rather than rebuilding.
3. **Uploaded fonts still have no iframe/web-component embed route,
   and font-dependent verification is still outstanding.** The share
   dialog warns honestly and points at the HTML file, but a brand
   font cannot ship in an iframe or web-component embed. In the same
   breath: italics, variable axes, width axis, Axis Drift breathing
   and the real Monoton / Big Shoulders flash rates have no passing
   evidence anywhere, because fonts do not load in this sandbox.
   A 9 needs a real-font CI run and a font route, not just a warning.

Runner-up gaps, named so they are not lost: heavy exports still
freeze the studio with slow Cancel; the Stack descender question is
still disputed, not closed; Spiral has no minimum-size floor for
extreme text; and the 200 ms frame budget is a regression guardrail,
not a performance claim.

## Verdict

Round 5 closes the two shipping blockers a working designer named in
Round 4 — type on paths that piled, and a share/export surface that
hid its own features and warned instead of stopping — and it does so
with measurements, not assertions: Star pile gone, Draw On 13 → 5,
Spiral knot gone, share features verified live in both snippet
routes, the export gate verified live blocking, confirming and
re-blocking. That is worth the rise to 8.4. It is not 9, because the
checker that underwrites the safety story aliases on long loops, path
timing is still display-only, and the whole font-dependent case is
still unverified. Fix those three, with a real-font run, and a 9 is
in reach — and this time the remaining work is narrower and better
instrumented than it was in Round 4.
