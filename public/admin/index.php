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
                throw new RuntimeException('Enter a team number (digits only).');
            }
            if (!in_array($kind, FTC_KINDS, true)) {
                throw new RuntimeException('Choose a logo or a robot photo.');
            }
            $season = null;
            if ($kind === 'robot' && $seasonRaw !== '') {
                if (!preg_match('/^\d{4}$/', $seasonRaw)) {
                    throw new RuntimeException('A season is a four-digit year, e.g. 2026.');
                }
                $season = (int) $seasonRaw;
            }

            $path = ftc_store_image($_FILES['image'] ?? [], $team, $kind, $season);

            $teams = ftc_teams();
            $entry = is_array($teams[$team] ?? null) ? $teams[$team] : [];
            // Drop the image this one replaces, so media/ never accumulates dead files.
            $previous = $kind === 'logo'
                ? ($entry['logo'] ?? null)
                : ($season === null ? ($entry['robot'] ?? null) : ($entry['robots'][(string) $season] ?? null));
            if (is_string($previous)) {
                ftc_delete_image($previous);
            }

            if ($kind === 'logo') {
                $entry['logo'] = $path;
            } elseif ($season === null) {
                $entry['robot'] = $path;
            } else {
                $entry['robots'] = is_array($entry['robots'] ?? null) ? $entry['robots'] : [];
                $entry['robots'][(string) $season] = $path;
            }
            $teams[$team] = $entry;
            ftc_save_teams($teams);
            flash('Saved ' . ($kind === 'logo' ? 'logo' : 'robot photo') . ' for team ' . $team . '.');
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
[$imageCount, $imageBytes] = ftc_count_images($teams);

$writable = [
    'the manifest' => is_writable(dirname(ftc_manifest_path())),
    'media/' => is_writable(ftc_media_dir()) || !is_dir(ftc_media_dir()),
    'admin/data/' => is_writable(ftc_data_dir()) || !is_dir(ftc_data_dir()),
];
$problems = array_keys(array_filter($writable, static fn (bool $ok): bool => !$ok));
$hasGd = function_exists('imagecreatefromstring');
$manifestUrl = '../' . FTC_MANIFEST;
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

    <section class="panel">
      <h2>Upload</h2>
      <p class="hint">
        The image is re-encoded and scaled on the server (logos to fit 128 px, robot photos to fit
        480 px) and stored in <code>media/</code>. Replacing an image deletes the file it replaces.
      </p>
      <form method="post" enctype="multipart/form-data" class="row">
        <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
        <input type="hidden" name="action" value="upload">
        <label>Team
          <input type="text" name="team" inputmode="numeric" placeholder="10136" required
                 pattern="\d{1,6}" value="<?= h((string) ($_POST['team'] ?? '')) ?>">
        </label>
        <label>Image
          <select name="kind">
            <option value="logo">Team logo</option>
            <option value="robot">Robot photo</option>
          </select>
        </label>
        <label>Season (robot only)
          <input type="text" name="season" inputmode="numeric" placeholder="<?= h((string) ftc_season_now()) ?>"
                 pattern="\d{4}" title="Four digits, or blank for every season">
        </label>
        <label>File
          <input type="file" name="image" accept="image/png,image/jpeg,image/webp,image/gif" required>
        </label>
        <button type="submit">Upload</button>
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
              <h3>Team <?= h((string) $number) ?></h3>
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
  </p>
</main>
</body>
</html>
