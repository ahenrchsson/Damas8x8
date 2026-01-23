<?php

require_once '../../../inc/includes.php';
require_once '../inc/favicon.class.php';
require_once '../inc/config.class.php';

Session::checkRight('config', UPDATE);

if (isset($_POST['update'])) {
    Session::checkCSRFToken();
    PluginBrandingLiteConfig::handleUpload($_FILES['favicon'] ?? []);
    Html::redirect($_SERVER['PHP_SELF']);
}

Html::header(__('Branding Lite', 'branding_lite'), $_SERVER['PHP_SELF'], 'config', 'plugins');

PluginBrandingLiteConfig::showForm();

Html::footer();
