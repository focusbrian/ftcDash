<?php
declare(strict_types=1);
/**
 * Server-side asset library — open https://your-site/admin/ after deploying.
 *
 * This page stores logos and robot photos as real files in media/ and records them in
 * shared-assets.json, so nothing has to be downloaded, edited and re-uploaded by hand. It is plain
 * PHP: it only works on a host that runs PHP (InMotion/cPanel), not on GitHub Pages.
 */

require __DIR__ . '/lib.php';

session_set_cookie_params([
    'httponly' => true,
    'samesite' => 'Strict',
    'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
]);
session_name('ftcdash_admin');
session_start();

function h(?string $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function csrf_token(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(16));
    }
    return $_SESSION['csrf'];
}

function require_csrf(): void
{
    $sent = (string) ($_POST['csrf'] ?? '');
    if (!hash_equals(csrf_token(), $sent)) {
        throw new RuntimeException('That form expired - reload the page and try again.');
    }
}

function is_logged_in(): bool
{
    return ($_SESSION['auth'] ?? false) === true;
}

function flash(?string $message, string $tone = 'ok'): ?array
{
    if ($message !== null) {
        $_SESSION['flash'] = ['message' => $message, 'tone' => $tone];
        return null;
    }
    $stored = $_SESSION['flash'] ?? null;
    unset($_SESSION['flash']);
    return is_array($stored) ? $stored : null;
}

function redirect_self(): void
{
    $target = strtok((string) ($_SERVER['REQUEST_URI'] ?? '/admin/'), '?');
    header('Location: ' . $target, true, 303);
    exit;
}

