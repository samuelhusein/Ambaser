<?php

declare(strict_types=1);

$root = dirname(__DIR__);
require_once $root . '/src/GatewayException.php';
require_once $root . '/src/Logger.php';
require_once $root . '/src/AccessPolicy.php';
require_once $root . '/src/ProxyService.php';

$config = require $root . '/config/app.php';
$routes = require $root . '/config/routes.php';

$logger = new Logger($config['log_dir'], $config['state_dir']);
$policy = new AccessPolicy($config, $routes);
$proxy = new ProxyService($config, $policy);

$started = microtime(true);
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$routeLabel = '-';
$status = 500;

function send(int $status, array $headers, string $body, string $method): void
{
    http_response_code($status);
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store', false);
    foreach ($headers as $name => $value) {
        header("$name: $value", false);
    }
    if ($method !== 'HEAD') {
        header('Content-Length: ' . strlen($body));
        echo $body;
    }
}

try {
    // Every request passes these checks before anything is routed. Order matters: cheap local checks first.
    $policy->assertLocalClient($_SERVER);
    $policy->assertHost($_SERVER['HTTP_HOST'] ?? '');
    $policy->assertOrigin($_SERVER);
    $policy->assertToken($_SERVER['HTTP_X_GATEWAY_TOKEN'] ?? '');

    $configErrors = $policy->routeConfigErrors();
    if ($configErrors) {
        throw new GatewayException(500, 'Invalid route configuration: ' . implode('; ', $configErrors));
    }

    $uri = (string) ($_SERVER['REQUEST_URI'] ?? '/');
    if ($uri === '' || $uri[0] !== '/') {
        throw new GatewayException(400, 'Invalid request target');
    }
    $queryAt = strpos($uri, '?');
    $path = $queryAt === false ? $uri : substr($uri, 0, $queryAt);
    $query = $queryAt === false ? '' : substr($uri, $queryAt + 1);

    if ($path === '/_health') {
        $routeLabel = '_health';
        $status = 200;
        send(200, ['Content-Type' => 'application/json'], json_encode(['status' => 'ok']), $method);
    } elseif ($path === '/_diag') {
        $routeLabel = '_diag';
        $status = 200;
        send(200, ['Content-Type' => 'text/html; charset=utf-8'], renderDiagnostics($config, $routes, $proxy, $logger), $method);
    } elseif (preg_match('#^/r/([^/]+)(/.*)?$#', $path, $match)) {
        $routeLabel = $match[1];
        $route = $policy->route($match[1]);
        $policy->assertMethod($route, $method);
        $upstreamPath = $policy->validatePath($match[2] ?? '/');
        $upstreamQuery = $policy->validateQuery($query);

        $body = null;
        if (!in_array($method, ['GET', 'HEAD'], true)) {
            $limit = (int) $config['max_request_bytes'];
            if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > $limit) {
                throw new GatewayException(413, 'Request body too large');
            }
            $body = (string) stream_get_contents(fopen('php://input', 'rb'), $limit + 1);
            if (strlen($body) > $limit) {
                throw new GatewayException(413, 'Request body too large');
            }
        }

        $result = $proxy->fetch($match[1], $route, $method, $upstreamPath, $upstreamQuery, $policy->forwardHeaders($_SERVER), $body);
        $status = $result['status'];
        send($status, $result['headers'], $result['body'], $method);
    } else {
        throw new GatewayException(404, 'Not found');
    }
    $logger->access(['route' => $routeLabel, 'method' => $method, 'status' => $status, 'duration_ms' => (int) ((microtime(true) - $started) * 1000)]);
} catch (GatewayException $e) {
    $status = $e->status;
    send($status, ['Content-Type' => 'text/plain; charset=utf-8'], $e->getMessage() . "\n", $method);
    $logger->access(['route' => $routeLabel, 'method' => $method, 'status' => $status, 'duration_ms' => (int) ((microtime(true) - $started) * 1000), 'error' => $e->getMessage()]);
}

function renderDiagnostics(array $config, array $routes, ProxyService $proxy, Logger $logger): string
{
    $h = static fn(string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
    $rows = '';
    foreach ($routes as $name => $route) {
        if (($route['enabled'] ?? false) !== true) {
            $state = 'disabled';
        } else {
            try {
                $r = $proxy->fetch((string) $name, $route, 'HEAD', '/', '', [], null, 3);
                $state = 'reachable (HTTP ' . $r['status'] . ')';
            } catch (GatewayException $e) {
                $state = 'unreachable: ' . $e->getMessage();
            }
        }
        $rows .= '<tr><td>' . $h((string) $name) . '</td><td>' . $h((string) $route['upstream']) . '</td><td>' . $h($state) . '</td></tr>';
    }
    $last = $logger->lastError();
    $proxyState = $config['proxy'] === '' ? 'not configured (direct connections)' : 'configured';
    $lastText = $last ? ($last['ts'] . ' ' . $last['route'] . ' ' . $last['status'] . ' ' . ($last['error'] ?? '')) : 'none';

    return '<!doctype html><meta charset="utf-8"><title>Gateway diagnostics</title>'
        . '<style>body{font:14px system-ui;margin:24px}td,th{padding:4px 12px;text-align:left}</style>'
        . '<h1>Gateway diagnostics</h1><ul>'
        . '<li>PHP service: running, PHP ' . $h(PHP_VERSION) . '</li>'
        . '<li>cURL extension: ' . (extension_loaded('curl') ? 'loaded' : 'MISSING') . '</li>'
        . '<li>Corporate proxy: ' . $h($proxyState) . '</li>'
        . '<li>Last connection error: ' . $h($lastText) . '</li></ul>'
        . '<h2>Approved destinations</h2><table><tr><th>Route</th><th>Upstream</th><th>Status</th></tr>' . $rows . '</table>';
}
