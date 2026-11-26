<?php
// Presentation for admin/index.php, which does the work and sets every variable used here. Guarded
// so a direct hit on this file cannot render a half-empty page.
if (!function_exists('ftc_teams')) {
    http_response_code(404);
    exit;
}

$logoPath = is_string($editEntry['logo'] ?? null) ? $editEntry['logo'] : null;
$seasonRobot = is_string($editEntry['robots'][(string) $editSeason] ?? null)
    ? $editEntry['robots'][(string) $editSeason]
    : null;
$allSeasonRobot = is_string($editEntry['robot'] ?? null) ? $editEntry['robot'] : null;
$robotPath = $seasonRobot ?? $allSeasonRobot;
$imageUrl = static fn (string $path): string => str_starts_with($path, 'media/') ? '../' . $path : $path;
$editorUrl = static fn (string $team, ?int $season = null): string =>
    '?team=' . rawurlencode($team) . ($season === null ? '' : '&season=' . $season);
$seasonChoicesForEditor = $seasonChoices;
if (!in_array($editSeason, $seasonChoicesForEditor, true)) {
    $seasonChoicesForEditor[] = $editSeason;
    rsort($seasonChoicesForEditor);
}
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>FTCDash — shared asset library</title>
<link rel="icon" type="image/png" sizes="64x64" href="../favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap">
<style>
  /* Same palette, spacing and components as the app's own admin page, copied rather than shared:
     this file has to stand alone on a host that serves no JavaScript bundle. */
  :root { color-scheme: dark;
    --bg:#101212; --bg-panel:#191e1b; --bg-raised:#1d2420; --bg-raised-2:#26302a;
    --line:#303934; --line-strong:#48544c; --text:#edf2ed; --text-dim:#9ba89e; --text-faint:#718078;
    --accent:#ff6200; --accent-strong:#ff8d47; --accent-soft:rgba(255,98,0,.14);
    --accent-line:rgba(255,98,0,.45); --red-soft:rgba(223,95,107,.14); --warn:#ffc861;
    --radius:12px; --radius-sm:5px;
    --font:'Inter','Segoe UI',system-ui,-apple-system,'Helvetica Neue',Arial,sans-serif;
    --display:'Barlow Condensed','Inter','Segoe UI',sans-serif;
    --mono:'Cascadia Mono','SF Mono',Consolas,monospace;
    --wash:radial-gradient(130% 120% at 8% -20%, rgba(51,65,56,.9), rgba(28,36,31,0) 72%);
    --tracking:.16em; }
  * { box-sizing:border-box; }
  html, body { margin:0; height:100%; }
  body { background:var(--bg); color:var(--text); font-family:var(--font); font-size:14px;
    line-height:1.5; -webkit-font-smoothing:antialiased; }
  button, input, select { font:inherit; color:inherit; }
  a { color:inherit; }

  /* ---------- header ---------- */
  .topbar { display:flex; align-items:center; gap:18px; padding:12px 22px;
    border-bottom:1px solid var(--line); background:rgba(16,18,18,.86);
    backdrop-filter:blur(10px); position:sticky; top:0; z-index:5; }
  .brand { display:inline-flex; align-items:center; gap:10px; text-decoration:none; }
  .brand__badge { display:inline-flex; align-items:center; justify-content:center; width:24px;
    height:27px; border-radius:2px; background:var(--accent); color:var(--bg);
    font-family:var(--display); font-size:20px; font-weight:600; line-height:1;
    transform:skew(-8deg); }
  .brand__mark { font-family:var(--display); font-size:21px; font-weight:600;
    letter-spacing:.06em; text-transform:uppercase; }
  .topbar__where { margin:0; font-size:10px; font-weight:700; letter-spacing:var(--tracking);
    text-transform:uppercase; color:var(--text-faint); }
  .topbar__actions { margin-left:auto; display:flex; gap:8px; align-items:center; }

  /* ---------- page ---------- */
  .config { padding:22px 22px 56px; }
  .config__inner { max-width:1040px; margin:0 auto; }
  .config__head { display:flex; align-items:flex-start; justify-content:space-between; gap:20px;
    flex-wrap:wrap; margin-bottom:18px; }
  .detail__kicker { margin:0; font-size:10px; font-weight:600; letter-spacing:var(--tracking);
    text-transform:uppercase; color:var(--text-faint); }
  .config__head h1, .admin__title { margin:0 0 6px; font-family:var(--display); font-size:26px;
    font-weight:600; letter-spacing:.02em; text-transform:uppercase; }
  .config__intro { margin:6px 0 0; max-width:68ch; font-size:12px; line-height:1.6;
    color:var(--text-dim); }
  .config__panel { border:1px solid var(--line); border-radius:var(--radius);
    background:var(--wash), var(--bg-panel); padding:16px 18px 18px; margin-bottom:18px; }
  .config__panel h2 { margin:0 0 4px; font-size:12px; font-weight:700; letter-spacing:.1em;
    text-transform:uppercase; color:var(--text-dim); }
  .config__hint { margin:0 0 14px; font-size:12px; color:var(--text-faint); }
  .config__hint:last-child { margin-bottom:0; }
  .config__hint strong { color:var(--text); font-variant-numeric:tabular-nums; }
  .config__note { margin:12px 0 0; font-size:12px; color:var(--accent-strong); }
  .config__error { margin:12px 0 0; font-size:12px; color:#ff9aa3; }
  .config__warn { margin:0 0 12px; font-size:12px; color:var(--warn); }
  .config__assets { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr));
    gap:14px; margin-top:16px; }
  .config__library { display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr));
    gap:12px; }
  .empty { margin:4px 2px; font-size:12px; line-height:1.6; color:var(--text-faint); }
  code { padding:1px 5px; border-radius:4px; background:var(--bg-raised-2); font-family:var(--mono);
    font-size:11px; color:var(--text-dim); }

  /* ---------- controls ---------- */
  .button { display:inline-flex; align-items:center; justify-content:center; height:34px;
    padding:0 14px; border-radius:var(--radius-sm); border:1px solid #b25b28;
    background:var(--accent); color:var(--bg); font-weight:700; font-size:13px; cursor:pointer;
    text-decoration:none; transition:background 120ms ease, border-color 120ms ease, color 120ms ease; }
  .button:hover { background:var(--accent-strong); border-color:var(--accent); }
  .button--ghost { border-color:var(--line-strong); background:var(--bg-raised);
    color:var(--text-dim); }
  .button--ghost:hover { background:var(--bg-raised-2); color:var(--text); }
  .button--danger { border-color:rgba(223,95,107,.5); background:var(--red-soft); color:#ffb6bd; }
  .button--danger:hover { background:rgba(223,95,107,.26); }
  .button--small { height:28px; padding:0 10px; font-size:12px; }
  .field__label { display:block; margin-bottom:4px; font-size:9px; font-weight:700;
    letter-spacing:var(--tracking); text-transform:uppercase; color:var(--text-faint); }
  .field__control { width:100%; height:34px; padding:0 10px; border-radius:var(--radius-sm);
    border:1px solid var(--line-strong); background:var(--bg-raised); color:var(--text);
    outline:none; transition:border-color 120ms ease, box-shadow 120ms ease; }
  .field__control:focus-visible { border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-soft); }
  .chip { padding:1px 6px; border-radius:4px; font-size:9px; font-weight:800; letter-spacing:.12em; }
  .chip--team { background:var(--accent); color:var(--bg); border:1px solid var(--accent); }
  .teamsearch__status { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin:10px 0 0;
    font-size:12px; color:var(--text-dim); }
  .teamsearch__status strong { color:var(--accent); }

  /* ---------- team search ---------- */
  .search { position:relative; max-width:420px; }
  .suggest { position:absolute; z-index:8; top:calc(100% + 4px); left:0; right:0; margin:0;
    padding:4px; list-style:none; border-radius:8px; border:1px solid var(--line-strong);
    background:var(--bg-panel); box-shadow:0 16px 34px rgba(0,0,0,.6); max-height:250px;
    overflow-y:auto; }
  .suggest li { margin:0; }
  .suggest button { display:flex; gap:8px; align-items:baseline; width:100%; height:auto;
    padding:6px 8px; border:none; border-radius:4px; background:none; color:var(--text);
    font-weight:400; text-align:left; cursor:pointer; }
  .suggest button:hover, .suggest button[aria-selected=true] { background:var(--bg-raised); }
  .suggest .num { font-family:var(--mono); font-weight:700; font-size:12px; color:var(--accent-strong); }
  .suggest .who { display:flex; flex-direction:column; min-width:0; }
  .suggest .who small { color:var(--text-faint); font-size:10px; }
  .resolved { margin:6px 0 0; min-height:16px; font-size:12px; color:var(--text-dim); }

  /* ---------- one image kind ---------- */
  .asset { display:flex; flex-direction:column; gap:10px; padding:12px; border:1px solid var(--line);
    border-radius:12px; background:var(--wash), var(--bg-raised); }
  .asset__label { font-size:10px; font-weight:700; letter-spacing:.12em; text-transform:uppercase;
    color:var(--text-faint); }
  .asset__season { display:flex; align-items:center; gap:8px; }
  .asset__season label { font-size:10px; font-weight:700; letter-spacing:.12em;
    text-transform:uppercase; color:var(--text-faint); }
  .asset__season select { flex:1; height:30px; padding:0 8px; border-radius:var(--radius-sm);
    border:1px solid var(--line-strong); background:var(--bg-panel); color:var(--text); outline:none; }
  .asset__season select:focus-visible { border-color:var(--accent);
    box-shadow:0 0 0 3px var(--accent-soft); }
  .asset__preview { display:flex; align-items:center; justify-content:center; height:132px;
    border-radius:9px; border:1px dashed var(--line-strong); background:rgba(0,0,0,.18);
    overflow:hidden; transition:border-color 120ms ease, background 120ms ease; }
  .asset.drop-target .asset__preview { border-color:var(--accent); background:rgba(255,98,0,.09); }
  .asset__image { max-width:100%; max-height:100%; object-fit:contain; }
  .asset__empty { padding:0 12px; font-size:12px; color:var(--text-faint); text-align:center; }
  .asset__actions { display:flex; gap:8px; flex-wrap:wrap; }
  .asset__form { margin:0; }
  .asset__input { display:none; }
  .asset__note { margin:0; font-size:11px; color:var(--warn); }

  /* ---------- library ---------- */
  .library-card { display:flex; gap:10px; align-items:center; padding:10px;
    border:1px solid var(--line); border-radius:12px; background:var(--wash), var(--bg-raised);
    text-decoration:none; }
  .library-card:hover { border-color:var(--accent-line); }
  .library-card--on { border-color:var(--accent); }
  .library-card__logo { width:44px; height:44px; border-radius:8px; object-fit:contain;
    background:rgba(255,255,255,.06); flex:none; }
  .library-card__logo--none { display:flex; align-items:center; justify-content:center;
    font-family:var(--mono); font-size:12px; color:var(--text-faint); }
  .library-card__body { min-width:0; flex:1; }
  .library-card__number { display:block; font-family:var(--mono); font-weight:700;
    font-variant-numeric:tabular-nums; }
  .library-card__tags { display:flex; gap:6px; margin-top:4px; font-size:10px; color:var(--text-faint); }

  @media (max-width:720px) {
    .config { padding:16px 14px 40px; }
    .topbar { padding:10px 14px; gap:12px; }
    .topbar__where { display:none; }
    .config__head h1 { font-size:22px; }
    .search { max-width:none; }
  }