$config = ftc_config();
$action = (string) ($_POST['action'] ?? '');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        require_csrf();

        if ($action === 'setup') {
            if ($config !== null) {
                throw new RuntimeException('This library already has a password.');
            }
            $password = (string) ($_POST['password'] ?? '');
            $confirm = (string) ($_POST['confirm'] ?? '');
            if (strlen($password) < 10) {
                throw new RuntimeException('Use at least 10 characters.');
            }
            if ($password !== $confirm) {
                throw new RuntimeException('The two passwords do not match.');
            }
            ftc_set_password($password);
            $_SESSION['auth'] = true;
            flash('Password saved. Upload your first image below.');
            redirect_self();
        }

        if ($action === 'login') {
            if ($config === null) {
                throw new RuntimeException('Set a password first.');
            }
            $blocked = (int) ($_SESSION['blocked_until'] ?? 0);
            if ($blocked > time()) {
                throw new RuntimeException('Too many attempts - wait ' . ($blocked - time()) . 's and try again.');
            }
            if (!password_verify((string) ($_POST['password'] ?? ''), (string) $config['hash'])) {
                $_SESSION['fails'] = (int) ($_SESSION['fails'] ?? 0) + 1;
                if ($_SESSION['fails'] >= 5) {
                    $_SESSION['fails'] = 0;
                    $_SESSION['blocked_until'] = time() + 30;
                }
                usleep(400000);
                throw new RuntimeException('That password does not match.');
            }
            $_SESSION['fails'] = 0;
            $_SESSION['auth'] = true;
            session_regenerate_id(true);
            flash('Signed in.');
            redirect_self();
        }

        if ($action === 'logout') {
            $_SESSION = [];
            session_destroy();
            header('Location: ' . (strtok((string) ($_SERVER['REQUEST_URI'] ?? '/admin/'), '?') ?: '/admin/'), true, 303);
            exit;
        }

        // Everything below changes the library, so it needs an authenticated session.
        if (!is_logged_in()) {
            throw new RuntimeException('Sign in first.');
        }

        $team = trim((string) ($_POST['team'] ?? ''));
        $kind = (string) ($_POST['kind'] ?? '');
        $seasonRaw = trim((string) ($_POST['season'] ?? ''));

        if ($action === 'upload') {
            if (!preg_match(FTC_TEAM_PATTERN, $team)) {
                throw new RuntimeException('Pick a team first — type its number or search it by name.');
            }

            // One submit carries whichever files were dropped or chosen, so a logo and a robot
            // photo can go up together. A file input left empty simply is not in this list.
            $incoming = [];
            foreach (FTC_KINDS as $candidate) {
                $file = $_FILES[$candidate] ?? [];
                if (($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
                    continue;
                }
                $incoming[$candidate] = $file;
            }
            if ($incoming === []) {
                throw new RuntimeException('Drop or choose a logo, a robot photo, or both.');
            }

            $season = null;
            if (isset($incoming['robot']) && $seasonRaw !== '') {
                if (!preg_match('/^\d{4}$/', $seasonRaw)) {
                    throw new RuntimeException('Pick a season from the list.');
                }
                $season = (int) $seasonRaw;
            }

            $teams = ftc_teams();
            $entry = is_array($teams[$team] ?? null) ? $teams[$team] : [];
            $stored = [];
            $replaced = [];
            $saved = [];

            try {
                foreach ($incoming as $kind => $file) {
                    $path = ftc_store_image($file, $team, $kind, $kind === 'robot' ? $season : null);
                    $stored[] = $path;

                    // Remember the image this one replaces. It is deleted only after the manifest
                    // stops pointing at it, so a failure halfway cannot leave the team with none.
                    $previous = $kind === 'logo'
                        ? ($entry['logo'] ?? null)
                        : ($season === null ? ($entry['robot'] ?? null) : ($entry['robots'][(string) $season] ?? null));
                    if (is_string($previous)) {
                        $replaced[] = $previous;
                    }

                    if ($kind === 'logo') {
                        $entry['logo'] = $path;
                    } elseif ($season === null) {
                        $entry['robot'] = $path;
                    } else {
                        $entry['robots'] = is_array($entry['robots'] ?? null) ? $entry['robots'] : [];
                        $entry['robots'][(string) $season] = $path;
                    }
                    $saved[] = $kind === 'logo' ? 'logo' : 'robot photo';
                }
            } catch (Throwable $failure) {
                // Nothing is recorded unless every file is in, so clear the ones already written.
                foreach ($stored as $path) {
                    ftc_delete_image($path);
                }
                throw $failure;
            }

            $teams[$team] = $entry;
            try {
                // admin/data/ is the copy a deploy cannot replace, so it is written first.
                ftc_remember_library($teams);
            } catch (Throwable $failure) {
                foreach ($stored as $path) {
                    ftc_delete_image($path);
                }
                throw $failure;
            }
            // If this fails the next /admin/ load republishes the manifest from the copy above.
            ftc_save_teams($teams);

            // The manifest no longer references these, so media/ never accumulates dead files.
            foreach ($replaced as $path) {
                ftc_delete_image($path);
            }

            flash('Saved ' . implode(' and ', $saved) . ' for team ' . $team . '.');
            redirect_self();
        }

        if ($action === 'rebuild') {
            $teams = ftc_teams();
            $restorable = ftc_restorable_images($teams, ftc_unlisted_images($teams));
            if ($restorable === []) {
                throw new RuntimeException('Every image in media/ already belongs to a slot — nothing to restore.');
            }

            $teams = ftc_adopt_images($teams, $restorable);
            ftc_remember_library($teams);
            ftc_save_teams($teams);
            flash(
                'Put ' . count($restorable) . ' image' . (count($restorable) === 1 ? '' : 's')
                . ' from media/ back in the library.',
            );
            redirect_self();
        }

        if ($action === 'delete') {
            if (!preg_match(FTC_TEAM_PATTERN, $team)) {
                throw new RuntimeException('Unknown team.');
            }
            $teams = ftc_teams();
            $entry = is_array($teams[$team] ?? null) ? $teams[$team] : [];
            $removed = null;

            if ($kind === 'logo') {
                $removed = $entry['logo'] ?? null;
                unset($entry['logo']);
            } elseif ($kind === 'robot' && $seasonRaw === '') {
                $removed = $entry['robot'] ?? null;
                unset($entry['robot']);
            } elseif ($kind === 'robot') {
                $removed = $entry['robots'][$seasonRaw] ?? null;
                unset($entry['robots'][$seasonRaw]);
                if (($entry['robots'] ?? []) === []) {
                    unset($entry['robots']);
                }
            } else {
                throw new RuntimeException('Nothing to delete.');
            }

            if (is_string($removed)) {
                ftc_delete_image($removed);
            }
            if ($entry === []) {
                unset($teams[$team]);
            } else {
                $teams[$team] = $entry;
            }
            ftc_remember_library($teams);
            ftc_save_teams($teams);
            flash('Deleted for team ' . $team . '.');
            redirect_self();
        }

        throw new RuntimeException('Unknown action.');
    } catch (Throwable $error) {
        flash($error->getMessage(), 'error');
        redirect_self();
    }
}

