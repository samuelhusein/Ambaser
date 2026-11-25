<?php

declare(strict_types=1);

// Every decision about who may call the gateway and what they may ask for lives here.
final class AccessPolicy
{
    private const KNOWN_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'];

    // Only these browser headers are forwarded upstream. Cookie, Authorization, Origin, Referer and
    // the gateway token are deliberately absent.
    private const FORWARD_HEADERS = [
        'HTTP_ACCEPT' => 'Accept',
        'HTTP_ACCEPT_LANGUAGE' => 'Accept-Language',
        'HTTP_USER_AGENT' => 'User-Agent',
        'HTTP_RANGE' => 'Range',
        'HTTP_IF_NONE_MATCH' => 'If-None-Match',
        'HTTP_IF_MODIFIED_SINCE' => 'If-Modified-Since',
        'CONTENT_TYPE' => 'Content-Type',
    ];

    public function __construct(private array $config, private array $routes)
    {
    }

    public function assertLocalClient(array $server): void
    {
        if (!in_array($server['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)) {
            throw new GatewayException(403, 'Local clients only');
        }
    }

    // Blocks DNS rebinding: a page on another origin cannot make the browser send a different Host.
    public function assertHost(string $host): void
    {
        $port = (int) $this->config['port'];
        if (!in_array(strtolower($host), ["127.0.0.1:$port", "localhost:$port"], true)) {
            throw new GatewayException(403, 'Invalid Host header');
        }
    }

    public function assertOrigin(array $server): void
    {
        $port = (int) $this->config['port'];
        $origin = $server['HTTP_ORIGIN'] ?? null;
        if ($origin !== null && !in_array(strtolower($origin), ["http://127.0.0.1:$port", "http://localhost:$port"], true)) {
            throw new GatewayException(403, 'Cross-origin request refused');
        }
        $site = $server['HTTP_SEC_FETCH_SITE'] ?? null;
        if ($site !== null && !in_array($site, ['none', 'same-origin'], true)) {
            throw new GatewayException(403, 'Cross-site request refused');
        }
    }

    // Fails closed: with no token configured every request is refused.
    public function assertToken(string $provided): void
    {
        $expected = (string) $this->config['token'];
        if ($expected === '') {
            throw new GatewayException(503, 'Gateway token is not configured');
        }
        if (!hash_equals($expected, $provided)) {
            throw new GatewayException(401, 'Missing or invalid gateway token');
        }
    }

    /** @return array<string,mixed> the approved route */
    public function route(string $name): array
    {
        $route = preg_match('/^[a-z0-9][a-z0-9-]{0,62}$/', $name) ? ($this->routes[$name] ?? null) : null;
        if ($route === null || ($route['enabled'] ?? false) !== true) {
            throw new GatewayException(404, 'Unknown application route');
        }
        return $route;
    }

    public function assertMethod(array $route, string $method): void
    {
        if (!in_array($method, $route['allowed_methods'] ?? [], true)) {
            throw new GatewayException(405, 'Method not allowed for this route');
        }
    }

    // Returns the path unchanged if it is safe. Rejects traversal, including encoded and double-encoded forms.
    public function validatePath(string $raw): string
    {
        if ($raw === '') {
            return '/';
        }
        if (strlen($raw) > (int) $this->config['max_path_length']) {
            throw new GatewayException(414, 'Path too long');
        }
        if ($raw[0] !== '/' || str_contains($raw, '//') || preg_match('/[\x00-\x20\x7f-\xff\\\\]/', $raw)) {
            throw new GatewayException(400, 'Invalid path');
        }
        $decoded = $raw;
        for ($i = 0; $i < 3; $i++) {
            $decoded = rawurldecode($decoded);
            if (preg_match('/[\x00-\x1f\x7f\\\\]/', $decoded)) {
                throw new GatewayException(400, 'Invalid path');
            }
            foreach (explode('/', $decoded) as $segment) {
                if ($segment === '.' || $segment === '..') {
                    throw new GatewayException(400, 'Path traversal refused');
                }
            }
        }
        return $raw;
    }

    public function validateQuery(string $query): string
    {
        if (strlen($query) > (int) $this->config['max_path_length'] || preg_match('/[\x00-\x20\x7f-\xff]/', $query)) {
            throw new GatewayException(400, 'Invalid query string');
        }
        return $query;
    }

    /** @return list<string> "Name: value" lines for the allowlisted headers only */
    public function forwardHeaders(array $server): array
    {
        $lines = [];
        foreach (self::FORWARD_HEADERS as $key => $name) {
            $value = trim((string) ($server[$key] ?? ''));
            if ($value === '') {
                continue;
            }
            if (strlen($value) > 4096 || preg_match('/[\x00-\x1f\x7f]/', $value)) {
                throw new GatewayException(400, "Invalid $name header");
            }
            $lines[] = "$name: $value";
        }
        return $lines;
    }

    /** @return list<string> problems found in the static route configuration */
    public function routeConfigErrors(): array
    {
        $errors = [];
        foreach ($this->routes as $name => $route) {
            $upstream = parse_url((string) ($route['upstream'] ?? ''));
            $host = $upstream['host'] ?? '';
            if (!preg_match('/^[a-z0-9][a-z0-9-]{0,62}$/', (string) $name)) {
                $errors[] = "route '$name': invalid name";
            }
            if (!in_array($upstream['scheme'] ?? '', ['http', 'https'], true) || $host === '') {
                $errors[] = "route '$name': upstream must be an http(s) URL";
                continue;
            }
            if (isset($upstream['user']) || isset($upstream['pass']) || isset($upstream['query']) || ($upstream['path'] ?? '') !== '') {
                $errors[] = "route '$name': upstream must be scheme://host[:port] only";
            }
            // The gateway must not be pointed at itself or at link-local metadata services.
            $ip = trim($host, '[]');
            if (strtolower($host) === 'localhost' || (filter_var($ip, FILTER_VALIDATE_IP) && (str_starts_with($ip, '127.') || str_starts_with($ip, '169.254.') || $ip === '::1'))) {
                $errors[] = "route '$name': loopback and link-local upstreams are not allowed";
            }
            foreach ($route['allowed_methods'] ?? [] as $method) {
                if (!in_array($method, self::KNOWN_METHODS, true)) {
                    $errors[] = "route '$name': unknown method '$method'";
                }
            }
        }
        return $errors;
    }
}
