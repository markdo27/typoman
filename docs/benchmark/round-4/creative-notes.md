# Round 4 — Creative templates (8 new, 8 → 16 total)

Art-directed starting points, not colour swaps: each new template pairs
different presets, layer interplay, timing and typography. Every layer is
built from an existing preset + one of that preset's looks (verified by
name against `js/presets/`), and every sub-layer is sequenced
`time: { delay, cycles: 2, mode: 'once' }` so its one pass ends before the
loop seam. No template hard-codes a matte word: in `kaleido-window` both
the matte source and the clipped layer carry the headline role, so
`build(id, { text })` replaces both with the user's text.

| Template | Aspect / dur. | For | How it adapts to user text |
|---|---|---|---|
| `youtube-intro` — YouTube Intro | 16:9 / 6 s | Creators opening a video | Assemble headline takes the title; a mono `EP. 01` counter and a `WATCH NOW` kicker are fixed, once-only furniture, never the headline. |
| `hero-sequence` — Website Hero | 16:9 / 8 s | A site hero that must read at a glance | Sequence splits the headline into shots (lines, else words), so one word still gets a shot and a long headline becomes several shots; kicker + scroll cue are once-only. |
| `story-pop` — Story Pop | 9:16 / 5 s | Instagram/TikTok stories | Pop headline is fit-sized for the narrow frame; `NEW` kicker and `LINK IN BIO` cue are once-only and sit clear of the centre headline. |
| `logo-zoom` — Logo Zoom | 1:1 / 4 s | Logo stings, avatars, end cards | Zoom-through scales the wordmark to the frame (its own fit), then an italic tagline arrives once and holds. |
| `lyric-sequence` — Lyric Sequence | 16:9 / 8 s | Lyric videos | Sequence gives each lyric line its own camera shot; a single line is one shot, not a broken morph. The artist credit is once-only, in a light colour over the black frame. |
| `editorial-spotlight` — Editorial Spotlight | 16:9 / 7 s | Editorial quotes, pull quotes | Spotlight is fit-sized and its flicker is turned down (0.1) for flash safety; the attribution arrives once, after the light has swept the quote. |
| `kaleido-window` — Kaleido Window | 16:9 / 6 s | Title cards, posters | The headline (Rise, fit-sized) is the matte; the kaleidoscope inside it is the same headline text, mirrored and clipped, so a new word never leaves the old word showing through. Multi-line headlines join into one kaleido run. |
| `orbit-badge` — Orbit Badge | 1:1 / 6 s | Badges, stickers, social profiles | Orbit rings repeat the word around a circle and hold it upright in the core; multi-line text deals one line per ring. `EST. 2026` sits below the badge, once-only. |

## Known limitations

- The Playwright smoke check (`npm run test:smoke`) could **not** run in
  this environment (the `playwright` package is not installed), so the
  smoke's determinism / flash / user-text checks for these 8 templates
  are **unverified** — see the verification section of the round-4
  report. Syntax, preset/look names, template count and sub-layer timing
  were checked statically instead.
- `orbit-badge` is the weakest on very long text: the orbit core is not
  fit-sized, so a very long single word can crowd the badge. Short
  wordmarks (the badge's intended use) fit; long sentences belong in
  `hero-sequence` or `editorial-spotlight` instead.
- `kaleido-window` with a very long headline still renders, but the
  kaleido pattern gets denser as the run lengthens; keep headlines to a
  word or short phrase for the cleanest window.
- All templates are deterministic and use integer-cycle motion from
  their presets; no template introduces a flash rate above the existing
  presets' behaviour, but the flash check itself awaits the smoke run.
