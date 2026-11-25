# FTCDash

An FTC event dashboard built on the [FTC Scout API](https://ftcscout.org/api). Pick a season and
event, browse the match schedule on the left and click any match to see either the **recorded
result** or, when the match has not been played (or scored) yet, an **OPR-based projection** with
anticipated auto and teleop scores.

You can also highlight every match a team plays (search by number or name), and upload team logos
and robot photos from the configuration page so they appear in the match view.

## Quick start

Double-click **`start.cmd`**: it finds Node.js, installs the dependencies the first time, starts the
dev server and opens the app at http://localhost:5173. Extra arguments are passed to Vite, so
`start.cmd --host` serves the app to other devices on your network (handy for checking it on a
phone).

Or by hand:

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build into dist/
npm run package  # build for a host and zip dist/ as ftcdash-site.zip
npm test         # unit tests (Vitest)
```

No API key or backend is needed: FTC Scout serves GraphQL with CORS enabled, so the browser talks to
it directly.

If Node.js is not installed, `start.cmd` falls back to a portable copy in `.node\` (git-ignored);
delete that folder once `node --version` works in a terminal.

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
- A team with no OPR from this event yet stands on its most recent OPR from the season — the last
  event that published one, or where the team ended last season when this season has none — shown in
  parentheses so it never reads as earned here.
- Teams with nothing published anywhere count as zero and are called out in the card.
- Negative OPR components (the regression can produce them) are floored at zero.

`OPR` is FTC Scout's least-squares estimate of a team's contribution from this event's matches, so
projections sharpen as the event progresses and can be noisy after only a couple of matches.

### Win probability

Each alliance total is treated as a normal distribution centred on its projection. The spread is
the combined per-team deviation (`dev.totalPointsNp`, falling back to 15% of the projection plus a
floor when a team has no deviation), so closeness and past volatility both move the number. The
probability is clamped to 0.5–99.5% so a lopsided matchup never reads as a certainty.

## Reading the UI

- **Landing page (`#/`):** the bare site URL opens a picker rather than auto-selecting an event: a
  season switch, a search box that takes an event code, part of an event name or a bare team number,
  and three lists — **Happening now**, **Upcoming** and **Recently finished**, six rows each with a
  "Show all" switch for the whole season. The button under the intro jumps straight to the live event,
  or to the latest one with results. Every row is a real link (`#/2026/USCITEQ`), so it can be opened
  in a new tab. The wordmark in the header returns here from anywhere.
- **Schedule (left):** one card per match, grouped into Qualification / Playoff / Semifinal / Final.
  Each card shows the alliance line-up — team logos with their numbers — and the total, with a
  `FINAL` or `PROJ` chip.
- **Record stars:** the match holding the event's highest single-alliance score carries a gold ★ just
  left of its `FINAL` chip; the highest autonomous and highest teleop runs get smaller blue and green
  ★s beside it. Ties are all starred, projected matches never are, and seasons that recorded a single
  alliance total without an auto/teleop split don't earn the split stars. Hover a star for the value.
- **Team ranking (left):** the Matches / Ranking / Predict switch above the list swaps the schedule
  for every team at the event, with a **Rank / OPR** control at the top of the list choosing the
  order: the official table, or strongest OPR first (the left column becomes the OPR position and the
  official rank moves into the detail line). Those OPR positions are numbered across the whole event,
  so filtering teams out never renumbers the ones left. Rows carry rank, number and name, OPR total,
  then the auton/teleop split with ranking points and matches played. Until the event publishes OPR,
  the OPR column carries the team's season OPR at that point in parentheses instead of a dash, and the
  row's detail line labels it `Season OPR`. Teams that are not ranked yet fall in below the ranked
  ones, best OPR first. Clicking a team opens its page in the detail panel; hovering a row shows the
  same team summary card. On touch screens, where there is no hover, each row carries an ⓘ button
  that opens the summary as a centred sheet with a backdrop — tap it, the ×, or anywhere outside to
  dismiss (Escape works too).
- **Predict (left):** predicts the final qualification ranking. Each team keeps the ranking points it
  has banked and gains the points its remaining matches are expected to produce — two for a win, plus
  its own observed bonus-point rate, weighted by each match's projected win probability — so the list
  shows the projected total, the team's place now, and how far it moves (▲/▼). The switch at the top
  swaps it for **schedule difficulty**, which ranks teams by the projected OPR of the alliances they
  still have to face, hardest first. Each difficulty row shows the OPR of the partner it draws and the
  margin between its own OPR and the opposition's (`+` green, `−` red); teams whose qualification
  matches are all scored drop to the bottom with dashes. Playoff matches and the 2020/2021
  single-alliance seasons are left out, since neither decided a qualification rank on head-to-head
  results.
- **Alliance selection (Ranking tab):** the **Draft** button beside Rank / OPR turns the ranking into
  a selection board. Clicking a team crosses it off — struck through and dimmed — and sinks it to the
  bottom, so the top of the list is always the strongest team still available in whichever order you
  picked. A line above the list counts what is left (`18 of 23 left`), **Reset** clears the board and
  clicking a crossed-off team puts it back. Crossings are remembered per event in this browser, so a
  reload mid-selection keeps them; the board itself only shows while Draft is on, and with Draft off
  clicking a row opens that team's page.
- **Team page (right):** clicking any team in the ranking or the prediction swaps the detail panel for
  a synopsis of that team: logo, number and name, school, then its event rank, win–loss record,
  ranking points and OPR split, beside the robot photo (or the kitbot placeholder). Below that are the
  same two sparklines as the hover card — the whole season against its previous-season anchor, and the
  running estimate through this event — then every award the team won this season with its placement
  and event, and finally each of its matches here with a W/L mark, partner and opposition, score, and a
  click through to the match itself. **Back** (or the browser's back button, since the team is in the
  URL) returns to the panel you came from, and **+ Highlight** beside it adds the team to the
  highlight list the search box builds (it reads **✓ Highlighted** once it is in, and clicking again
  removes it). **✎ Edit** opens the same logo and robot uploader the configuration page offers, right
  on the team: upload or replace either image, or remove one, and the page, the schedule cards and the
  alliance line-ups all pick it up — the robot photo is saved against the event's season. Images stay
  in this browser only.
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
  match containing any highlighted team is highlighted, and those teams' numbers turn orange on the
  cards and in the alliance list. The small **filter button beside the chips** narrows the schedule,
  the ranking and the prediction to just those teams — the tab counts follow the filter, those lists
  drop the orange accent since everything left is highlighted (the match view keeps it), and with
  nothing highlighted it leaves every list complete.
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
- **Settings:** the gear in the header opens the settings menu, which is remembered in this browser.
  - **Match list refresh** sets how often the match list re-fetches — Off, 10s, 15s, 30s, 1m or 2m
    (default 30s). Refreshes run in the background: scores update in place without unmounting the
    page, resetting your scroll position or dropping the selected match, and they are skipped while
    the tab is hidden. “Refresh now” forces an immediate update.
  - **Follow latest result** keeps the most recently played match open in the detail panel, including
    as new scores arrive on a refresh. Picking a match by hand turns it back off.
  - **Auto-scroll** picks which of the left column's lists take part — Matches, Ranking and Predict,
    any combination. A chosen list scrolls itself at **Speed** (Slow 20 px/s, Medium 40, Fast 80),
    then hands over to the next one in the order above and starts again from the top, so an
    unattended screen works through the whole event. A list with nothing to scroll — which is what
    the highlight filter usually leaves — is simply held on screen instead, for 9s at Slow, 6s at
    Medium and 3.5s at Fast. Resting the pointer on the list, turning a wheel or grabbing it hands
    control back — the list waits while you read and picks up again a couple of seconds after you
    leave. Nothing selected leaves the lists still. Cards passing under the tabs fade out rather than
    meeting a hard edge.
  - **Team assets** at the bottom of the menu opens the configuration page.
- **Celebration:** when a played match has a winner, that alliance's card gets a light confetti
  animation — clipped to the card, behind its text, and clear of the robot line-up. It is skipped
  entirely when the visitor prefers reduced motion.
- **URLs** are shareable: `#/` is the landing page, `#/2026/USMIWMM4/m/9` is season, event code and
  match id, `#/2026/USMIWMM4/t/10136` opens a team page, and `#/config` opens the asset configuration.
  The season and event pickers stay in sync with the URL.
- **Back link:** a host page can pass `?back=<url>` (before the `#`) and a back button appears at the
  right of the header, beside the settings gear, pointing there — so the dashboard reads as part of the
  larger site. See [Adding a link back to your own site](#adding-a-link-back-to-your-own-site-back) for
  the exact URL to build.

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

## Adding a link back to your own site (`?back=`)

When another site links here — a team homepage, the robot lab, an event page — add a `back` parameter
and the header grows a button at the right that returns to that page, so the dashboard reads as part of
the larger site. Nothing changes when the parameter is absent.

The whole URL has two halves: **the query** (`?…`, read by the app) and **the hash** (`#/…`, the route
inside the dashboard). The `back` parameter must live in the query, before the `#`:

```html
<a href="https://focusbrian.github.io/ftcDash/?back=https%3A%2F%2Fexample.com%2Frobot-lab.html&amp;backLabel=Robot%20Lab#/2026/USMISOQ/m/4">
  Open in FTC Dash
</a>
```

| Part | Meaning |
| --- | --- |
| `back=` | Absolute URL of the page to return to, URL-encoded (see below). Required. |
| `backLabel=` | Optional caption on the button (“Robot Lab” above). Defaults to `Back`, capped at 40 characters; longer text is cut, and the button ellipsises if the header runs out of room. |
| `#/2026/USMISOQ/m/4` | Optional destination: `#/` landing page, `#/2026/USMISOQ` an event, `#/2026/USMISOQ/m/4` a match, `#/2026/USMISOQ/t/10136` a team page, `#/config` team assets, `#/admin` the shared asset editor, `#/auto` the autonomous planner (or `#/2026/USMISOQ/auto` for the planner opened from that event, whose Back button then returns there). |

### Encoding it correctly

Encode the `back` value as a single component — `encodeURIComponent` in JavaScript, or any URL encoder.
Anything left unencoded that has meaning in a URL will break the link:

- `&` inside the target starts a new parameter (`?back=https://x.com/?a=1&b=2` loses `b=2`).
- `#` inside the target ends the query, so the dashboard route disappears. This matters if the page you
  return to has its own fragment: use `%23`.

```js
// Build the link in the host page rather than hand-encoding it.
const back = new URL('https://example.com/robot-lab.html#specs').href; // keeps its own # as %23
const params = new URLSearchParams({ back, backLabel: 'Robot Lab' });
const link = `https://focusbrian.github.io/ftcDash/?${params}#/2026/USMISOQ/m/4`;
// → https://focusbrian.github.io/ftcDash/?back=https%3A%2F%2Fexample.com%2Frobot-lab.html%23specs&backLabel=Robot+Lab#/2026/USMISOQ/m/4
```

`URLSearchParams` encodes the value for you (`+` and `%20` both decode as a space), which is why the
label above reads `Robot+Lab` instead of `Robot%20Lab` — both are fine.

**`&amp;` is only for HTML.** Inside an `href="…"` attribute the separator must be written `&amp;` (as
above) or the markup is invalid; everywhere else — pasting into the address bar, a Markdown link, a
`fetch()`, a chat message — use a plain `&`. Writing `&amp;` in the address bar sends a parameter
literally named `amp;backLabel`, which is why the button can fall back to “Back”. The app tolerates both
now, but the plain `&` is the correct form:

```
https://ftcdash.com/?back=https://example.com/lab&backLabel=Robot%20Lab#/2026/USMIWAQ
```

### Rules worth knowing

- **Only `http`/`https` targets are accepted.** A `javascript:`, `data:` or `mailto:` value is ignored
  and no button is drawn — a query string must never be able to smuggle a script into the page.
- **Relative targets are resolved against the dashboard's own URL**, so `?back=../index.html` works when
  both pages sit on the same host. Absolute URLs are clearer, and are the only option when the two sites
  are on different domains (GitHub Pages here, InMotion there, for example).
- **The button survives navigation inside the dashboard.** It is read once at load from the query, and
  changing match, event or team only rewrites the hash, so `?back=…` stays in the address bar. Sharing
  that URL afterwards keeps the return path with it.
- **Serving from a sub-folder changes only the path**, not this scheme:
  `https://example.com/ftcdash/?back=https%3A%2F%2Fexample.com%2F&backLabel=Home#/2026/USMISOQ`.
- **A visitor's own setting can override the landing match.** If they turned on “Follow latest result”,
  the dashboard opens the newest played match instead of the one in the link — respect their choice, or
  link to the event (`#/2026/USMISOQ`) and let them pick.
- **Quick check:** open your link, confirm the button appears top-right next to the gear, and hover it —
  the tooltip shows the decoded URL it will go to.

## Configuration page (`#/config`, “Team assets” in the settings menu)

- Enter a team number (or search the loaded event by name), then upload a logo and a photo of the
  robot. Any image file your browser can open is accepted — PNG, JPEG, WebP, GIF, BMP, SVG, AVIF…
  Teams outside the loaded event are looked up by number against FTC Scout.
- **Robot photos are per season.** The robot tile has a season picker (defaulting to the current
  season); the image is saved under that season and the match view only shows the image for the
  match's season, so 2025 and 2026 robots can coexist. Chips next to the picker show which seasons
  already have an image. Images uploaded before season support are kept as a fallback for any season
  and are replaced the first time you upload for a specific one.
- Images are decoded, scaled to fit a 48 × 48 box for logos and 200 × 200 for robot photos (aspect
  ratio kept, never upscaled), and re-encoded for storage: transparency-capable sources
  (PNG/WebP/GIF/SVG) stay PNG, opaque formats become JPEG at 85% quality to keep the footprint small.
  If the result is still too large the box is stepped down further, and images saved before these
  limits existed are shrunk in place the next time the app loads.
- Everything is stored locally in this browser under `ftcdash.teamAssets.v1` — nothing is uploaded
  anywhere. “Saved teams” lists what you have added and lets you re-open or remove entries; teams the
  site ships with are listed too, tagged `shared` (and cannot be removed here — upload your own image
  to override one, or edit the library itself).
- **Backup:** “Download backup” writes every logo and robot photo to `ftcdash-assets-<date>.json`.
  “Merge backup…” adds only what is missing and keeps anything already saved here (it reports how
  many images were added or left untouched); “Replace from backup…” swaps the whole store for the
  file's contents. Files that aren't a valid backup are rejected with a message rather than clearing
  anything.

## Shared asset library (`public/shared-assets.json`)

Logos and robot photos can ship with the site, so every visitor sees them with nothing to upload.
They live in `public/shared-assets.json`, in the same envelope as a backup:

```json
{ "app": "ftcdash", "version": 1, "exportedAt": "…", "teams": { "10136": { "logo": "data:image/png;base64,…" } } }
```

The app fetches that file once per page load and layers it under whatever is saved in the browser,
asset by asset: a team's logo can come from the file while its robot photo comes from the visitor.
Uploading or removing in the configuration page only ever writes the browser's own copy, so the
shipped set is never lost.

### The admin page (`#/admin`)

The editor for that file is deliberately unlinked: open `/#/admin` and enter the admin key
(`frost10136`, defined as `ADMIN_KEY` in `src/components/AdminView.tsx`). It is a curtain, not a lock —
the key ships in the bundle, and the page can only produce a file for you to commit, so it never
changes the live site by itself.

- Type a team number, upload a logo and/or a robot photo (per season, exactly like the configuration
  page), and the page shows how many teams and images the file would contain.
- Edits are held in this browser as a draft (`ftcdash.sharedDraft.v1`) so a long session survives a
  reload; **Discard draft** goes back to the published file.
- **Download shared-assets.json** saves the draft. Replace `public/shared-assets.json` with it, commit
  and deploy — the next visitor load picks it up (the fetch bypasses the HTTP cache).
- **Load file…** seeds the draft from an existing library, which is also how you can merge two people's
  work: load one file, then re-upload the images the other has.

Images are scaled the same way as a browser upload (48 × 48 logos, 200 × 200 robots), so a photo costs
roughly 5–20 KB of the JSON; a few hundred teams stay comfortably under a megabyte.

### The autonomous planner (`#/auto`)

Reach it from **Auto planner** in the dashboard toolbar, or the button on the home page (the route is
`#/auto`, or `#/<season>/<event>/auto` when it was opened from an event, so **Back** returns to that
event; either form can be bookmarked or linked). It lays out a 30-second auto on the current season's
field — BIOBUZZ (2026–27) — and is a planning aid, not a simulator: it moves each robot along straight
segments at a constant speed and reports only what that model can prove. The page sizes the field off
the window height, so on a 1080-high screen the whole map, playback bar and scoreboard clear the fold
with the nav on top; the waypoint timetable and the Plan card sit below and scroll.

- **Four robots**, two per alliance: the red cards sit to the left of the map and the blue cards to
  the right, so the page reads like the field. Each slot has its own team number, speed, shot cycle
  and program; the alliance comes from the slot, so a hand-edited file cannot put a blue robot in a
  red column. Click the field to drop a waypoint on the selected robot, drag a handle to move one,
  right-click (or double-click) to delete it, and use **Undo** to step back a whole gesture. **Start
  pose** snaps the first waypoint to one of the two legal starting positions for that alliance, and
  the dashed squares on the map show all four.
- **Team number.** Type it on the robot card and the page looks the name up in FTC Scout and puts the
  team's logo — from the shipped library or your own uploads — in a disc inside the robot's footprint
  on the map. The disc keeps a square or wide logo from spilling over the robot outline, and a team
  with no logo gets the first letter of its name instead, so no two robots look alike.
- **The waypoint list** under the map is the program, one row per stop: when it **arrives**, how long
  it **waits** before the first artifact, how many **balls** it launches from there, how long it
  **holds after** the last one, and when it therefore **leaves**. Shoot cycles are per robot
  (`Cycle`), so a slow launcher takes proportionally longer per artifact. A waypoint can hold at most
  four artifacts — one CELL's worth — so **max** on the balls cell loads all four, and the − / + pairs
  move the waits in 0.25 s and the balls by one.
- **Facing is per waypoint.** Each stop has its own heading in degrees (0 faces across the field
  towards blue, 90 faces the rear wall); the robot turns to it while driving the leg in, so a plan can
  pull in sideways and still aim the launcher. New waypoints default to facing the direction they were
  driven from, and it is set on the map rather than in the table.
- **Tap a waypoint to stand the robot on it.** A press that does not travel is a tap, not a drag: it
  selects that robot and puts the clock at the moment the robot arrives there, paused, so the pose,
  the raised CELL and the timetable row all show that instant. A press only becomes a move once the
  pointer travels a few pixels, so a tap never nudges the waypoint and never adds an undo step.
- **Drag the robot itself.** Wherever the clock has the robot standing on a waypoint, its footprint is
  a grab handle: drag it to move that waypoint, which is quicker than hunting for the small dot
  underneath. Mid-leg the robot is not a handle, so a stray drag cannot rewrite the path.
- **Turn the pose with the grip.** The selected robot carries a grip out along its heading, past the
  footprint. Drag it around the robot to set that waypoint's facing (snapped to the **Snap poses**
  step in the Plan card — 1°, 5°, 15°, 45° or off). One undo step covers the whole turn, and the grip
  is where the angle is set: the table shows the timings, the map shows the pose.
- **Timing.** Arrival times are worked out from the distance and the robot's speed. Editing one adds
  the difference to the wait *before* that row, so the timetable always stays consistent and a
  waypoint can never be timed sooner than driving there allows; the first row always starts at 0.00 s.
  A stop's clock is arrival → wait → one shot cycle per ball → wait after shooting → drive on, so the
  hold after the shots is real time the robot cannot spend driving.
  Clicking a row's number jumps playback to that moment, as does tapping the waypoint on the map, and
  the row the robot is at or driving towards is highlighted.
- **The HIVE tips.** Every artifact goes into whichever CELL of the alliance's HIVE is raised. Four
  artifacts tip the first CELL, eight tip each fresh one after that, so a TIP swaps which side is up
  and later artifacts have to be aimed at the other CELL. The map marks the raised CELL with its load
  (`2/8`) and dims the other one, flashes on a tip, and the Plan card lists each alliance's tip times.
  A burst that keeps firing through a tip is flagged: those artifacts would reach a CELL that is still
  swinging.
- **Playback** runs the timetable with a scrub bar, ¼× to 2× speed, and Space to play or pause. Balls
  in flight, the part of the path already driven, and robot headings all follow the clock.
- **Warnings** cover the arithmetic the model can settle: no waypoints, a lone waypoint that does
  nothing, a program that runs past the end of AUTO, and the first moment any two robots' 18 in.
  footprints overlap (it names the pair).
- **The score.** A scoreboard under the playback bar totals AUTO points for each alliance: LEAVE (3)
  per robot that finishes at least a robot's width from its first waypoint, PARK (5) per robot that
  finishes with any part of its 18 in. footprint inside its own LOADING ZONE — the taped strip against
  its side wall, marked `loading zone (park)` in the legend, and "any part" is checked on a grid of
  points across the chassis so an angled robot that catches the zone with a corner still counts — and
  TIP (20) each. Each robot card carries its own leave/park tick and total. The big number is the
  running score: points bank as the clock reaches them (a TIP when the CELL tips, LEAVE when a robot
  gets clear of its first waypoint, PARK when it comes to rest in the zone), so scrubbing or playing
  the auto counts the board up, and the small `final` figure beside it is where the plan ends.
  LEAVE is a planning proxy; PARK follows the LOADING ZONE rule the field setup uses (manual 10.5.4,
  as modelled by the BIOBUZZ simulator). Neither is a rules engine — treat them as a planning check,
  not an official score.
- **3D playback.** **3D view** in the playback bar opens the plan on the field in three.js — the same
  timetable, the same clock — with the four robots standing in for real: a boxy 18 in. mecanum robot
  tinted red or blue for its alliance, carrying a circular badge overhead with its team's logo, or the
  team's initial when it has none. The field is the team's BIOBUZZ CAD (`public/models/auton-field.glb`,
  a 7 MB meshopt GLB exported from Robot Lab), so the HIVE, its CELLs, the FLOWERS and the walls are the
  real geometry; the plan's LOADING ZONEs, GARDENs and starting squares are drawn over it, and anything
  the export carries outside the walls is clipped away. A hand-built stand-in field shows immediately
  and stays if the model cannot load. Drag to orbit, scroll to zoom, **Field**/**Top** reset the camera,
  and the overlay's own Play, scrub and rate drive the same clock as the map, so closing it leaves the
  plan where you stopped. A running scoreboard floats over the field — the same live score as the map,
  counting red and blue up as the clock reaches each point, with the plan's final figure beside it.
  Artifacts are animated: each launch lobs a pollen sphere out of the robot's shooter in a high arc
  into the mouth of the raised CELL of its alliance's HIVE, and a HIVE swings its CELLs 60° about the
  pivot bar whenever `simulateCells` says one tips, so the playback shows the TIP as well as the score.
  The CAD rigs only the blue HIVE, so the red one is rebuilt as a half-turn copy of it (recoloured,
  with the baked red CELL meshes hidden) — which is exactly how the two hives sit on the real field.
  The scene module is imported lazily, so three.js is only downloaded when the button is first pressed.
- **Snap** rounds new waypoints to 1, 6 or 12 in., and **Snap poses** rounds the facing the turn grip
  sets to 1°, 5°, 15° or 45° (or leaves it alone). Both settings travel with the plan. The plan saves
  in this browser as you edit (`ftcdash.autoPlan.v3`), and **Export JSON** moves the whole four-robot
  plan between machines — it opens a picker first, so any saved autons can ride along in the same
  file. **Import…** reads such a file and puts its bundled autons back on the shelf, keeping whichever
  copy of a name was saved later.
- **A shelf of single-robot autons.** Each robot card has **Save auton…**, which asks for a name and
  keeps that one program in this browser (`ftcdash.autons.v1`), and **Load auton…**, which lists what
  is saved — name, the column it came from, stops, balls and when it was saved — so any of them can be
  dropped onto any robot. Saving under a name that already exists replaces it; the × beside an entry
  deletes it. A saved auton remembers the slot it was written for, but loading it into another column
  keeps the program and takes that column's alliance. No files are downloaded or picked for a single
  robot; the shelf holds the last 24.

Field geometry (141.2 in. inside the perimeter, the shared HIVE frame with one tilting CELL per
alliance, four FLOWERS, the LOADING ZONEs and GARDENs, and the starting poses) lives in
`src/lib/autoplan.ts`, next to the tip thresholds and the `POINTS` / `LEAVE_DISTANCE` / `PARK_RADIUS`
values the scoreboard uses; the key is versioned so a plan laid out for last season's field never
loads onto this one.

### On a PHP host (`/admin/`)

A cPanel/InMotion deployment has a better option: **`https://your-site/admin/`** stores the images as
real files in `media/` and records them in the same `shared-assets.json`, so nothing has to be
downloaded, edited and re-uploaded. PHP runs on the server, not on your machine — building and
deploying are unchanged.

1. Upload the site (see [cPanel / InMotion shared hosting](#cpanel--inmotion-shared-hosting)).
2. Open `/admin/` and choose a password — the page has none until then, and **the first visitor to set
   one owns the library**, so do this right after deploying. If you would rather not race that, put
   cPanel → Directory Privacy on `public_html/admin` until you have.
3. Find the team: type `10136` **or start typing its name** (`Frost Robo…`). Suggestions come from FTC
   Scout and show the school too; picking one fills in the number. A bare number is looked up and shown
   underneath, so you can see you have the right team before uploading.
4. Drag a logo onto the **Team logo** card, a robot photo onto the **Robot photo** card, or drop both
   anywhere in the upload area. Two files arriving together are split by name (`…logo…`, `…robot…`)
   and otherwise fill the empty cards in order; a single file lands on the card it was dropped on.
   Each card keeps its own file picker for a click-only workflow. The robot card carries a **season**
   picker labelled with the game (`2026–27`, `2025–26 · Decode`, …); *Every season* writes the older
   season-less entry, used only when a team has no photo for the match's season.
5. Press **Upload** once: it sends whichever cards are filled, so a logo and a robot photo go up
   together in one request.

How it behaves:

- Uploads are decoded and re-encoded through GD (which strips anything hidden in the file), scaled to
  fit 128 px for logos and 480 px for robots, then written as `media/<team>-<kind>[-<season>]-<random>.png`
  or `.jpg`. PNG/JPEG/WebP/GIF are accepted; SVG is refused (it can carry script).
- The JSON keeps only the path (`media/10136-logo-c13f864b.png`), so the manifest stays tiny and the
  browser caches each image forever — replacing an image writes a new file and deletes the old one.
- The dashboard needs no special configuration: it already fetches `shared-assets.json` and layers it
  under the browser's own uploads. A visitor's own logo still wins over the server's.
- **Uploads appear on the next page load.** The dashboard asks for the manifest as
  `shared-assets.json?v=<timestamp>` because a host proxy in front of Apache (InMotion serves sites
  through nginx) keeps handing back the copy it cached, ignoring the file's `no-cache` header — a
  fresh URL is the only reliable way to see the current library.
- **If a change does not appear after a deploy,** the host is serving a cached `index.html`, so the
  browser runs the previous build (and that build asks for the old manifest). Test it by opening
  `https://your-site/?v=2` — a query string bypasses the cached entry. Then either purge the cache in
  cPanel or ask InMotion support to purge the nginx cache for the domain; `.htaccess` already sends
  `no-store` and `X-Accel-Expires: 0` so new responses should not be stored. As a safety net,
  `scripts/package.mjs` ships the current bundle under the previous bundle names listed in
  `LEGACY_BUNDLES`, so a visitor on a stale page still runs the current code — remove those entries
  once the cache has been purged.
- **Redeploys are safe.** `package-site.cmd` leaves `shared-assets.json` out of the zip (the PHP page
  owns it on the server), and extracting a new build never deletes `media/` or `admin/data/`. Pass
  `--with-assets` if you do want the committed copy shipped.
- **The library survives a deploy that replaces the manifest.** The page also keeps its own copy in
  `admin/data/library.json` — a file no build ships — and republishes `shared-assets.json` from it
  whenever the manifest has lost images, saying how many it put back. That covers the usual accident:
  copying `dist/` to the host by hand, where `shared-assets.json` is the repo's empty seed (the zip
  never carries it, and `package.mjs` refuses to hand over an archive that does). Static hosts still
  need that file in `dist/`, so the guard lives on the server side.
- **Orphaned images can be re-adopted.** Anything in `media/` the manifest no longer lists appears
  under *Unlisted images* with a **Restore** button; it re-adds those files (newest wins per slot) and
  leaves filled slots alone. That also rebuilds a library lost before this bookkeeping existed.
- **Security:** the password is stored as a `password_hash` in `admin/data/config.php`, which
  `admin/data/.htaccess` denies to the web; sessions are `HttpOnly`/`SameSite=Strict`, every form carries
  a CSRF token, five bad passwords lock sign-in for 30 seconds, and `media/.htaccess` turns off script
  execution so an upload can never run. Delete `admin/data/config.php` to re-run the password setup.
- **If uploads fail,** the page names the folders it cannot write. In cPanel → File Manager →
  Permissions, set `public_html/media` (and `public_html/admin/data`) to 755, or 775 on locked-down
  plans. Uploads are also capped at 8 MB by the page and by `upload_max_filesize`.

GitHub Pages cannot run PHP, so the workflow deletes `dist/admin` and `dist/media` before publishing —
use the `#/admin` JSON workflow above there.

## Theme

The UI follows the FROST 10136 workspace: a near-black background with a green cast (`#101212`),
`#191e1b` cards, 1px `#303934` rules, and one pure orange (`#ff6200`) for highlights, chips, and
primary actions. Cards carry a soft radial wash falling from their top edge.

Headings use the display face — the wordmark, match titles, alliance headers and page titles — while
navigation, field labels, chips and body copy stay in Inter, because the display face is too wide to
read at small sizes. Cards sit on 12px corners; chips and buttons stay sharp at 4–5px. Alliance
colors stay red/blue because they carry meaning, muted to fit the palette.

The display face is [Trinos Solid](https://arterfakproject.com/) by Arterfak Project, bundled from
`src/assets/fonts/trinos-solid.ttf` (single weight, so display text never asks for a faux bold). It
is a commercial typeface — hosting it here assumes the team's license covers this site. Delete the
file and the `--display` stack falls back to Barlow Condensed from Google Fonts.

## Project layout

```
src/
  api/         client.ts (fetch wrapper), queries.ts (GraphQL documents), raw.ts (response types),
               normalize.ts (raw -> domain model)
  assets/      first-logo.webp (placeholder logo), kitbot.webp (placeholder robot), robofalcons-icon.jpg
               (favicon source), fonts/trinos-solid.ttf (display face)
  hooks/       useEventList.ts, useEventData.ts, useTeamAssets.ts, useSharedAssets.ts, useTeamLookup.ts,
               useSettings.ts, useAutoScroll.ts, useSeasonOprFallback.ts, useTeamOprHistory.ts,
               useTeamAwards.ts
  lib/         projection.ts (OPR math), seasonOpr.ts (season OPR series), oprSeries.ts (sparkline
               series and OPR colours), predict.ts (predicted ranking and schedule difficulty),
               selection.ts (alliance-selection board), awards.ts (team award labels and ordering),
               model.ts (match views), format.ts, events.ts, route.ts, teamSearch.ts (team matching),
               assets.ts (local asset store), image.ts (image handling), settings.ts, backup.ts
  components/  EventPicker, TeamSearch, MatchList, MatchDetail, AllianceCard, TeamList,
               PredictRanking, TeamPage, HomePage, ConfigView, AdminView, SettingsMenu, Confetti
  types.ts     shared domain types
public/        favicon.png, apple-touch-icon.png (served from the site root), shared-assets.json (the
               committed logo and robot library, used by static hosts), .htaccess (Apache caching and
               compression, copied into dist/ for cPanel hosts)
  admin/       index.php + lib.php — the PHP asset library (uploads, key gate); data/ holds the
               password hash and the library's own copy of the manifest at runtime, denied to the web
  media/       uploaded logos and robot photos, written by admin/ at runtime (git-ignored)
start.cmd      Windows launcher: finds Node, installs dependencies, opens the app
package-site.cmd  Windows packager: builds for a base path and writes ftcdash-site.zip for cPanel
scripts/       package.mjs (the packager; run it with `npm run package`)
.github/
  workflows/   deploy.yml (typecheck + test + build + publish to GitHub Pages)
```

Tests cover the projection math, raw-data normalization (including remote seasons and matches with no
OPR), the season OPR series (last season's anchor and carried-forward values), the predicted ranking
and schedule difficulty, team award labels and ordering, team search ranking, image format handling,
the local asset store, and picker/route helpers: `npm test`.

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
| cPanel / Apache shared hosting (InMotion, HostGator, …) | run `package-site.cmd`, upload the zip, then use `/admin/` — see below |
| nginx / S3 + CloudFront | upload `dist`; `index.html` no-cache, `assets/*` immutable |

Hosts that serve the app from a sub-path need `BASE_PATH`, e.g. `BASE_PATH=/FTCDash/ npm run build`
(PowerShell: `$env:BASE_PATH='/FTCDash/'; npm run build`). Root-domain hosts keep the default `/`.

### cPanel / InMotion shared hosting

InMotion (and any cPanel host) serves `public_html` with Apache, which is all this build needs. Do the
build on your own machine — the server never runs Node.

**One step.** Double-click **`package-site.cmd`** (or run `npm run package`). It typechecks, builds
and writes `ftcdash-site.zip` containing the *contents* of `dist/` — `index.html`, `assets/`, the
icons, `.htaccess`, and the `admin/` + `media/` folders the [server asset library](#on-a-php-host-admin)
uses — and prints the file list so you can confirm nothing is missing.

```
package-site.cmd                 # https://example.com/
package-site.cmd /ftcdash/       # https://example.com/ftcdash/  (trailing slash required)
npm run package -- --base=/ftcdash/ --out=../upload.zip   # same thing from a terminal
```

The script builds for the address you name and fails loudly if `dist/index.html` ends up pointing
somewhere other than that path, which is the usual cause of a page that loads without styles.

`shared-assets.json` is deliberately **left out** of the zip: the `/admin/` page owns that file on the
server, and shipping the committed copy would wipe your library on every deploy. Add `--with-assets`
to include it anyway (e.g. for a static host with no PHP).

**Then upload it:**

1. cPanel → **File Manager**, open `public_html` (or create `public_html/ftcdash` for a sub-folder
   build).
2. **Upload** `ftcdash-site.zip`, then **Extract** it in that folder, then delete the zip.
3. Visit the URL. A redeploy is the same three steps — the new files replace the old ones, and because
   Vite fingerprints `assets/*`, the old ones are simply ignored (delete them occasionally if the
   folder grows).

FTP/SFTP works the same way — drag the contents of `dist/` into the target folder, but delete
`dist/shared-assets.json` first: that empty seed would replace the live library on a PHP host (the zip
already leaves it out). On plans with SSH you can deploy a rebuild in one step. Exclude the two folders
the server writes to, or `--delete` will remove the uploaded images and the admin password:

```bash
npm run build
rsync -avz --delete \
  --exclude media --exclude admin/data --exclude shared-assets.json \
  dist/ user@server.example.com:~/public_html/ftcdash/
```

After the first upload, open `/admin/` once and set the library password (see
[On a PHP host](#on-a-php-host-admin)).

`public/.htaccess` ships inside the archive and tells Apache to compress text, cache the fingerprinted
`assets/*` for a year and never cache `index.html` or `shared-assets.json` — so a redeploy (or a new
shared asset library) shows up immediately while repeat visitors still avoid re-downloading the
bundle. Routing is hash-based, so no rewrite rules are needed and no `.htaccess` changes are required
for deep links.

Because everything is static, the same steps work on an InMotion VPS: point the Apache (or nginx) site
root at the uploaded folder. For nginx use `try_files $uri /index.html;` only if you ever add real
paths; today it is unnecessary.


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
