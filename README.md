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
- **Record stars:** the match holding the event's highest single-alliance score carries a gold ★ just
  left of its `FINAL` chip; the highest autonomous and highest teleop runs get smaller blue and green
  ★s beside it. Ties are all starred, projected matches never are, and seasons that recorded a single
  alliance total without an auto/teleop split don't earn the split stars. Hover a star for the value.
- **Team ranking (left):** the Matches / Ranking switch above the list swaps the schedule for every
  team at the event in official rank order — rank, number and name, OPR total, then the auton/teleop
  split with average ranking points and matches played. Until the event publishes OPR, the OPR column
  carries the team's season OPR at that point in parentheses instead of a dash, and the row's detail
  line labels it `Season OPR`. Teams that are not ranked yet fall in below the ranked ones, best OPR
  first. Clicking a team highlights its matches exactly like the search box, and hovering a row shows
  the same team summary card. On touch screens, where there is no hover, each row carries an ⓘ button
  that opens the summary as a centred sheet with a backdrop — tap it, the ×, or anywhere outside to
  dismiss (Escape works too).
- **Finding an event:** the filter above the event list matches an event code or name. Typing a bare
  team number — `10136` or `#10136` — looks the team up on FTC Scout and narrows the list to the
  events it attended that season, showing the team's name and event count underneath; a number with no
  events falls back to the full list.
- **Event info:** the ⓘ button beside the event picker opens a card with the event type, dates, venue,
  street address, city and time zone, plus shortcuts for directions (Google Maps), the event's FTC
  Scout page, and its own website or livestream when FIRST publishes one. It closes on Escape, an
  outside tap, or when you switch events.
- **Team highlight:** the search box under the event header matches a team by number *or* name
  (exact number, then number prefix, then name/school). Picking a team adds it as a chip, and you can
  keep adding teams — each chip has its own × and the ✕ at the end of the box clears them all. Every
  match containing any highlighted team is highlighted, those teams' numbers turn orange on the cards
  and in the alliance list, and “Only these” narrows the schedule to matches with at least one of them.
- **Click a team to highlight:** in the alliance cards on the right, clicking a team row adds that
  team to the highlights (and clicking it again removes it), so you can build a list straight from
  the match you are looking at without going back to the search box.
- **Team summary on hover:** hovering — or keyboard-focusing — a team in either the schedule or an
  alliance card pops up a small summary beside the row with its event rank, matches played, OPR
  auto/teleop/total, and average ranking points. Two sparklines show how the team's OPR moved: one
  across every event of the season, and one running estimate after each qualification match of the
  current event. The season line starts at the OPR the team finished last season with — drawn
  dashed and hollow so it reads as an anchor, not a result — and an event FTC Scout has no OPR for
  yet still keeps its place on the line, holding the last published value in parentheses (“(24.3)”)
  in the tooltip and legend.
- **Detail (right):** scheduled time and status, the scoreline (real or projected), a Red/Blue win
  probability bar for projections, then per-alliance cards with the auto/teleop/total split and each
  team's OPR contribution, event rank, and surrogate/DQ/no-show flags. Picking another match fades
  the panel into the new one — a background refresh of the same match does not, and visitors who
  prefer reduced motion skip the fade.
- **Robots:** team logos appear beside team numbers in both the schedule and the alliance cards
  (teams without a logo show the FIRST logo as a placeholder), and uploaded robot photos stand in a
  line-up above their alliance card — tucked behind the card like fighters entering the arena, with
  two robots overlapping slightly and a tight drop shadow keeping them visually separate. A team with
  no photo yet stands in as the same kitbot at 30% opacity, so the line-up is always there to be
  filled and a placeholder is never mistaken for the real robot.
- **Auto-refresh:** the gear in the header opens the settings menu, which sets how often the match
  list re-fetches — Off, 10s, 15s, 30s, 1m or 2m (default 30s), remembered in this browser. Refreshes
  run in the background: scores update in place without unmounting the page, resetting your scroll
  position or dropping the selected match, and they are skipped while the tab is hidden. “Refresh now”
  in the same menu forces an immediate update, and **Team assets** at the bottom of the menu opens the
  configuration page.
- **Follow latest result:** the switch under the team search keeps the most recently played match
  open in the detail panel, including as new scores arrive on a refresh. Picking a match by hand
  turns it back off; the setting is remembered.
- **Celebration:** when a played match has a winner, that alliance's card gets a light confetti
  animation — clipped to the card, behind its text, and clear of the robot line-up. It is skipped
  entirely when the visitor prefers reduced motion.
- **URLs** are shareable: `#/2026/USMIWMM4/m/9` is season, event code, and match id, and `#/config`
  opens the asset configuration. The season and event pickers stay in sync with the URL.

### On a phone

Below 720px wide the two columns become one pane at a time, with a **Schedule / Match** switch under
the header: tapping a match in the schedule opens it and switches to the Match pane, and the switch
takes you back. The schedule pane scrolls as a single column, so the event header and team search
scroll away instead of being pinned above a short list.

The event picker collapses into a button in the header showing the current event code and name;
tapping it opens a menu with the season, event filter, and event list, which closes on a selection,
an outside tap, or `Esc`. The gear sits on that same row, so the header stays two lines tall and the
configuration page is reachable from a phone too. Fields grow to 40px tall and 16px text so the
browser does not zoom when one takes focus, and the layout honours the notch and home-bar safe areas.

## Configuration page (`#/config`, “Team assets” in the settings menu)

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
  assets/      first-logo.webp (placeholder logo), kitbot.webp (placeholder robot), robofalcons-icon.jpg
               (favicon source)
  hooks/       useEventList.ts, useEventData.ts, useTeamAssets.ts, useTeamLookup.ts, useSettings.ts
  lib/         projection.ts (OPR math), seasonOpr.ts (season OPR series), model.ts (match views),
               format.ts, events.ts, route.ts, teamSearch.ts (team matching), assets.ts (local asset
               store), image.ts (image handling), settings.ts, backup.ts
  components/  EventPicker, TeamSearch, MatchList, MatchDetail, AllianceCard, ConfigView,
               RefreshSettings, Confetti
  types.ts     shared domain types
public/        favicon.png, apple-touch-icon.png (served from the site root)
.github/
  workflows/   deploy.yml (typecheck + test + build + publish to GitHub Pages)
```

Tests cover the projection math, raw-data normalization (including remote seasons and matches with no
OPR), the season OPR series (last season's anchor and carried-forward values), team search ranking,
image format handling, the local asset store, and picker/route helpers: `npm test`.

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
