<?php

declare(strict_types=1);

// Self-check for AccessPolicy. Run: php tests/policy_test.php  (exits non-zero on failure)
$root = dirname(__DIR__);
require_once $root . '/src/GatewayException.php';
require_once $root . '/src/AccessPolicy.php';

$config = ['port' => 8787, 'token' => 'secret', 'max_path_length' => 2048];
$routes = [
    'internal-app' => ['upstream' => 'http://10.243.210.86', 'enabled' => true, 'allowed_methods' => ['GET', 'HEAD']],
    'off' => ['upstream' => 'http://10.0.0.5', 'enabled' => false, 'allowed_methods' => ['GET']],
];
$policy = new AccessPolicy($config, $routes);
$failures = 0;

function expectStatus(int $status, callable $fn, string $label): void
{
    global $failures;
    try {
        $fn();
        echo "FAIL $label: no exception\n";
        $failures++;
    } catch (GatewayException $e) {
        if ($e->status !== $status) {
            echo "FAIL $label: got {$e->status}, want $status\n";
            $failures++;
        }
    }
}

function expectOk(callable $fn, string $label): void
{
    global $failures;
    try {
        $fn();
    } catch (GatewayException $e) {
        echo "FAIL $label: {$e->getMessage()}\n";
        $failures++;
    }
}

// Path traversal in every encoding
foreach (['/a/../b', '/%2e%2e/etc', '/a/%2E%2E/b', '/%252e%252e/x', '/a%2f..%2fb', '/a\\b', "/a\0b", '/a b', '//evil.com'] as $p) {
    expectStatus(400, fn() => $policy->validatePath($p), "path $p");
}
expectOk(fn() => $policy->validatePath('/app/index.html'), 'normal path');
expectOk(fn() => $policy->validatePath('/a.b/c-d_e'), 'dots inside names');
expectStatus(414, fn() => $policy->validatePath('/' . str_repeat('a', 3000)), 'long path');

// Host, origin, client, token
expectOk(fn() => $policy->assertHost('127.0.0.1:8787'), 'host ok');
expectStatus(403, fn() => $policy->assertHost('evil.com:8787'), 'rebinding host');
expectStatus(403, fn() => $policy->assertHost('127.0.0.1:9999'), 'wrong port');
expectStatus(403, fn() => $policy->assertOrigin(['HTTP_ORIGIN' => 'https://evil.com']), 'foreign origin');
expectStatus(403, fn() => $policy->assertOrigin(['HTTP_SEC_FETCH_SITE' => 'cross-site']), 'cross-site');
expectOk(fn() => $policy->assertOrigin([]), 'no origin');
expectStatus(403, fn() => $policy->assertLocalClient(['REMOTE_ADDR' => '192.168.1.5']), 'lan client');
expectStatus(401, fn() => $policy->assertToken('wrong'), 'bad token');
expectStatus(401, fn() => $policy->assertToken(''), 'missing token');
expectOk(fn() => $policy->assertToken('secret'), 'good token');
expectStatus(503, fn() => (new AccessPolicy(['token' => ''] + $config, $routes))->assertToken(''), 'empty configured token fails closed');

// Routes and methods
expectStatus(404, fn() => $policy->route('nope'), 'unknown route');
expectStatus(404, fn() => $policy->route('off'), 'disabled route');
expectStatus(404, fn() => $policy->route('http://evil.com'), 'url as route');
expectStatus(405, fn() => $policy->assertMethod($routes['internal-app'], 'POST'), 'POST blocked');
expectOk(fn() => $policy->assertMethod($routes['internal-app'], 'GET'), 'GET allowed');

// Header allowlist
$lines = $policy->forwardHeaders(['HTTP_COOKIE' => 'sid=1', 'HTTP_AUTHORIZATION' => 'Bearer x', 'HTTP_X_GATEWAY_TOKEN' => 'secret', 'HTTP_ACCEPT' => 'text/html']);
if ($lines !== ['Accept: text/html']) {
    echo "FAIL headers: " . json_encode($lines) . "\n";
    $failures++;
}

// Static config validation
$bad = new AccessPolicy($config, [
    'a' => ['upstream' => 'http://127.0.0.1', 'enabled' => true, 'allowed_methods' => ['GET']],
    'b' => ['upstream' => 'ftp://10.0.0.1', 'enabled' => true, 'allowed_methods' => ['GET']],
    'c' => ['upstream' => 'http://user:pw@10.0.0.1', 'enabled' => true, 'allowed_methods' => ['GET']],
    'd' => ['upstream' => 'http://10.0.0.1/path', 'enabled' => true, 'allowed_methods' => ['GET']],
    'e' => ['upstream' => 'http://10.0.0.1', 'enabled' => true, 'allowed_methods' => ['TRACE']],
]);
if (count($bad->routeConfigErrors()) !== 5 || $policy->routeConfigErrors() !== []) {
    echo "FAIL route config validation: " . json_encode($bad->routeConfigErrors()) . "\n";
    $failures++;
}

echo $failures === 0 ? "All checks passed\n" : "$failures check(s) failed\n";
exit($failures === 0 ? 0 : 1);
