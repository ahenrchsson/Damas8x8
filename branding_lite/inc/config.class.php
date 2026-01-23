<?php

class PluginBrandingLiteConfig {
    private const MAX_FILE_SIZE = 2097152;

    public static function canConfigure(): bool {
        return Session::haveRight('config', UPDATE);
    }

    public static function showForm(): void {
        if (!self::canConfigure()) {
            Html::displayRightError();
            return;
        }

        $config = PluginBrandingLiteFavicon::getConfig();

        echo '<form method="post" enctype="multipart/form-data" action="' . htmlescape($_SERVER['PHP_SELF']) . '">';
        echo '<input type="hidden" name="_glpi_csrf_token" value="' . htmlescape(Session::getNewCSRFToken()) . '">';
        echo '<div class="center">';
        echo '<table class="tab_cadre_fixe">';
        echo '<tr><th colspan="2">' . __('Favicon', 'branding_lite') . '</th></tr>';
        echo '<tr class="tab_bg_1">';
        echo '<td>' . __('Upload image', 'branding_lite') . '</td>';
        echo '<td><input type="file" name="favicon" accept="image/*"></td>';
        echo '</tr>';

        if (!empty($config['favicon_filename'])) {
            echo '<tr class="tab_bg_1">';
            echo '<td>' . __('Current file', 'branding_lite') . '</td>';
            echo '<td>' . htmlescape(basename($config['favicon_filename'])) . '</td>';
            echo '</tr>';
        }

        echo '<tr class="tab_bg_2">';
        echo '<td class="center" colspan="2">';
        echo '<input type="submit" name="update" class="submit" value="' . __('Save') . '">';
        echo '</td>';
        echo '</tr>';
        echo '</table>';
        echo '</div>';
        echo '</form>';
    }

    public static function handleUpload(array $file): void {
        if (!self::canConfigure()) {
            Html::displayRightError();
            return;
        }

        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
                Session::addMessageAfterRedirect(__('Upload failed.', 'branding_lite'), false, ERROR);
            }
            return;
        }

        if (($file['size'] ?? 0) <= 0 || $file['size'] > self::MAX_FILE_SIZE) {
            Session::addMessageAfterRedirect(__('File too large or empty.', 'branding_lite'), false, ERROR);
            return;
        }

        $tmpPath = $file['tmp_name'] ?? '';
        if ($tmpPath === '' || !is_uploaded_file($tmpPath)) {
            Session::addMessageAfterRedirect(__('Invalid upload.', 'branding_lite'), false, ERROR);
            return;
        }

        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime = $finfo->file($tmpPath) ?: '';
        if ($mime === '' || strncmp($mime, 'image/', 6) !== 0) {
            Session::addMessageAfterRedirect(__('Only image files are allowed.', 'branding_lite'), false, ERROR);
            return;
        }

        $extension = strtolower(pathinfo($file['name'] ?? '', PATHINFO_EXTENSION));
        $extension = preg_replace('/[^a-z0-9]+/', '', $extension);
        if ($extension === '') {
            $extension = self::guessExtensionFromMime($mime);
        }
        if ($extension === '') {
            $extension = 'img';
        }

        $uploadDir = PluginBrandingLiteFavicon::getUploadDir();
        if (!is_dir($uploadDir) && !mkdir($uploadDir, 0750, true) && !is_dir($uploadDir)) {
            Session::addMessageAfterRedirect(__('Upload directory is not writable.', 'branding_lite'), false, ERROR);
            return;
        }

        $filename = 'favicon.' . $extension;
        $targetPath = rtrim($uploadDir, '/') . '/' . $filename;
        if (!move_uploaded_file($tmpPath, $targetPath)) {
            Session::addMessageAfterRedirect(__('Unable to save file.', 'branding_lite'), false, ERROR);
            return;
        }

        $relativePath = PluginBrandingLiteFavicon::UPLOAD_SUBDIR . '/' . $filename;
        $config = [
            'favicon_filename' => $relativePath,
            'favicon_mime'     => $mime,
            'favicon_version'  => time(),
        ];

        Config::setConfigurationValues(PluginBrandingLiteFavicon::CONFIG_NAMESPACE, $config);
        Session::addMessageAfterRedirect(__('Favicon updated.', 'branding_lite'));
    }

    private static function guessExtensionFromMime(string $mime): string {
        $map = [
            'image/png'  => 'png',
            'image/jpeg' => 'jpg',
            'image/jpg'  => 'jpg',
            'image/gif'  => 'gif',
            'image/webp' => 'webp',
            'image/svg+xml' => 'svg',
            'image/x-icon' => 'ico',
            'image/vnd.microsoft.icon' => 'ico',
        ];

        return $map[$mime] ?? '';
    }
}
