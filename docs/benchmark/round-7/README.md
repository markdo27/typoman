# TYPOMAN Round 7 — summary (1–10 scale)

Round 7 is hardening on top of Round 6 (median 8.4/10). No push or
commit was made; changes are uncommitted in the working tree.

## What changed

- Safety: `TM.Safety.flashes` now rejects unnormalised scenes
  (duration 0.5–60 s, fps in 24/25/30/50/60) before any allocation —
  a raw 600 s scene throws in ~1 ms instead of allocating ~166 MB.
  Rejection, not silent normalisation, was chosen deliberately:
  truncating a loop would measure a different loop. Normalised
  readings are identical to Round 6; the long-loop test passes.
- Export: a failed flash check is now its own gate state — export
  blocked, "Export anyway" switch hidden for unmeasured scenes,
  Retry button as the way out, stale confirmations no longer
  unblock an unknown gate. Measured ≤3/s exports and measured
  over-limit confirmation are unchanged; the no-checker estimate
  path is unchanged (a separate product decision).
- Glitch: `flashes()` estimate now uses Safety-field share, not
  whole-frame ink (glitch-drop ink is 6.56% of the frame but 96%
  of a field). glitch-drop rate 8: estimate 0 → 3 vs measured
  3.5/s; shipped rate 6: estimate 2 vs measured 1/s; render
  output identical. Caveat: 3 is not >3, so an estimate-only
  surface still would not flag rate 8 — Safety remains the
  source of truth.

## Jury scores (median of three judges, per criterion)

| Judge | MC | TQ | PC | CR | EE | UX | PR | EQ | Mean |
|---|---|---|---|---|---|---|---|---|---|
| Art Director | 8.5 | 8.5 | 8.5 | 8.5 | 8.5 | 8.5 | 8.5 | 8.5 | 8.50 |
| Motion Designer | 8.0 | 8.0 | 9.0 | 8.5 | 9.0 | 8.5 | 8.5 | 8.5 | 8.50 |
| Creative Technologist | 8.5 | 7.5 | 8.5 | 8.0 | 8.5 | 8.0 | 8.5 | 8.5 | 8.25 |
| **Median** | **8.5** | **8.0** | **8.5** | **8.5** | **8.5** | **8.5** | **8.5** | **8.5** | **8.4** |

Median overall: 67.5 / 8 = 8.44, reported as **8.4/10 — unchanged
from Round 6**. All three judges verified the Round 7 claims and
held every band: hardening earns its hold, not a rise.

## Timing correction (second round running)

Judges measured 60 s flash checks at 14–43 s in-page in this
sandbox, against ~5 s claimed in the Round 6 safety notes. No
studio debounce/cache landed in Round 7, so the cost caveat is
now stronger: a ~20–40 s check per studio edit is untenable
without debounce/caching.

## Still blocking 9/10

- Real-font verification (all evidence fallback-font only in
  this sandbox) and the uploaded-font iframe/web-component
  embed route.
- Path workflow still display-only: path-key times are fixed
  equal shares, Loop overlaps remain, Frame clamp and Spiral
  floor undecided — product decisions, not measurement problems.
- The trustworthy check is not yet cheap (no debounce/cache,
  cached measurements never revoked) and the export gate is not
  yet a hard block.
- Glitch `clock()` render guard still never engages for fitted
  headlines; safety rests on the lowered template rate.
