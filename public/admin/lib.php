<?php
declare(strict_types=1);

/**
 * Server-side asset library for the InMotion/cPanel deployment.
 *
 * It writes the same shared-assets.json the static admin (#/admin) produces, but stores the images
 * as files under media/ and references them by path, so the manifest stays small and the browser can
 * cache each image. Nothing here runs on GitHub Pages — there the committed JSON file is used.
 */

const FTC_MANIFEST = 'shared-assets.json';
const FTC_TEAM_PATTERN = '/^\d{1,6}$/';
const FTC_KINDS = ['logo', 'robot'];
const FTC_MAX_UPLOAD = 8 * 1024 * 1024;
/** Logos draw at 26 CSS px and robots at ~190, so these boxes cover 4× density without waste. */
const FTC_MAX_BOX = ['logo' => 128, 'robot' => 480];

function ftc_root(): string
{
    return dirname(__DIR__);
}

function ftc_data_dir(): string
{
    return __DIR__ . '/data';
}

function ftc_media_dir(): string
{
    return ftc_root() . '/media';
}

function ftc_manifest_path(): string
{
    return ftc_root() . '/' . FTC_MANIFEST;
}

function ftc_config_path(): string
{
    return ftc_data_dir() . '/config.php';
}

/** Writes next to the target and renames, so a half-written file is never served. */
function ftc_put(string $path, string $contents): void
{
    $dir = dirname($path);
    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) {
        throw new RuntimeException('Could not create ' . basename($dir) . '/.');
    }
    $tmp = $path . '.tmp';
    if (@file_put_contents($tmp, $contents, LOCK_EX) === false) {
        throw new RuntimeException('Could not write ' . basename($path) . ' — check folder permissions.');
    }
    if (!@rename($tmp, $path)) {
        @unlink($tmp);
        throw new RuntimeException('Could not replace ' . basename($path) . '.');
    }
}

/** @return array{hash: string, created: string}|null */
function ftc_config(): ?array
{
    if (!is_file(ftc_config_path())) {
        return null;
    }
    /** @noinspection PhpIncludeInspection */
    $config = include ftc_config_path();
    return is_array($config) && isset($config['hash']) ? $config : null;
}

function ftc_set_password(string $password): void
{
    $config = ['hash' => password_hash($password, PASSWORD_DEFAULT), 'created' => gmdate('c')];
    $php = "<?php\n// Written by admin/index.php - keep this folder out of the web and out of git.\n"
        . 'return ' . var_export($config, true) . ";\n";
    ftc_put(ftc_config_path(), $php);
}

/** Reads the manifest as a teams map, accepting either the envelope or a bare map. */
function ftc_teams(): array
{
    $path = ftc_manifest_path();
    if (!is_file($path)) {
        return [];
    }
    $decoded = json_decode((string) @file_get_contents($path), true);
    if (!is_array($decoded)) {
        return [];
    }
    $teams = $decoded['teams'] ?? $decoded;
    return is_array($teams) ? $teams : [];
}

function ftc_save_teams(array $teams): void
{
    ksort($teams, SORT_NUMERIC);
    $payload = [
        'app' => 'ftcdash',
        'version' => 1,
        'exportedAt' => gmdate('c'),
        'teams' => (object) $teams,
    ];
    $json = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        throw new RuntimeException('Could not encode the manifest.');
    }
    ftc_put(ftc_manifest_path(), $json . "\n");
}

/**
 * Whether a manifest value is safe to render in an <img src>. Mirrors the browser's rule: an image
 * data URL, an http(s) URL, or a relative path - never another scheme (javascript:, blob:, ...).
 */
function ftc_is_image_source(string $value): bool
{
    $value = trim($value);
    if ($value === '') {
        return false;
    }
    if (stripos($value, 'data:') === 0) {
        return stripos($value, 'data:image/') === 0;
    }
    return preg_match('~^[a-z][a-z0-9+.-]*:~i', $value) !== 1;
}

function ftc_format_bytes(int $bytes): string
{
    if ($bytes >= 1024 * 1024) {
        return number_format($bytes / (1024 * 1024), 1) . ' MB';
    }
    if ($bytes >= 1024) {
        return number_format($bytes / 1024, 0) . ' KB';
    }
    return $bytes . ' B';
}

function ftc_season_now(): int
{
    // FTC seasons are named for the calendar year the game launches (Sept-Apr).
    return (int) date('n') >= 8 ? (int) date('Y') : (int) date('Y') - 1;
}

/**
 * Re-encodes an upload through GD (which also strips anything hidden in the file) and stores it
 * under media/. Returns the path to record in the manifest, relative to the site root.
 *
 * @param array{name?: string, tmp_name?: string, error?: int, size?: int} $file
 */