$config = ftc_config();
$loggedIn = is_logged_in();
$notice = flash(null);
$teams = ftc_teams();
ksort($teams, SORT_NUMERIC);

// A deploy can replace shared-assets.json with the repo's empty seed. admin/data/ holds the copy
// this page last saved, so put those images back before anyone is shown a blank library.
$restored = 0;
$restoreProblem = null;
if ($loggedIn && $_SERVER['REQUEST_METHOD'] !== 'POST') {
    $remembered = ftc_saved_library();
    if ($remembered !== []) {
        $repaired = ftc_merge_libraries($teams, $remembered);
        $restored = ftc_count_images($repaired)[0] - ftc_count_images($teams)[0];
        if ($restored > 0) {
            $teams = $repaired;
            try {
                ftc_save_teams($teams);
            } catch (Throwable $error) {
                $restoreProblem = $error->getMessage();
            }
        }
    }
}

[$imageCount, $imageBytes] = ftc_count_images($teams);
$unlisted = $loggedIn ? ftc_unlisted_images($teams) : [];
$restorable = $loggedIn ? ftc_restorable_images($teams, $unlisted) : [];
$duplicates = count($unlisted) - count($restorable);

$writable = [
    'the manifest' => is_writable(dirname(ftc_manifest_path())),
    'media/' => is_writable(ftc_media_dir()) || !is_dir(ftc_media_dir()),
    'admin/data/' => is_writable(ftc_data_dir()) || !is_dir(ftc_data_dir()),
];
$problems = array_keys(array_filter($writable, static fn (bool $ok): bool => !$ok));
$hasGd = function_exists('imagecreatefromstring');
$manifestUrl = '../' . FTC_MANIFEST;