</style>
</head>
<body>
<header class="topbar">
  <a class="brand" href="../">
    <span class="brand__badge">F</span>
    <span class="brand__mark">FTCDash</span>
  </a>
  <p class="topbar__where">Shared asset library</p>
  <div class="topbar__actions">
    <a class="button button--small button--ghost" href="../">← Dashboard</a>
    <?php if ($loggedIn): ?>
      <form method="post" style="margin:0">
        <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
        <input type="hidden" name="action" value="logout">
        <button class="button button--small button--ghost" type="submit">Sign out</button>
      </form>
    <?php endif; ?>
  </div>
</header>

<main class="config">
  <div class="config__inner">
    <?php if ($notice !== null): ?>
      <p class="<?= $notice['tone'] === 'error' ? 'config__error' : 'config__note' ?>">
        <?= h($notice['message']) ?>
      </p>
    <?php endif; ?>

    <?php if ($config === null): ?>
      <section class="config__panel" style="max-width:460px;margin:32px auto 0">
        <h1 class="admin__title">Choose a password</h1>
        <p class="config__hint">
          This page stores logos and robot photos on the server, and has no account system beyond
          this password. Pick something long and unique — you can change it later by deleting
          <code>admin/data/config.php</code>, which reopens this screen.
        </p>
        <form method="post" class="config__assets">
          <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
          <input type="hidden" name="action" value="setup">
          <div>
            <label class="field__label" for="setup-password">Password</label>
            <input class="field__control" id="setup-password" type="password" name="password"
                   required minlength="10" autocomplete="new-password" autofocus>
          </div>
          <div>
            <label class="field__label" for="setup-confirm">Repeat password</label>
            <input class="field__control" id="setup-confirm" type="password" name="confirm"
                   required minlength="10" autocomplete="new-password">
          </div>
          <div class="asset__actions" style="grid-column:1/-1">
            <button class="button" type="submit">Save password</button>
          </div>
        </form>
      </section>
    <?php elseif (!$loggedIn): ?>
      <section class="config__panel" style="max-width:460px;margin:32px auto 0">
        <h1 class="admin__title">Sign in</h1>
        <p class="config__hint">The password you chose on first run. Five wrong tries pause sign-in for 30 seconds.</p>
        <form method="post">
          <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
          <input type="hidden" name="action" value="login">
          <label class="field__label" for="login-password">Password</label>
          <input class="field__control" id="login-password" type="password" name="password"
                 required autocomplete="current-password" autofocus>
          <div class="asset__actions" style="margin-top:14px">
            <button class="button" type="submit">Sign in</button>
          </div>
        </form>
      </section>
    <?php else: ?>
      <header class="config__head">
        <div>
          <p class="detail__kicker">Admin</p>
          <h1>Shared asset library</h1>
          <p class="config__intro">
            These logos and robot photos ship with the site, so every visitor sees them without
            uploading anything; anything a visitor adds in their own browser takes precedence.
            Here the images are real files in <code>media/</code> and
            <code>shared-assets.json</code> is updated in place, so there is nothing to download or
            redeploy.
          </p>
        </div>
      </header>

      <?php if ($restored > 0): ?>
        <p class="config__note">
          Restored <?= $restored === 1 ? '1 image' : $restored . ' images' ?> that a deploy had
          replaced — <code><?= h(FTC_MANIFEST) ?></code> lists them again.
        </p>
      <?php endif; ?>
      <?php if ($restoreProblem !== null): ?>
        <p class="config__error">
          Could not republish <?= h(FTC_MANIFEST) ?>: <?= h($restoreProblem) ?>
        </p>
      <?php endif; ?>

      <section class="config__panel">
        <h2>Library</h2>
        <p class="config__hint">
          <strong><?= count($teams) ?></strong> teams · <strong><?= $imageCount ?></strong> images ·
          <strong><?= h(ftc_format_bytes($imageBytes)) ?></strong> on disk · manifest
          <a href="<?= h($manifestUrl) ?>"><code><?= h(FTC_MANIFEST) ?></code></a>
        </p>
        <?php if ($problems !== []): ?>
          <p class="config__warn">
            Not writable: <?= h(implode(', ', $problems)) ?>. Set those folders to 755 (or 775) in
            cPanel → File Manager → Permissions, then reload.
          </p>
        <?php endif; ?>
        <?php if (!$hasGd): ?>
          <p class="config__warn">
            The GD extension is off, so uploads cannot be processed. Enable it in cPanel → Select PHP
            Version → Extensions.
          </p>
        <?php endif; ?>
        <?php if ($unlisted !== [] && $restorable !== []): ?>
          <p class="config__hint">
            <code>media/</code> holds <?= count($restorable) ?>
            image<?= count($restorable) === 1 ? '' : 's' ?> the manifest does not list — usually what a
            deploy that replaced <code><?= h(FTC_MANIFEST) ?></code> leaves behind. Restoring re-adds
            them and leaves every slot that is already filled alone.
          </p>
          <form method="post">
            <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
            <input type="hidden" name="action" value="rebuild">
            <button class="button button--small" type="submit">
              Restore <?= count($restorable) === 1 ? 'image' : count($restorable) . ' images' ?>
            </button>
          </form>
        <?php endif; ?>
        <?php if ($duplicates > 0): ?>
          <p class="config__hint<?= $restorable === [] ? '' : ' config__warn' ?>">
            Already filled: <?= $duplicates ?> file<?= $duplicates === 1 ? '' : 's' ?> in
            <code>media/</code> that a restore will not touch — delete
            <?= $duplicates === 1 ? 'it' : 'them' ?> in cPanel if
            <?= $duplicates === 1 ? 'it is' : 'they are' ?> dead.
          </p>
        <?php endif; ?>
      </section>

      <section class="config__panel">
        <h2>Team</h2>
        <p class="config__hint">
          Search a team by number or name, then upload, replace or remove its images. Everything is
          re-encoded and scaled on the server — logos to fit 128 px, robot photos to fit 480 px.
        </p>

        <div class="search">
          <label class="field__label" for="team-input">Team — number or name</label>
          <input class="field__control" type="text" id="team-input" autocomplete="off"
                 spellcheck="false" placeholder="10136, or start typing Frost Robo…"
                 value="<?= h((string) $editTeam) ?>">
          <ul class="suggest" id="suggest" hidden></ul>
          <p class="resolved" id="resolved" aria-live="polite"></p>
        </div>

        <?php if ($editTeam === null): ?>
          <p class="empty" style="margin-top:14px">
            Pick a team to see and edit its images. Nothing in the library yet? Search any team and
            upload a logo or robot photo.
          </p>
        <?php else: ?>
          <p class="teamsearch__status">
            <span class="chip chip--team"><?= h($editTeam) ?></span>
            <strong data-team-name>Team <?= h($editTeam) ?></strong>
            <span data-team-school></span>
          </p>

          <div class="config__assets">
            <div class="asset" data-drop="logo">
              <span class="asset__label">Team logo</span>
              <div class="asset__preview">
                <?php if ($logoPath !== null): ?>
                  <img class="asset__image" src="<?= h($imageUrl($logoPath)) ?>" alt="Team <?= h($editTeam) ?> logo">
                <?php else: ?>
                  <span class="asset__empty">No logo yet — a square, transparent PNG works best.</span>
                <?php endif; ?>
              </div>
              <div class="asset__actions">
                <form class="asset__form" method="post" enctype="multipart/form-data" data-upload>
                  <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
                  <input type="hidden" name="action" value="upload">
                  <input type="hidden" name="team" value="<?= h($editTeam) ?>">
                  <input type="hidden" name="kind" value="logo">
                  <input class="asset__input" id="logo-file" type="file" name="logo"
                         accept="image/png,image/jpeg,image/webp,image/gif">
                  <label class="button button--small" for="logo-file">
                    <?= $logoPath !== null ? 'Replace' : 'Upload' ?>
                  </label>
                </form>
                <?php if ($logoPath !== null): ?>
                  <form class="asset__form" method="post">
                    <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
                    <input type="hidden" name="action" value="delete">
                    <input type="hidden" name="team" value="<?= h($editTeam) ?>">
                    <input type="hidden" name="kind" value="logo">
                    <input type="hidden" name="season" value="">
                    <button class="button button--small button--danger" type="submit">Remove</button>
                  </form>
                <?php endif; ?>
              </div>
            </div>

            <div class="asset" data-drop="robot">
              <span class="asset__label">Robot photo</span>
              <div class="asset__season">
                <label for="season-select">Season</label>
                <select id="season-select" data-season>
                  <?php foreach ($seasonChoicesForEditor as $season): ?>
                    <option value="<?= h((string) $season) ?>"<?= $season === $editSeason ? ' selected' : '' ?>>
                      <?= h(ftc_season_label($season)) ?>
                    </option>
                  <?php endforeach; ?>
                </select>
              </div>
              <div class="asset__preview">
                <?php if ($robotPath !== null): ?>
                  <img class="asset__image" src="<?= h($imageUrl($robotPath)) ?>"
                       alt="Team <?= h($editTeam) ?> robot">
                <?php else: ?>
                  <span class="asset__empty">
                    No robot photo for <?= h((string) $editSeason) ?> yet — cut-out PNGs work best.
                  </span>
                <?php endif; ?>
              </div>
              <div class="asset__actions">
                <form class="asset__form" method="post" enctype="multipart/form-data" data-upload>
                  <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
                  <input type="hidden" name="action" value="upload">
                  <input type="hidden" name="team" value="<?= h($editTeam) ?>">
                  <input type="hidden" name="kind" value="robot">
                  <input type="hidden" name="season" value="<?= h((string) $editSeason) ?>">
                  <input class="asset__input" id="robot-file" type="file" name="robot"
                         accept="image/png,image/jpeg,image/webp,image/gif">
                  <label class="button button--small" for="robot-file">
                    <?= $robotPath !== null ? 'Replace' : 'Upload' ?>
                  </label>
                </form>
                <?php if ($robotPath !== null): ?>
                  <form class="asset__form" method="post">
                    <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
                    <input type="hidden" name="action" value="delete">
                    <input type="hidden" name="team" value="<?= h($editTeam) ?>">
                    <input type="hidden" name="kind" value="robot">
                    <input type="hidden" name="season"
                           value="<?= $seasonRobot !== null ? h((string) $editSeason) : '' ?>">
                    <button class="button button--small button--danger" type="submit">Remove</button>
                  </form>
                <?php endif; ?>
              </div>
              <?php if ($seasonRobot === null && $allSeasonRobot !== null): ?>
                <p class="asset__note">
                  Nothing for <?= h((string) $editSeason) ?> — showing the photo saved for every
                  season.
                </p>
              <?php endif; ?>
            </div>
          </div>
        <?php endif; ?>
      </section>

      <section class="config__panel">
        <h2>In the library</h2>
        <?php if ($teams === []): ?>
          <p class="empty">Nothing yet — search a team above and upload a logo or robot photo.</p>
        <?php else: ?>
          <div class="config__library">
            <?php foreach ($teams as $number => $entry): ?>
              <?php if (!is_array($entry)) { continue; } ?>
              <?php $logo = is_string($entry['logo'] ?? null) ? $entry['logo'] : null; ?>
              <a class="library-card<?= (string) $number === $editTeam ? ' library-card--on' : '' ?>"
                 href="<?= h($editorUrl((string) $number)) ?>">
                <?php if ($logo !== null): ?>
                  <img class="library-card__logo" src="<?= h($imageUrl($logo)) ?>"
                       alt="Team <?= h((string) $number) ?> logo">
                <?php else: ?>
                  <span class="library-card__logo library-card__logo--none">—</span>
                <?php endif; ?>
                <span class="library-card__body">
                  <span class="library-card__number"><?= h((string) $number) ?></span>
                  <span class="library-card__tags">
                    <?php if ($logo !== null): ?><span>logo</span><?php endif; ?>
                    <?php if (is_string($entry['robot'] ?? null)): ?><span>robot</span><?php endif; ?>
                    <?php foreach (array_keys(is_array($entry['robots'] ?? null) ? $entry['robots'] : []) as $season): ?>
                      <span>robot <?= h((string) $season) ?></span>
                    <?php endforeach; ?>
                  </span>
                </span>
              </a>
            <?php endforeach; ?>
          </div>
        <?php endif; ?>
      </section>

      <p class="config__hint">
        This page only exists on a PHP host. The library is also mirrored in
        <code>admin/data/library.json</code>, which deploys never ship, so opening this page
        republishes a manifest that a deploy replaced.
      </p>
    <?php endif; ?>
  </div>