function ftc_store_image(array $file, string $team, string $kind, ?int $season): string
{
    $error = $file['error'] ?? UPLOAD_ERR_NO_FILE;
    if ($error === UPLOAD_ERR_INI_SIZE || $error === UPLOAD_ERR_FORM_SIZE) {
        throw new RuntimeException('That image is larger than the server accepts (8 MB).');
    }
    if ($error !== UPLOAD_ERR_OK) {
        throw new RuntimeException('No image arrived - pick a file and try again.');
    }
    if (($file['size'] ?? 0) > FTC_MAX_UPLOAD) {
        throw new RuntimeException('That image is larger than 8 MB.');
    }
    $tmp = (string) ($file['tmp_name'] ?? '');
    if ($tmp === '' || !is_uploaded_file($tmp)) {
        throw new RuntimeException('That upload could not be verified.');
    }
    if (!function_exists('imagecreatefromstring')) {
        throw new RuntimeException('This server has no GD extension, so images cannot be processed.');
    }

    $info = @getimagesize($tmp);
    $mime = is_array($info) ? ($info['mime'] ?? '') : '';
    $extensions = ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp', 'image/gif' => 'gif'];
    if (!isset($extensions[$mime])) {
        throw new RuntimeException('Use a PNG, JPEG, WebP or GIF image.');
    }

    $source = @imagecreatefromstring((string) file_get_contents($tmp));
    if ($source === false) {
        throw new RuntimeException('That image could not be read.');
    }

    $width = imagesx($source);
    $height = imagesy($source);
    $box = FTC_MAX_BOX[$kind] ?? FTC_MAX_BOX['robot'];
    $scale = min(1.0, $box / max($width, $height, 1));
    $targetWidth = max(1, (int) round($width * $scale));
    $targetHeight = max(1, (int) round($height * $scale));

    if ($targetWidth !== $width || $targetHeight !== $height) {
        $scaled = imagescale($source, $targetWidth, $targetHeight, IMG_BILINEAR_FIXED);
        if ($scaled !== false) {
            imagedestroy($source);
            $source = $scaled;
        }
    }

    // Transparency survives for the formats that carry it; JPEG stays JPEG to keep photos small.
    $keepAlpha = $mime !== 'image/jpeg';
    if ($keepAlpha) {
        imagealphablending($source, false);
        imagesavealpha($source, true);
    }

    ob_start();
    if ($keepAlpha) {
        imagepng($source, null, 6);
        $extension = 'png';
    } else {
        imagejpeg($source, null, 85);
        $extension = 'jpg';
    }
    $binary = (string) ob_get_clean();
    imagedestroy($source);

    if ($binary === '') {
        throw new RuntimeException('That image could not be encoded.');
    }

    $name = $team . '-' . $kind . ($season !== null ? '-' . $season : '') . '-' . bin2hex(random_bytes(4)) . '.' . $extension;
    $target = ftc_media_dir() . '/' . $name;
    if (@file_put_contents($target, $binary) === false) {
        throw new RuntimeException('Could not save the image - check that media/ is writable.');
    }

    return 'media/' . $name;
}

/** Deletes a stored image, but only one this library owns (a path inside media/). */
function ftc_delete_image(string $relative): void
{
    if (!str_starts_with($relative, 'media/')) {
        return;
    }
    $media = realpath(ftc_media_dir());
    $file = realpath(ftc_root() . '/' . $relative);
    if ($media === false || $file === false || !str_starts_with($file, $media . DIRECTORY_SEPARATOR)) {
        return;
    }
    @unlink($file);
}

/**
 * Images the manifest records for one team.
 *
 * @return list<array{label: string, path: string, kind: string, season: string}>
 */
function ftc_team_images(array $entry): array
{
    $images = [];
    if (isset($entry['logo']) && is_string($entry['logo'])) {
        $images[] = ['label' => 'logo', 'path' => $entry['logo'], 'kind' => 'logo', 'season' => ''];
    }
    if (isset($entry['robot']) && is_string($entry['robot'])) {
        $images[] = ['label' => 'robot · every season', 'path' => $entry['robot'], 'kind' => 'robot', 'season' => ''];
    }
    foreach (($entry['robots'] ?? []) as $season => $path) {
        if (is_string($path)) {
            $images[] = ['label' => 'robot · ' . $season, 'path' => $path, 'kind' => 'robot', 'season' => (string) $season];
        }
    }
    return $images;
}

/** @return array{0: int, 1: int} image count and bytes on disk */
function ftc_count_images(array $teams): array
{
    $count = 0;
    $bytes = 0;
    foreach ($teams as $entry) {
        if (!is_array($entry)) {
            continue;
        }
        foreach (ftc_team_images($entry) as $image) {
            $count++;
            if (str_starts_with($image['path'], 'media/')) {
                $size = @filesize(ftc_root() . '/' . $image['path']);
                if ($size !== false) {
                    $bytes += $size;
                }
            }
        }
    }
    return [$count, $bytes];
}