// The robot-season picker: the current season first, plus any season already in the library.
$seasonChoices = [];
for ($season = ftc_season_now(); $season >= 2019; $season--) {
    $seasonChoices[] = $season;
}
foreach ($teams as $entry) {
    $robots = is_array($entry) && is_array($entry['robots'] ?? null) ? $entry['robots'] : [];
    foreach (array_keys($robots) as $season) {
        $seasonChoices[] = (int) $season;
    }
}
$seasonChoices = array_values(array_unique($seasonChoices));
rsort($seasonChoices);
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>FTCDash — server asset library</title>
<style>
  :root { color-scheme: dark; --bg:#101212; --panel:#191e1b; --raised:#1d2420; --line:#303934;
    --text:#edf2ed; --dim:#9ba89e; --faint:#718078; --accent:#ff6200; --accent-dim:#ff8d47;
    --red:#df5f6b; --green:#4ade80; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:14px/1.5 Inter,'Segoe UI',system-ui,sans-serif; }
  a { color:inherit; }
  header { display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:16px 20px;
    border-bottom:1px solid var(--line); background:rgba(16,18,18,.86); }
  .mark { background:var(--accent); color:var(--bg); transform:skew(-8deg); padding:4px 11px;
    font:600 20px/1 'Barlow Condensed','Segoe UI',sans-serif; }
  h1 { margin:0; font-size:16px; font-weight:600; }
  .grow { margin-left:auto; }
  main { max-width:880px; margin:0 auto; padding:22px 20px 60px; }
  .panel { border:1px solid var(--line); border-radius:12px; background:var(--panel); padding:16px 18px;
    margin-bottom:16px; }
  .panel h2 { margin:0 0 6px; font-size:11px; font-weight:700; letter-spacing:.12em;
    text-transform:uppercase; color:var(--faint); }
  .hint { margin:0 0 12px; font-size:12px; color:var(--faint); }
  .row { display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end; }
  label { display:flex; flex-direction:column; gap:4px; font-size:9px; font-weight:700;
    letter-spacing:.14em; text-transform:uppercase; color:var(--faint); }
  input[type=text], input[type=password], input[type=number], select {
    height:34px; padding:0 10px; border-radius:5px; border:1px solid #48544c; background:var(--raised);
    color:var(--text); font:inherit; outline:none; min-width:0; }
  input:focus-visible, select:focus-visible { border-color:var(--accent); box-shadow:0 0 0 3px rgba(255,98,0,.16); }
  input[type=file] { font-size:12px; color:var(--dim); }
  button { height:34px; padding:0 14px; border-radius:5px; border:1px solid #b25b28;
    background:var(--accent); color:var(--bg); font:700 13px inherit; cursor:pointer; }
  button:hover { background:var(--accent-dim); }
  button.ghost { background:var(--raised); border-color:#48544c; color:var(--dim); font-weight:600; }
  button.ghost:hover { color:var(--text); }
  button.danger { background:transparent; border-color:#5d3b3f; color:#ffb6bd; font-weight:600; }
  button.danger:hover { background:rgba(223,95,107,.14); }
  .msg { margin:0 0 16px; padding:10px 12px; border-radius:8px; font-size:12px;
    border:1px solid var(--line); background:var(--raised); color:var(--dim); }
  .msg.error { border-color:#5d3b3f; background:rgba(223,95,107,.12); color:#ffb6bd; }
  .stats { display:flex; gap:18px; flex-wrap:wrap; font-size:12px; color:var(--dim); }
  .stats strong { color:var(--text); }
  .warn { color:var(--accent-dim); }
  .teams { display:flex; flex-direction:column; gap:10px; }
  .team { border:1px solid var(--line); border-radius:10px; background:var(--raised); padding:10px 12px; }
  .team h3 { margin:0 0 8px; font-size:13px; font-variant-numeric:tabular-nums; }
  .images { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:10px; }
  .image { display:flex; flex-direction:column; gap:6px; padding:8px; border-radius:8px;
    border:1px solid var(--line); background:var(--panel); }
  .image img { width:100%; height:74px; object-fit:contain; background:#0c0e0d; border-radius:6px; }
  .image span { font-size:10px; letter-spacing:.04em; text-transform:uppercase; color:var(--faint); }
  .image form { margin:0; }
  .empty { font-size:13px; color:var(--faint); }
  code { font-family:'Cascadia Mono',Consolas,monospace; font-size:11px; color:var(--dim);
    word-break:break-all; }

  /* Upload: one form, a team search, then a card per image kind. */
  .upload { display:flex; flex-direction:column; gap:14px; }
  .search { position:relative; max-width:420px; }
  .search input { width:100%; }
  .suggest { position:absolute; z-index:5; top:calc(100% - 4px); left:0; right:0; margin:0; padding:4px;
    list-style:none; border-radius:6px; border:1px solid #48544c; background:var(--panel);
    box-shadow:0 16px 34px rgba(0,0,0,.6); max-height:250px; overflow-y:auto; }
  .suggest li { margin:0; }
  .suggest button { display:flex; gap:8px; align-items:baseline; width:100%; height:auto; padding:6px 8px;
    border:none; border-radius:4px; background:none; color:var(--text); font-weight:400; text-align:left; }
  .suggest button:hover, .suggest button[aria-selected=true] { background:var(--raised); }
  .suggest .num { font-family:'Cascadia Mono',Consolas,monospace; font-weight:700; font-size:12px;
    color:var(--accent-dim); }
  .suggest .who { display:flex; flex-direction:column; min-width:0; }
  .suggest .who small { color:var(--faint); font-size:10px; }
  .resolved { margin:6px 0 0; min-height:16px; font-size:12px; color:var(--dim); }
  .resolved strong { color:var(--text); }
  .uploads { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:12px; }
  .upload-card { display:flex; flex-direction:column; gap:8px; align-items:flex-start; padding:12px 14px;
    border:1px solid var(--line); border-radius:10px; background:var(--raised);
    transition:border-color .12s ease, background .12s ease; }
  .upload-card.drop-target { border-color:var(--accent); background:rgba(255,98,0,.09); }
  .upload-card h3 { margin:0; font-size:12px; font-weight:700; letter-spacing:.1em; text-transform:uppercase;
    color:var(--dim); }
  .upload-card .hint { margin:0; }
  .upload-card select { width:100%; }
  .upload-card input[type=file] { width:100%; }
  .picked { margin:0; font-size:11px; color:var(--faint); }
  .picked--set { color:var(--accent-dim); font-weight:600; }
  .upload-submit { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
  .upload-submit .hint { margin:0; }
</style>
</head>
<body>
<header>
  <span class="mark">F</span>
  <h1>Server asset library</h1>
  <a class="grow hint" href="../">← Back to the dashboard</a>
  <?php if ($loggedIn): ?>
    <form method="post" style="margin:0">
      <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
      <input type="hidden" name="action" value="logout">
      <button class="ghost" type="submit">Sign out</button>
    </form>
  <?php endif; ?>
</header>

<main>
  <?php if ($notice !== null): ?>
    <p class="msg<?= $notice['tone'] === 'error' ? ' error' : '' ?>"><?= h($notice['message']) ?></p>
  <?php endif; ?>

  <?php if ($config === null): ?>
    <section class="panel">
      <h2>First run — choose a password</h2>
      <p class="hint">
        This page stores logos and robot photos on the server. It has no account system beyond this
        password, so pick something long and unique; you can change it later by deleting
        <code>admin/data/config.php</code> (which re-opens this screen).
      </p>
      <form method="post" class="row">
        <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
        <input type="hidden" name="action" value="setup">
        <label>Password
          <input type="password" name="password" required minlength="10" autocomplete="new-password" autofocus>
        </label>
        <label>Repeat password
          <input type="password" name="confirm" required minlength="10" autocomplete="new-password">
        </label>
        <button type="submit">Save password</button>
      </form>
    </section>
  <?php elseif (!$loggedIn): ?>
    <section class="panel">
      <h2>Sign in</h2>
      <p class="hint">The password you chose on first run.</p>
      <form method="post" class="row">
        <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
        <input type="hidden" name="action" value="login">
        <label>Password
          <input type="password" name="password" required autocomplete="current-password" autofocus>
        </label>
        <button type="submit">Sign in</button>
      </form>
    </section>
  <?php else: ?>
    <?php if ($restored > 0): ?>
      <p class="msg">
        Restored <?= $restored === 1 ? '1 image' : $restored . ' images' ?> that a deploy had replaced
        — <code><?= h(FTC_MANIFEST) ?></code> lists them again.
      </p>
    <?php endif; ?>
    <?php if ($restoreProblem !== null): ?>
      <p class="msg error">Could not republish <?= h(FTC_MANIFEST) ?>: <?= h($restoreProblem) ?></p>
    <?php endif; ?>

    <section class="panel">
      <h2>Library</h2>
      <p class="stats">
        <span><strong><?= count($teams) ?></strong> teams</span>
        <span><strong><?= $imageCount ?></strong> images</span>
        <span><strong><?= h(ftc_format_bytes($imageBytes)) ?></strong> on disk</span>
        <span>manifest <a href="<?= h($manifestUrl) ?>"><code><?= h(FTC_MANIFEST) ?></code></a></span>
      </p>
      <?php if ($problems !== []): ?>
        <p class="hint warn">
          Not writable: <?= h(implode(', ', $problems)) ?>. Set those folders to 755 (or 775) in
          cPanel → File Manager → Permissions, then reload.
        </p>
      <?php endif; ?>
      <?php if (!$hasGd): ?>
        <p class="hint warn">
          The GD extension is off, so uploads cannot be processed. Enable it in cPanel → Select PHP
          Version → Extensions.
        </p>
      <?php endif; ?>
    </section>

    <?php if ($unlisted !== []): ?>
      <section class="panel">
        <h2>Unlisted images</h2>
        <?php if ($restorable !== []): ?>
          <p class="hint">
            <code>media/</code> holds <?= count($restorable) ?>
            image<?= count($restorable) === 1 ? '' : 's' ?> the manifest does not list — usually what a
            deploy that replaced <code><?= h(FTC_MANIFEST) ?></code> leaves behind. Restoring re-adds
            them and leaves every slot that is already filled alone.
          </p>
          <form method="post" class="row">
            <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
            <input type="hidden" name="action" value="rebuild">
            <button type="submit">
              Restore <?= count($restorable) === 1 ? 'image' : count($restorable) . ' images' ?>
            </button>
          </form>
        <?php endif; ?>
        <?php if ($duplicates > 0): ?>
          <p class="hint<?= $restorable === [] ? '' : ' warn' ?>">
            Already filled: <?= $duplicates ?> file<?= $duplicates === 1 ? '' : 's' ?> in
            <code>media/</code> that a restore will not touch. Delete
            <?= $duplicates === 1 ? 'it' : 'them' ?> in cPanel if
            <?= $duplicates === 1 ? 'it is' : 'they are' ?> dead.
          </p>
        <?php endif; ?>
      </section>
    <?php endif; ?>

    <section class="panel">
      <h2>Upload</h2>
      <p class="hint">
        Search a team by name or number, then drop the logo, the robot photo, or both onto the cards
        below and press Upload once. Images are re-encoded and scaled on the server (logos to fit
        128 px, robot photos to fit 480 px) and stored in <code>media/</code>; replacing one deletes
        the file it replaced.
      </p>
      <form method="post" enctype="multipart/form-data" class="upload" id="upload-form">
        <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
        <input type="hidden" name="action" value="upload">

        <div class="search">
          <label for="team-input">Team — number or name</label>
          <input type="text" id="team-input" name="team" autocomplete="off" spellcheck="false"
                 placeholder="10136, or start typing Frost Robo…" required pattern="\d{1,6}"
                 title="Pick a team from the suggestions — the field has to hold its number."
                 value="<?= h((string) ($_POST['team'] ?? '')) ?>">
          <ul class="suggest" id="suggest" hidden></ul>
          <p class="resolved" id="resolved" aria-live="polite"></p>
        </div>

        <div class="uploads" id="dropzone">
          <div class="upload-card" data-kind="logo">
            <h3>Team logo</h3>
            <p class="hint">Square and transparent works best. One logo per team.</p>
            <input type="file" name="logo" accept="image/png,image/jpeg,image/webp,image/gif"
                   aria-label="Team logo image">
            <p class="picked" data-picked>Drop a logo image on this card, or choose a file.</p>
          </div>

          <div class="upload-card" data-kind="robot">
            <h3>Robot photo</h3>
            <p class="hint">Cut-out PNGs work best. One photo per team per season.</p>
            <label for="season-select">Season</label>
            <select id="season-select" name="season">
              <?php foreach ($seasonChoices as $season): ?>
                <option value="<?= h((string) $season) ?>"<?= $season === ftc_season_now() ? ' selected' : '' ?>>
                  <?= h(ftc_season_label($season)) ?>
                </option>
              <?php endforeach; ?>
              <option value="">Every season (older behaviour)</option>
            </select>
            <input type="file" name="robot" accept="image/png,image/jpeg,image/webp,image/gif"
                   aria-label="Robot photo">
            <p class="picked" data-picked>Drop a robot photo on this card, or choose a file.</p>
          </div>
        </div>

        <div class="upload-submit">
          <button type="submit">Upload</button>
          <p class="hint" id="upload-status" aria-live="polite">
            Drop a file on a card, or click a card's picker, then upload — both together if you like.
          </p>
        </div>
      </form>
    </section>

    <section class="panel">
      <h2>Stored images</h2>
      <?php if ($teams === []): ?>
        <p class="empty">Nothing yet — upload a logo or robot photo above.</p>
      <?php else: ?>
        <div class="teams">
          <?php foreach ($teams as $number => $entry): ?>
            <?php if (!is_array($entry)) { continue; } ?>
            <div class="team">
              <h3 data-team="<?= h((string) $number) ?>">Team <?= h((string) $number) ?></h3>
              <div class="images">
                <?php foreach (ftc_team_images($entry) as $image): ?>
                  <div class="image">
                    <?php if (ftc_is_image_source($image['path'])): ?>
                      <img src="<?= h(str_starts_with($image['path'], 'media/') ? '../' . $image['path'] : $image['path']) ?>" alt="">
                    <?php endif; ?>
                    <span><?= h($image['label']) ?></span>
                    <?php if (str_starts_with($image['path'], 'media/')): ?>
                      <code><?= h(substr($image['path'], 6)) ?></code>
                    <?php else: ?>
                      <code>inline image</code>
                    <?php endif; ?>
                    <form method="post">
                      <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
                      <input type="hidden" name="action" value="delete">
                      <input type="hidden" name="team" value="<?= h((string) $number) ?>">
                      <input type="hidden" name="kind" value="<?= h($image['kind']) ?>">
                      <input type="hidden" name="season" value="<?= h($image['season']) ?>">
                      <button class="danger" type="submit">Delete</button>
                    </form>
                  </div>
                <?php endforeach; ?>
              </div>
            </div>
          <?php endforeach; ?>
        </div>
      <?php endif; ?>
    </section>
  <?php endif; ?>

  <p class="hint">
    This page only exists on a PHP host (InMotion/cPanel). The dashboard reads
    <code>shared-assets.json</code> and falls back to whatever users upload in their own browser.
    The library is also kept in <code>admin/data/library.json</code>, which a deploy never ships, so
    opening this page republishes a manifest that a deploy replaced.
  </p>
</main>

<?php if ($loggedIn): ?>
<script>
// Team lookup against FTC Scout. Numbers are authoritative for the upload; names are only a way to
// find the number, so the field always ends up holding digits.
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
      button.addEventListener('click', () => {
        input.value = String(team.number);
        resolved.textContent = describe(team);
        close();
        input.focus();
      });
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
      // Already a number: confirm the team rather than offering a list of one.
      resolved.textContent = 'Looking up team ' + text + '…';
      close();
    }

    timer = setTimeout(async () => {
      try {
        if (/^\d+$/.test(text)) {
          const data = await ask(LOOKUP, { number: Number(text) });
          if (mine !== seq) return;
          resolved.textContent = data.teamByNumber ? describe(data.teamByNumber) : 'No team with that number.';
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
    if (event.key === 'Enter' && !list.hidden) {
      // Enter belongs to the suggestion list while it is open, not to the first upload button.
      event.preventDefault();
      list.querySelector('button')?.click();
    }
  });
  document.addEventListener('click', (event) => {
    if (!list.contains(event.target) && event.target !== input) close();
  });

  if (input.value.trim() !== '') schedule();

  // Name the teams already in the library, one aliased request for all of them.
  const headings = [...document.querySelectorAll('h3[data-team]')];
  if (headings.length > 0) {
    const fields = headings
      .slice(0, 40)
      .map((h, at) => `t${at}: teamByNumber(number: ${Number(h.dataset.team)}) { number name }`)
      .join('\n');
    ask(`query Names { ${fields} }`, {})
      .then((data) => {
        headings.slice(0, 40).forEach((h, at) => {
          const team = data[`t${at}`];
          if (team && team.name) h.textContent = `${team.number} · ${team.name}`;
        });
      })
      .catch(() => { /* numbers alone are fine */ });
  }
})();

// Drag and drop: a file dropped on a card fills that card's input, a two-file drop is split
// between the cards, and the single Upload button sends whatever is filled.
(() => {
  const form = document.getElementById('upload-form');
  if (!form || typeof DataTransfer !== 'function') return;

  const status = document.getElementById('upload-status');
  const grid = document.getElementById('dropzone');
  const cards = [...form.querySelectorAll('.upload-card')];
  const inputs = {
    logo: form.querySelector('input[name=logo]'),
    robot: form.querySelector('input[name=robot]'),
  };
  if (!inputs.logo || !inputs.robot) return;

  const say = (message, warn) => {
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('warn', Boolean(warn));
  };

  // The server renders the "nothing chosen yet" wording, so reuse it instead of repeating it.
  const idle = status ? status.textContent.trim().replace(/\s+/g, ' ') : '';

  const isImage = (file) =>
    file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(file.name);

  const note = (kind) => cards.find((card) => card.dataset.kind === kind)?.querySelector('[data-picked]');

  const refresh = (kind) => {
    const line = note(kind);
    if (!line) return;
    // The server renders the "nothing chosen" wording, so keep it rather than repeating it here.
    if (!line.dataset.empty) line.dataset.empty = line.textContent.trim();
    const chosen = inputs[kind].files && inputs[kind].files[0];
    line.textContent = chosen ? chosen.name : line.dataset.empty;
    line.classList.toggle('picked--set', Boolean(chosen));
  };

  const setFile = (kind, file) => {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    inputs[kind].files = transfer.files;
    refresh(kind);
  };

  const others = (kind) => (kind === 'logo' ? 'robot' : 'logo');

  const ready = () => {
    const filled = ['logo', 'robot'].filter((kind) => inputs[kind].files.length > 0).length;
    if (filled === 0) say(idle);
    else if (filled === 2) say('Logo and robot photo ready — press Upload.');
    else say('Ready — press Upload.');
  };

  // Two files on one card: the one named after this card stays, the other goes to the other card.
  const routeToCard = (files, kind) => {
    const images = [...files].filter(isImage);
    if (images.length === 0) {
      say('Images only, please: PNG, JPEG, WebP or GIF.', true);
      return;
    }
    if (images.length === 1) {
      setFile(kind, images[0]);
      ready();
      return;
    }

    const mine = images.find((file) => file.name.toLowerCase().includes(kind)) || images[0];
    const rest = images.filter((file) => file !== mine);
    setFile(kind, mine);
    setFile(others(kind), rest[0]);
    if (rest.length > 1) say('Only a logo and one robot photo go up at once.', true);
    else ready();
  };

  // Dropping between the cards: names that say "logo" or "robot" win, then the empty slots fill.
  const routeToForm = (files) => {
    const pending = [...files].filter(isImage);
    if (pending.length === 0) {
      say('Images only, please: PNG, JPEG, WebP or GIF.', true);
      return;
    }

    for (const kind of ['logo', 'robot']) {
      const at = pending.findIndex((file) => file.name.toLowerCase().includes(kind));
      if (at !== -1) setFile(kind, pending.splice(at, 1)[0]);
    }

    const order = ['logo', 'robot'].filter((kind) => inputs[kind].files.length === 0).concat(['logo', 'robot']);
    for (const kind of order) {
      if (pending.length === 0) break;
      setFile(kind, pending.shift());
    }

    if (pending.length > 0) say('Only a logo and one robot photo go up at once.', true);
    else ready();
  };

  const highlight = (card, on) => card.classList.toggle('drop-target', on);

  for (const card of cards) {
    const kind = card.dataset.kind;
    if (kind !== 'logo' && kind !== 'robot') continue;

    card.addEventListener('dragover', (event) => {
      if (!event.dataTransfer || ![...event.dataTransfer.types].includes('Files')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      highlight(card, true);
    });
    card.addEventListener('dragleave', (event) => {
      if (card.contains(event.relatedTarget)) return;
      highlight(card, false);
    });
    card.addEventListener('drop', (event) => {
      event.preventDefault();
      event.stopPropagation();
      highlight(card, false);
      routeToCard(event.dataTransfer.files, kind);
    });
    inputs[kind].addEventListener('change', () => {
      refresh(kind);
      ready();
    });
    refresh(kind);
  }

  if (grid) {
    // A file has to land somewhere, so accept it anywhere in the upload area rather than letting
    // the browser navigate away to the dropped image.
    grid.addEventListener('dragover', (event) => {
      if (!event.dataTransfer || ![...event.dataTransfer.types].includes('Files')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    });
    grid.addEventListener('drop', (event) => {
      event.preventDefault();
      routeToForm(event.dataTransfer.files);
    });
  }
})();
</script>
<?php endif; ?>
</body>
</html>