</main>

<?php if ($loggedIn): ?>
<script>
// Team lookup against FTC Scout. Numbers are what the editor works with, so a pick navigates to it.
(() => {
  const ENDPOINT = 'https://api.ftcscout.org/graphql';
  const input = document.getElementById('team-input');
  const list = document.getElementById('suggest');
  const resolved = document.getElementById('resolved');
  if (!input || !list || !resolved) return;

  const SEARCH = 'query S($text: String!) { teamsSearch(searchText: $text) { number name schoolName } }';
  const LOOKUP = 'query L($number: Int!) { teamByNumber(number: $number) { number name schoolName } }';

  const ask = async (query, variables) => {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    const payload = await response.json();
    if (payload.errors) throw new Error(payload.errors[0].message);
    return payload.data;
  };

  const describe = (team) => {
    const parts = [`${team.number} · ${team.name}`];
    if (team.schoolName) parts.push(team.schoolName);
    return parts.join(' — ');
  };

  const open = (number) => {
    const season = document.querySelector('[data-season]');
    const suffix = season ? `&season=${encodeURIComponent(season.value)}` : '';
    window.location.search = `?team=${encodeURIComponent(number)}${suffix}`;
  };

  const close = () => {
    list.hidden = true;
    list.innerHTML = '';
  };

  const show = (teams) => {
    if (teams.length === 0) {
      resolved.textContent = 'No team matches that. Type the number instead.';
      close();
      return;
    }
    list.innerHTML = '';
    for (const team of teams) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.innerHTML = '<span class="num"></span><span class="who"></span>';
      button.querySelector('.num').textContent = String(team.number);
      const who = button.querySelector('.who');
      const name = document.createElement('span');
      name.textContent = team.name;
      who.append(name);
      if (team.schoolName) {
        const school = document.createElement('small');
        school.textContent = team.schoolName;
        who.append(school);
      }
      button.addEventListener('click', () => open(team.number));
      item.append(button);
      list.append(item);
    }
    list.hidden = false;
  };

  let timer = 0;
  let seq = 0;
  const schedule = () => {
    clearTimeout(timer);
    const text = input.value.trim();
    const mine = ++seq;

    if (text === '') {
      resolved.textContent = '';
      close();
      return;
    }
    if (/^\d+$/.test(text)) {
      resolved.textContent = 'Looking up team ' + text + '…';
      close();
    }

    timer = setTimeout(async () => {
      try {
        if (/^\d+$/.test(text)) {
          const data = await ask(LOOKUP, { number: Number(text) });
          if (mine !== seq) return;
          const team = data.teamByNumber;
          resolved.textContent = team ? describe(team) : 'No team with that number.';
          const label = document.querySelector('[data-team-name]');
          const school = document.querySelector('[data-team-school]');
          if (team && label) label.textContent = team.name;
          if (team && school) school.textContent = team.schoolName ? '· ' + team.schoolName : '';
          return;
        }
        const data = await ask(SEARCH, { text });
        if (mine !== seq) return;
        resolved.textContent = '';
        show(data.teamsSearch.slice(0, 8));
      } catch {
        if (mine !== seq) return;
        resolved.textContent = 'Could not reach FTC Scout — type the team number directly.';
        close();
      }
    }, 250);
  };

  input.addEventListener('input', schedule);
  input.addEventListener('focus', () => {
    if (!/^\d+$/.test(input.value.trim())) schedule();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
    if (event.key === 'Enter') {
      event.preventDefault();
      if (!list.hidden) list.querySelector('button')?.click();
      else if (/^\d+$/.test(input.value.trim())) open(input.value.trim());
    }
  });
  document.addEventListener('click', (event) => {
    if (!list.contains(event.target) && event.target !== input) close();
  });

  // A page opened for a team already shows its name, so ask for it without touching the boxes.
  if (input.value.trim() !== '') schedule();
})();

