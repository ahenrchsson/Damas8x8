<?php

require_once __DIR__ . '/inc/favicon.class.php';

function plugin_branding_lite_add_header(): void {
    $config = PluginBrandingLiteFavicon::getConfig();
    if (empty($config['favicon_filename']) || empty($config['favicon_mime'])) {
        return;
    }

    $url = PluginBrandingLiteFavicon::getFaviconUrl();
    if ($url === '') {
        return;
    }

    $escapedUrl = htmlescape($url);
    $escapedMime = htmlescape($config['favicon_mime']);

    echo '<link rel="icon" href="' . $escapedUrl . '" type="' . $escapedMime . '">';
    echo '<link rel="shortcut icon" href="' . $escapedUrl . '" type="' . $escapedMime . '">';
    echo '<link rel="apple-touch-icon" href="' . $escapedUrl . '">';
}
