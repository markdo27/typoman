# TYPOMAN Round 5 — Cylinder · Paper Column flash fix (1:1)

**Agent:** Round 5 paper-column flash-fix (not a verification agent). **Scope kept, no exceptions:**
edited only `js/presets/cylinder.js` (Paper Column look's params, one line) and wrote this file.
No other preset, engine, studio, template, test, or workflow file was edited.
Nothing was committed or pushed.

Note on the working tree: `js/presets/cylinder.js` was already modified before
this agent started (other Round 5 agents' uncommitted work, including the
Neon Drum `spin: 'smooth'` line from `cylinder-flash-fix.md`). The diff
against HEAD therefore shows that line too; this agent's own change is only
the Paper Column line below, and Neon Drum was verified not to regress.

## Problem

The cylinder flash-fix agent (`docs/benchmark/round-5/cylinder-flash-fix.md`,
"Out of scope, deliberately not fixed") reported, on extra-aspect runs of
`node tests/flashes-a.mjs cylinder`:

| Configuration | Before |
|---|---|
| cylinder · Paper Column · 16:9 | 2.5/s general, 0/s red — ok |
| cylinder · Paper Column · 9:16 | 2.0/s general, 0/s red — ok |
| cylinder · Paper Column · 1:1 | **3.5/s general, 0/s red — FAIL** (worst second starts 0.63 s) |

The WCAG 2.3.1 limit in `TM.Safety.flashes` is 3/s, general and red. The
flashes-a CI configuration is 16:9 only, but a 9/10 app should not ship a
look that fails at 1:1, so the brief asked for all three aspects at ≤3/s,
ideally ≤2.5/s for headroom.

Baseline reproduced before any change with the same tool (this agent's run):

```
ASPECTS=16:9,9:16,1:1 node tests/flashes-a.mjs cylinder
  cylinder  Gold Ring     16:9  1    0  ok
  cylinder  Neon Drum     16:9  1    0  ok
  cylinder  Paper Column  16:9  2.5  0  ok
  cylinder  Gold Ring     9:16  0    0  ok
  cylinder  Neon Drum     9:16  0    0  ok
  cylinder  Paper Column  9:16  2    0  ok
  cylinder  Gold Ring     1:1   2    0  ok
  cylinder  Neon Drum     1:1   0    0  ok
  cylinder  Paper Column  1:1   3.5  0  FAIL (worst second starts 0.63 s)
```

## The Neon lesson does NOT transfer — this look flashes differently

Neon Drum's failure was its `spin: 'present'` linger-then-whip, and
`spin: 'smooth'` fixed it (4/s → 1/s). Paper Column was already on a
ratchet (`spin: 'steps'`, 4 stops, default `stepEase: 'springSnappy'`), so
the first candidates tried here were the Neon-style ones — and they made
Paper Column worse, not better. That is the main finding of this fix: for
this high-contrast black-on-paper look, the flash driver is not the whip,
it is how much of the repeated glyph pattern each ratchet jump (or each
moment of continuous motion) sweeps through a 10° analysis field. The
`TM.Safety.flashes` detector counts a flash as a pair of opposing
luminance changes of ≥10% covering ≥25% of such a field, so a jump that
sweeps past several glyphs/edges in one field racks up several opposing
changes at once, while continuous motion does the same thing constantly.

Candidate sweep (general flashes/s; red was 0/s for Paper Column in every
run, and Neon Drum stayed 1/0/0 at 16:9/9:16/1:1 throughout — only the
Paper Column row is shown; each row is a full
`ASPECTS=16:9,9:16,1:1 node tests/flashes-a.mjs cylinder` run):

| Candidate (change from baseline, one at a time unless noted) | 16:9 | 9:16 | 1:1 | Verdict |
|---|---|---|---|---|
| Baseline: `steps`, stops 4, shade 0.8 | 2.5 | 2.0 | 3.5 | FAIL at 1:1 |
| `spin: 'smooth'` (Neon fix, stops dropped) | 5.0 | 0.0 | 6.0 | Worse at 16:9 and 1:1 — rejected |
| `spin: 'present'` (default linger-then-whip) | 5.0 | 2.0 | 8.0 | Far worse at 1:1 — rejected |
| `steps`, stops 4, `stepEase: 'smooth'` (monotonic ease instead of spring) | 5.0 | 4.5 | 5.0 | Worse everywhere — the spring's fast settle + long dwell was helping; rejected |
| `steps`, stops 8, shade 0.8 | 3.5 | 1.0 | 3.5 | Worse at 16:9, unchanged at 1:1 — rejected |
| `steps`, stops 12, shade 0.8 | 2.5 | 2.0 | 3.0 | Passes, but 1:1 exactly at the limit — no headroom |
| `steps`, stops 12, shade 1 | 2.5 | 1.5 | 3.0 | Same 1:1 wall; deeper back shading helps 9:16 only |
| `steps`, stops 12, shade 1, `back: 'hide'` | 2.5 | 1.5 | 3.0 | Identical numbers — the worst field is front-driven, so hiding the back buys nothing and costs the mirrored back text; rejected |
| `steps`, stops 12, shade 1, `alternate: false` | 2.0 | 1.5 | 4.0 | Helps 16:9, hurts 1:1 — counter-rotation was helping at 1:1; rejected |
| `steps`, stops 12, shade 1, `perspective: 1` | 4.0 | 3.5 | 4.5 | Strong perspective much worse everywhere — rejected |
| `steps`, stops 12, shade 1, `perspective: 0` | 2.0 | 1.5 | 3.0 | Helps 16:9, 1:1 wall unchanged |
| `steps`, stops 12, shade 1, `tilt: 0` | 2.0 | 2.0 | 3.0 | Helps 16:9, 1:1 wall unchanged |
| `steps`, stops 16 / 24, shade 1, separator space | 2.0 | 1.5 | 3.0 | Finer steps past 12 change nothing at 1:1 |
| `steps`, stops 10, shade 1 | 2.0 | 1.0 | 3.0 | Same 1:1 wall |
| **`steps`, stops 6, shade 1** | 3.0 | 1.0 | 2.5 | 1:1 breaks through the wall, but 16:9 rises to exactly the limit |
| `steps`, stops 6, shade 1, separator space | 3.5 | 1.0 | 2.5 | Space separator hurts 16:9 at 6 stops (interactions are not additive) — rejected |
| `steps`, stops 6, shade 1, `tilt: 0` | 2.0 | 2.0 | 3.0 | 1:1 back to the wall — rejected |
| **FINAL: `steps`, stops 6, `perspective: 0`, shade 1** | **2.0** | **1.0** | **2.0** | **Passes everywhere with 1/s headroom** |

Two patterns in that table are worth recording for future flash work on
this preset. First, the 1:1 reading sat at exactly 3.0/s for every
12+-stop, tilt, perspective, back-face and separator variant tried — a
wall, not a slope — and only the 6-stop jump broke it, while 8 stops did
not: stop count interacts with the repeated pattern's angular period, so
"more stops = smoother = safer" is false for this look. Second, candidate
effects do not add up (separator space helped at 12 stops and hurt at 6;
flat perspective helped only in combination with 6 stops), so each
combination was measured rather than inferred.

## Change

`js/presets/cylinder.js`, Paper Column look only — its params line:

```diff
- params: { repeat: true, separator: 'slash', tilt: -16, spin: 'steps', stops: 4, shade: 0.8 }
+ params: { repeat: true, separator: 'slash', tilt: -16, spin: 'steps', stops: 6, perspective: 0, shade: 1 }
```

Three param changes, all inside the preset UI ranges (stops 2–12,
perspective 0–1, shade 0–1), so the fixed look is reproducible from the
studio controls:

- **`stops: 4 → 6`** — the ratchet clicks in six steps per turn instead of
  four. This is the change that breaks the 1:1 wall: each jump sweeps a
  smaller arc of the repeated pattern, so a 10° field sees fewer opposing
  luminance changes per jump. The look stays a ratchet — dwell, then click
  — it just clicks a little more often and a little less far.
- **`perspective: 0`** (was the preset default 0.55) — flat perspective:
  front glyphs no longer loom large and back glyphs no longer shrink as
  much, so the luminance swing of a field as glyphs swing round is
  smaller. This is what pulls 16:9 back down from 3.0/s (stops 6 alone)
  to 2.0/s.
- **`shade: 0.8 → 1`** — maximum depth shading: back faces fade further
  toward the paper, trimming their contribution to the swing. Front faces
  are unchanged (their shading factor is ~1 at the front of the drum).

Everything else about the look is unchanged, so its identity is preserved:
solid `#f4f1ea` paper background, Big Shoulders Display 800, solid
`#141414` fill, `repeat: true` with slash separators, `-16°` lean, the
default 1 turn per loop, radius and counter-rotation. What the look gives
up is some depth cueing: the drum reads flatter (no perspective swell at
the front) and its back faces are fainter. The ratchet character, the
colours, the typeface and the lean — the things that make it Paper Column
rather than another drum — are all intact. No change was made to the
flash detector, the preset mechanism, the preset API, or any other look:
Gold Ring and Neon Drum params are untouched by this agent.

## Verification (this sandbox)

`node --check` passes, and the final configuration was measured twice
with identical results (the second run is the verification run):

```
node --check js/presets/cylinder.js   # pass (no output)
ASPECTS=16:9,9:16,1:1 node tests/flashes-a.mjs cylinder
  cylinder  default      16:9  0    0  ok
  cylinder  Gold Ring    16:9  1    0  ok
  cylinder  Neon Drum    16:9  1    0  ok
  cylinder  Paper Column 16:9  2    0  ok
  cylinder  default      9:16  0    0  ok
  cylinder  Gold Ring    9:16  0    0  ok
  cylinder  Neon Drum    9:16  0    0  ok
  cylinder  Paper Column 9:16  1    0  ok
  cylinder  default      1:1   0    0  ok
  cylinder  Gold Ring    1:1   2    0  ok
  cylinder  Neon Drum    1:1   0    0  ok
  cylinder  Paper Column 1:1   2    0  ok
```

So Paper Column went **2.5 → 2.0/s at 16:9, 2.0 → 1.0/s at 9:16, and
3.5 → 2.0/s at 1:1 (general, 0/s red throughout)** — inside the 3/s limit
at all three aspects with 1/s of headroom, meeting the brief's "ideally
≤2.5/s" target everywhere. Neon Drum did not regress: it stayed 1/0/0
at 16:9/9:16/1:1, the same as before this change. The flashes-a command
still exits non-zero, but only because of the 8 Google Fonts console
errors in this sandbox (see below) — no cylinder configuration fails the
flash limit at any aspect.

Sweep row for cylinder:

```
node tests/sweep.mjs cylinder
  17 configurations, 3 looks, deterministic: yes, worst seam 0.99× (Gold Ring)
  No render, determinism, or seam failure for Paper Column.
  Only failures are 5 Google Fonts tunnel console errors (below).
```

## Sandbox font limit, stated honestly

As in the Neon Drum fix note, Google Fonts fail in this sandbox
(`ERR_TUNNEL_CONNECTION_FAILED`, 0/60 catalogue fonts in smoke), so every
measurement above ran on fallback fonts, not on Big Shoulders Display.
The 3.5/s → 2.0/s improvement at 1:1 is therefore confirmed on fallback
fonts with the same tool that reported the failure — but whether it
reproduces at the same rates on the real typeface is **unverified here,
not disproven and not confirmed**. Big Shoulders Display is a narrow,
tall display face; its real glyph widths change the drum radius the
layout forces (the drum grows if a line would wrap too far round it) and
the angular period of the repeated pattern, and both of those are exactly
the quantities this fix is sensitive to (see the stop-count interaction
above). The 1/s of headroom at every aspect leaves room, but it is not a
real-font proof: the first real-font CI run of the `flash` job should be
watched for this look specifically, at 1:1 as well as 16:9.

## Remaining flash risk for this look

- **Real fonts:** see above. Re-measure on real Big Shoulders Display
  before treating this as closed; if 1:1 creeps back up on real glyphs,
  the next lever to try is another stop count in the 5–7 range (6 worked
  here, 8 did not, 5 was not tried), not finer steps — finer steps were
  shown not to help past 12.
- **Other text / multi-line scenes:** only the stock scene was measured.
  Longer phrases change the repeat count round the drum and therefore the
  pattern period this fix depends on; user text was not re-measured.
- **Depth cueing trade-off:** `perspective: 0` flattens the drum. If a
  later design pass wants the perspective swell back, it must re-measure:
  `perspective: 1` was far worse (4.5/s at 1:1) and the default 0.55 with
  stops 6 alone was not measured — only stops 6 + perspective 0 + shade 1
  is verified at 2/1/2.
- **No detector change:** `TM.Safety.flashes` and the 900-frame long-loop
  cap are untouched, so the separate long-loop aliasing finding in the
  verification notes still stands for loops over ~15 s at 60 fps.