// One image per form: picking a file sends it straight away, like the browser-side editor does.
(() => {
  const forms = [...document.querySelectorAll('form[data-upload]')];
  forms.forEach((form) => {
    const input = form.querySelector('input[type=file]');
    const label = form.querySelector('label.button');
    if (!input || !label) return;

    const idle = label.textContent.trim();
    input.addEventListener('change', () => {
      if (input.files.length === 0) return;
      label.textContent = 'Uploading…';
      form.submit();
    });

    // Dropping onto the card fills that card's input, then uploads it.
    const card = form.closest('[data-drop]');
    if (!card) return;
    ['dragenter', 'dragover'].forEach((type) =>
      card.addEventListener(type, (event) => {
        event.preventDefault();
        card.classList.add('drop-target');
      }),
    );
    ['dragleave', 'drop'].forEach((type) =>
      card.addEventListener(type, () => card.classList.remove('drop-target')),
    );
    card.addEventListener('drop', (event) => {
      event.preventDefault();
      const file = event.dataTransfer?.files?.[0];
      if (!file || !file.type.startsWith('image/')) {
        label.textContent = idle;
        return;
      }
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      label.textContent = 'Uploading…';
      form.submit();
    });
  });
})();

// The robot season is a view choice, not an upload: changing it reloads this team for that season.
(() => {
  const select = document.querySelector('[data-season]');
  if (!select) return;
  select.addEventListener('change', () => {
    const team = document.querySelector('.chip--team')?.textContent.trim();
    if (!team) return;
    window.location.search = `?team=${encodeURIComponent(team)}&season=${encodeURIComponent(select.value)}`;
  });
})();
</script>
<?php endif; ?>
</body>
</html>
