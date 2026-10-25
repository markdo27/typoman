# TYPOMAN Round 7 — Working Motion Designer judge

Lens: a freelancer shipping a YouTube intro, a website hero, and a 9:16
story. Weights: Path Control, Export & Embed, Studio UX first.
Half points allowed; 9 = near-expert, only rare minor flaws.
This is one judge's score, not the round median. Strict: no inflation.

## Scores

| Motion Craft | Typographic Quality | Path Control | Creative Range | Export & Embed | Studio UX | Performance & Robustness | Engineering Quality | Mean |
|---|---|---|---|---|---|---|---|---|
| 8.0 | 8.0 | 9.0 | 8.5 | 9.0 | 8.5 | 8.5 | 8.5 | **8.5** |

68.0 / 8 = **8.5**, exactly my Round 6 mean (8.5). Round 7 is hardening,
not breadth, and it earns its hold rather than a rise: nothing in it
makes a shipped intro, hero, or story better-looking, and the two
trust improvements it does make are real but narrow (see below).
**Not 9/10.**

## What I verified, not taken on trust

All three Round 7 claims reproduced in this sandbox (Chromium/Playwright,
fallback fonts — see caveat):

1. **flashes() guard — verified.** A raw 600 s scene throws in **1 ms**
   with the bounds error, before any allocation; a 120 fps scene also
   throws. A normalised 4 s glitch-drop scene measures normally
   (240 frames, 1/s). `node tests/flash-long-loop.mjs` still passes:
   60 s 15 Hz strobe 3600 frames, 15/s, fail; 4 Hz control 4/s; red
   strobe 15/s general and red; seam pulse 1/s. The reject-not-normalise
   choice is the right one for a safety tool: silently measuring a
   truncated 60 s of a 600 s loop would be a lie, not a fix.
2. **Glitch estimate — verified, with its known shortfall intact.**
   glitch-drop rate 8: estimate **3** (was 0) vs TM.Safety **3.5/s**;
   shipped rate 6: estimate **2** vs measured **1/s**. Render is
   untouched (measured values match Round 5 exactly). The diagnosis
   checks out: the old 12%-of-whole-frame ink gate was the wrong
   denominator for a Safety field, and the field-share step model is a
   genuine improvement. But 3 is not > 3, and `Studio.flashRisks`
   (inspector.js) flags only rates **above** the limit, so an
   estimate-only surface still would not flag rate 8. Safety remains
   the source of truth; the estimate is a better proxy, not a fix.
3. **Export unknown-measurement gate — verified by code inspection
   plus the suite, not by my own stubbed UI run.** `export-dialog.js`
   now has a distinct unknown gate: "Export blocked: flashes could not
   be checked", the "Export anyway" switch hidden, a Retry button
   shown, and `gateBlocked()` blocking even a stale confirmation.
   `npm run test:studio` here: **74 passed, 3 failed**, the 3 failures
   being only the sandbox Google Fonts console errors (see caveat);
   the export section passes, including the measured over-limit
   confirmation path, so that path survived the change.

`node --check` passes on all three changed files. My temporary
verification scripts were run from the repo root and deleted; no code
was edited by this judge.

## Why no score moved

- **EE held at 9.0, not raised:** the unknown-measurement block is the
  correct fail-closed behaviour for a shipping freelancer, but the
  measured over-limit path is still confirm-to-export, and the
  no-checker branch still exports on estimates alone. That last branch
  is the same open product decision as Round 6.
- **PR held at 8.5, not raised:** the guard closes a real failure mode
  (166 MB allocation), but the trustworthy check is still not a cheap
  check — my long-loop run measured **18–43 s in-page per 60 s case**,
  confirming the Round 6 judges' 17–40 s and contradicting the ~5 s
  figure in the safety notes. No studio debounce/cache landed.
- **UX held at 8.5:** the Retry button is a small, good addition to the
  export dialog, but there is no other studio improvement in this round.
- **MC, TQ, PC, CR unchanged:** no preset, template, path, or type work
  in Round 7, so my Round 6 scores for those bands stand untouched.

## Caveats

- **Sandbox font limit, not scored as a product bug:** Google Fonts
  fail here (0/60, `ERR_TUNNEL_CONNECTION_FAILED`), so all type and
  flash evidence is fallback-font only. The glitch numbers in
  particular should be re-checked on real faces before the estimate is
  trusted for gating.
- Studio editor not hand-tested by this judge and no keyboard/
  accessibility audit run, as in Rounds 4–6.
- Cached safe measurements are still honoured after a later transient
  check failure (reported, not patched, in the safety notes).

## Top 3 gaps blocking 9/10

1. **Font-dependent verification still outstanding, plus no
   uploaded-font iframe/web-component embed route** — a 9 cannot rest
   on fallback-font readings, and a brand font still cannot ship in an
   iframe hero (only via the self-contained HTML file).
2. **Path workflow still display-only, and Loop still overlaps** —
   path-key times are fixed equal shares with no editable timeline
   diamonds; Loop I–N/N–M remain; the Frame horizontal-guard decision
   (scalar vs per-glyph, which paths, minimum gap) is still undecided.
3. **The trustworthy check is not yet a cheap check, and the gate is
   not yet a hard block** — ~20–40 s per 60 s check in this sandbox
   with no debounced/cached studio home, unnormalised scenes now
   rejected but malformed sizes still failing downstream, heavy exports
   still freeze with slow Cancel, the export gate still defaults to
   proceeding on a "Couldn't check" warning when there is no checker at
   all, and the glitch estimate (3) still sits below the >3/s flag
   threshold for the rate-8 case.
