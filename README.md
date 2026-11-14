# FTCDash

An FTC event dashboard built on the [FTC Scout API](https://ftcscout.org/api). Pick a season and
event, browse the match schedule on the left and click any match to see either the **recorded
result** or, when the match has not been played (or scored) yet, an **OPR-based projection** with
anticipated auto and teleop scores.

You can also highlight every match a team plays (search by number or name), and upload team logos
and robot photos from the configuration page so they appear in the match view.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build into dist/
npm test         # unit tests (Vitest)
```

No API key or backend is needed: FTC Scout serves GraphQL with CORS enabled, so the browser talks to
it directly.

## How it works

### Data

Everything comes from one GraphQL query per event (`src/api/queries.ts`) against
`https://api.ftcscout.org/graphql`:

- `eventByCode(season, code)` → event metadata, every match with its line-up (alliance, station,
  surrogate/no-show/DQ flags) and published scores, plus each participating team's event stats.
- `eventsSearch(season, limit)` → the event picker list (cached in memory per season).

FTC Scout models scores and stats with **one type per season** (`MatchScores2025`,
`TeamEventStats2026`, …). All of them expose the same fields used here — `autoPoints`, `dcPoints`,
`totalPoints`, `totalPointsNp` — so the query is assembled from a single field list instead of
duplicated hand-written fragments. The 2020/2021 remote seasons are the exception: they store a
single alliance per match and put the score on the root type, which `normalizeScores` handles.

### Real results vs projections

A match shows recorded scores when FTC Scout has published a score for every alliance
(`match.sides.every(side => side.scores !== null)`). Otherwise — upcoming matches, or played matches
whose score has not been posted yet — the dashboard projects:

- **Auto** = Σ `opr.autoPoints` of the teams on that alliance.
- **Teleop** = Σ `opr.dcPoints` (driver-controlled) of those teams.
- **Total** = auto + teleop, which matches `opr.totalPointsNp`; penalty points are excluded.
- Teams without OPR (no matches played yet) count as zero and are called out in the card.
- Negative OPR components (the regression can produce them) are floored at zero.

`OPR` is FTC Scout's least-squares estimate of a team's contribution from this event's matches, so
projections sharpen as the event progresses and can be noisy after only a couple of matches.

### Win probability

Each alliance total is treated as a normal distribution centred on its projection. The spread is
the combined per-team deviation (`dev.totalPointsNp`, falling back to 15% of the projection plus a
floor when a team has no deviation), so closeness and past volatility both move the number. The
probability is clamped to 0.5–99.5% so a lopsided matchup never reads as a certainty.

## Reading the UI

- **Schedule (left):** one card per match, grouped into Qualification / Playoff / Semifinal / Final.
  Each card shows the alliance line-up — team logos with their numbers — and the total, with a
  `FINAL` or `PROJ` chip.
- **Team highlight:** the search box under the event header matches a team by number *or* name
  (exact number, then number prefix, then name/school). Every match that team appears in is
  highlighted, the team's number turns orange on the card and in the alliance list, and “Only these”
  narrows the schedule to just those matches.
- **Detail (right):** scheduled time and status, the scoreline (real or projected), a Red/Blue win
  probability bar for projections, then per-alliance cards with the auto/teleop/total split and each
  team's OPR contribution, event rank, and surrogate/DQ/no-show flags.
- **Robots:** team logos appear beside team numbers in both the schedule and the alliance cards
  (teams without a logo show the FIRST logo as a placeholder), and uploaded robot photos stand in a
  line-up above their alliance card — tucked behind the card like fighters entering the arena, with
  two robots overlapping slightly and a tight drop shadow keeping them visually separate.
- **Auto-refresh:** the gear beside “Team assets” sets how often the match list re-fetches — Off,
  10s, 15s, 30s, 1m or 2m (default 30s), remembered in this browser. Refreshes run in the
  background: scores update in place without unmounting the page, resetting your scroll position or
  dropping the selected match, and they are skipped while the tab is hidden. “Refresh now” in the
  same menu forces an immediate update.
- **Follow latest result:** the switch under the team search keeps the most recently played match
  open in the detail panel, including as new scores arrive on a refresh. Picking a match by hand
  turns it back off; the setting is remembered.
- **Celebration:** when a played match has a winner, that alliance's card gets a light confetti
  animation — clipped to the card, behind its text, and clear of the robot line-up. It is skipped
  entirely when the visitor prefers reduced motion.
- **URLs** are shareable: `#/2026/USMIWMM4/m/9` is season, event code, and match id, and `#/config`
  opens the asset configuration. The season and event pickers stay in sync with the URL.

## Configuration page (`#/config`, “Team assets” button)

- Enter a team number (or search the loaded event by name), then upload a logo and a photo of the
  robot. Any image file your browser can open is accepted — PNG, JPEG, WebP, GIF, BMP, SVG, AVIF…
  Teams outside the loaded event are looked up by number against FTC Scout.
- **Robot photos are per season.** The robot tile has a season picker (defaulting to the current
  season); the image is saved under that season and the match view only shows the image for the
  match's season, so 2025 and 2026 robots can coexist. Chips next to the picker show which seasons
  already have an image. Images uploaded before season support are kept as a fallback for any season
  and are replaced the first time you upload for a specific one.
- Images are decoded, scaled down (192 px for logos, up to 640 px for photos), and re-encoded for
  storage: transparency-capable sources (PNG/WebP/GIF/SVG) stay PNG, opaque formats become JPEG at
  85% quality to keep the footprint small. If the result is still too large the resolution is
  stepped down further.
- Everything is stored locally in this browser under `ftcdash.teamAssets.v1` — nothing is uploaded
  anywhere. “Saved teams” lists what you have added and lets you re-open or remove entries.
- **Backup:** “Download backup” writes every logo and robot photo to `ftcdash-assets-<date>.json`.
  “Merge backup…” adds only what is missing and keeps anything already saved here (it reports how
  many images were added or left untouched); “Replace from backup…” swaps the whole store for the
  file's contents. Files that aren't a valid backup are rejected with a message rather than clearing
  anything.

## Theme

The UI is a neutral gray dark theme with orange (`#ff8a3d`) used for highlights, chips, and primary
actions; alliance colors stay red/blue because they carry meaning, muted to fit the gray palette.

## Project layout

```
src/
  api/         client.ts (fetch wrapper), queries.ts (GraphQL documents), raw.ts (response types),
               normalize.ts (raw -> domain model)
  assets/      first-logo.webp (placeholder logo for teams without one)
  hooks/       useEventList.ts, useEventData.ts, useTeamAssets.ts, useTeamLookup.ts
  lib/         projection.ts (OPR math), model.ts (match views), format.ts, events.ts, route.ts,
               teamSearch.ts (team matching), assets.ts (local asset store), image.ts (image handling)
  components/  EventPicker, TeamSearch, MatchList, MatchDetail, AllianceCard, ConfigView
  types.ts     shared domain types
.github/
  workflows/   deploy.yml (typecheck + test + build + publish to GitHub Pages)
```

Tests cover the projection math, raw-data normalization (including remote seasons and matches with no
OPR), team search ranking, image format handling, the local asset store, and picker/route helpers:
`npm test`.

## Deploying

`npm run build` emits a fully static site in `dist/` — no server, no environment variables, no API
key. FTC Scout's API allows browser calls from any origin, so the build runs anywhere that serves
files. Routing is hash-based (`#/2026/USMISOQ/m/31001`), so deep links work without SPA rewrite
rules: the host only ever serves `index.html`.

| Host | Settings |
| --- | --- |
| Netlify | build `npm run build`, publish directory `dist` |
| Vercel | framework preset “Vite”, output `dist` |
| Cloudflare Pages | build `npm run build`, output `dist` |
| GitHub Pages | see below |
| nginx / S3 + CloudFront | upload `dist`; `index.html` no-cache, `assets/*` immutable |

Hosts that serve the app from a sub-path need `BASE_PATH`, e.g. `BASE_PATH=/FTCDash/ npm run build`
(PowerShell: `$env:BASE_PATH='/FTCDash/'; npm run build`). Root-domain hosts keep the default `/`.

### GitHub Pages

[.github/workflows/deploy.yml](.github/workflows/deploy.yml) typechecks, tests and builds on every
push to `main`, then publishes `dist` through the Pages actions. It works out the base path itself —
`/<repo>/` for a project site, `/` for a `<user>.github.io` repository.

1. Push this folder to a GitHub repository whose default branch is `main`.
2. Repository → Settings → Pages → Build and deployment → Source: **GitHub Actions**.
3. Push, or run the workflow from the Actions tab. The site appears at
   `https://<user>.github.io/<repo>/`.

Uploaded team logos and robot photos stay in each visitor's own browser (`localStorage`), so they are
per-device rather than shared — ship images with the site if everyone should see them.

## Notes and limitations

- Only seasons 2019+ exist in FTC Scout, and the season list stops at the current game year.
- Playoff-level labels reflect FTC Scout's `tournamentLevel` + `series` fields; older events can
  reuse match numbers, so single-alliance (remote-season) matches are labelled with the team number.
- The dashboard reads public data only; nothing is stored or sent anywhere else. Uploaded logos and
  robot photos never leave this browser.
