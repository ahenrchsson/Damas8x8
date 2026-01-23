<?php

class PluginBrandingLiteFavicon {
    public const CONFIG_NAMESPACE = 'branding_lite';
    public const UPLOAD_SUBDIR = 'files/_uploads/branding_lite';

    public static function getConfig(): array {
        $config = Config::getConfigurationValues(self::CONFIG_NAMESPACE);

        return [
            'favicon_filename' => $config['favicon_filename'] ?? '',
            'favicon_mime'     => $config['favicon_mime'] ?? '',
            'favicon_version'  => $config['favicon_version'] ?? 0,
        ];
    }

    public static function getUploadDir(): string {
        return rtrim(GLPI_VAR_DIR, '/') . '/' . self::UPLOAD_SUBDIR;
    }

    public static function getAbsolutePath(): string {
        $config = self::getConfig();
        if ($config['favicon_filename'] === '') {
            return '';
        }

        return rtrim(GLPI_VAR_DIR, '/') . '/' . ltrim($config['favicon_filename'], '/');
    }

    public static function getFaviconUrl(): string {
        global $CFG_GLPI;
        $config = self::getConfig();
        if ($config['favicon_filename'] === '' || empty($config['favicon_version'])) {
            return '';
        }

        $base = rtrim($CFG_GLPI['root_doc'], '/');
        return $base . '/plugins/branding_lite/favicon.php?v=' . (int) $config['favicon_version'];
    }
}
