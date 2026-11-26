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
    $path = strtok((string) ($_SERVER['REQUEST_URI'] ?? '/admin/'), '?');
    // The editor keeps the team it is working on in the query string, so a redirect that dropped it
    // would dump the user back on an empty form after every upload or delete.
    $params = [];
    foreach (['team', 'season'] as $name) {
        $value = $_POST[$name] ?? $_GET[$name] ?? null;
        if (is_string($value) && preg_match('/^\d{1,6}$/', $value) === 1) {
            $params[$name] = $value;
        }
    }
    $query = $params === [] ? '' : '?' . http_build_query($params);
    header('Location: ' . $path . $query, true, 303);
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

// The editor works on one team at a time. The query string carries that choice, so a reload, a
// delete or an upload all come back to the same team and season instead of an empty form.
$editTeam = null;
if (isset($_GET['team']) && preg_match('/^\d{1,6}$/', (string) $_GET['team']) === 1) {
    $editTeam = (string) $_GET['team'];
}
$editSeason = isset($_GET['season']) && preg_match('/^\d{4}$/', (string) $_GET['season']) === 1
    ? (int) $_GET['season']
    : ftc_season_now();
$editEntry = $editTeam !== null && is_array($teams[$editTeam] ?? null) ? $teams[$editTeam] : [];

require __DIR__ . '/view.php';

