<?php

require_once '../../../inc/includes.php';
require_once '../inc/favicon.class.php';

$config = PluginBrandingLiteFavicon::getConfig();
$path = PluginBrandingLiteFavicon::getAbsolutePath();

if ($path === '' || !is_file($path)) {
    header('HTTP/1.1 404 Not Found');
    header('Cache-Control: public, max-age=300');
    return;
}

$mime = $config['favicon_mime'] ?? 'image/x-icon';
header('Content-Type: ' . $mime);
header('Cache-Control: public, max-age=86400');
header('X-Content-Type-Options: nosniff');

$handle = fopen($path, 'rb');
if ($handle === false) {
    header('HTTP/1.1 404 Not Found');
    return;
}

fpassthru($handle);
if (is_resource($handle)) {
    fclose($handle);
}
