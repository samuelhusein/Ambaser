<?php

declare(strict_types=1);

$root = dirname(__DIR__);

// Real environment variables win over .env, so the Electron app can pass an ephemeral token at launch.
$fileEnv = [];
$envFile = $root . '/.env';
if (is_readable($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
            continue;
        }
        [$key, $value] = explode('=', $line, 2);
        $fileEnv[trim($key)] = trim($value, " \t\"'");
    }
}

$env = static function (string $key, string $default = '') use ($fileEnv): string {
    $value = getenv($key);
    return $value !== false ? $value : ($fileEnv[$key] ?? $default);
};

return [
    'host' => '127.0.0.1',
    'port' => (int) $env('GATEWAY_PORT', '8787'),
    'token' => $env('GATEWAY_TOKEN'),
    'proxy' => $env('CORPORATE_PROXY'),
    'proxy_port' => (int) $env('CORPORATE_PROXY_PORT', '0'),
    'connect_timeout' => 5,
    'timeout' => 20,
    'max_request_bytes' => 1024 * 1024,
    'max_response_bytes' => 10 * 1024 * 1024,
    'max_path_length' => 2048,
    'log_dir' => $env('GATEWAY_LOG_DIR', $root . '/storage/logs'),
    'state_dir' => $env('GATEWAY_STATE_DIR', $root . '/storage'),
];
