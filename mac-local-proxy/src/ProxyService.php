<?php

declare(strict_types=1);

// Sends one approved request to a configured upstream (optionally through the corporate proxy)
// and returns a sanitized response. The destination always comes from config, never from the request.
final class ProxyService
{
    // Never copied from the upstream response back to the browser.
    // Set-Cookie is dropped: cookies would bind to 127.0.0.1 and mix sessions across routes.
    private const DROP_RESPONSE_HEADERS = [
        'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer',
        'transfer-encoding', 'upgrade', 'content-length', 'content-encoding', 'set-cookie', 'server', 'x-powered-by',
    ];

    public function __construct(private array $config, private AccessPolicy $policy)
    {
    }

    /**
     * @param list<string> $requestHeaders
     * @return array{status:int,headers:array<string,string>,body:string}
     */
    public function fetch(string $routeName, array $route, string $method, string $path, string $query, array $requestHeaders, ?string $body, ?int $timeout = null): array
    {
        $url = rtrim((string) $route['upstream'], '/') . $path . ($query !== '' ? "?$query" : '');
        $maxBytes = (int) $this->config['max_response_bytes'];
        $rawHeaders = [];
        $buffer = '';
        $tooLarge = false;

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_NOBODY => $method === 'HEAD',
            CURLOPT_HTTPHEADER => $requestHeaders,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_CONNECTTIMEOUT => (int) $this->config['connect_timeout'],
            CURLOPT_TIMEOUT => $timeout ?? (int) $this->config['timeout'],
            CURLOPT_ENCODING => '',
            CURLOPT_HEADERFUNCTION => static function ($ch, string $line) use (&$rawHeaders): int {
                if (str_starts_with($line, 'HTTP/')) {
                    $rawHeaders = []; // a new response block (e.g. after 100-continue)
                } elseif (str_contains($line, ':')) {
                    [$name, $value] = explode(':', $line, 2);
                    $rawHeaders[strtolower(trim($name))] = trim($value);
                }
                return strlen($line);
            },
            CURLOPT_WRITEFUNCTION => static function ($ch, string $chunk) use (&$buffer, &$tooLarge, $maxBytes): int {
                if (strlen($buffer) + strlen($chunk) > $maxBytes) {
                    $tooLarge = true;
                    return 0; // aborts the transfer
                }
                $buffer .= $chunk;
                return strlen($chunk);
            },
        ]);
        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }
        // An explicit empty proxy means "direct", so a stray http_proxy variable cannot reroute traffic.
        curl_setopt($ch, CURLOPT_PROXY, (string) $this->config['proxy']);
        if ($this->config['proxy'] !== '' && (int) $this->config['proxy_port'] > 0) {
            curl_setopt($ch, CURLOPT_PROXYPORT, (int) $this->config['proxy_port']);
        }

        curl_exec($ch);
        $errno = curl_errno($ch);
        $error = curl_error($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);

        if ($tooLarge) {
            throw new GatewayException(502, 'Upstream response exceeds the size limit');
        }
        if ($errno === CURLE_OPERATION_TIMEDOUT) {
            throw new GatewayException(504, 'Upstream timed out');
        }
        if ($errno !== 0 || $status === 0) {
            throw new GatewayException(502, "Upstream request failed: $error");
        }
        // 407 means the corporate proxy wants credentials; report it, do not try to work around it.
        if ($status === 407) {
            throw new GatewayException(502, 'Corporate proxy requires authentication');
        }

        $headers = [];
        foreach ($rawHeaders as $name => $value) {
            if (!in_array($name, self::DROP_RESPONSE_HEADERS, true) && $name !== 'location') {
                $headers[$name] = $value;
            }
        }
        if ($status >= 300 && $status < 400 && isset($rawHeaders['location'])) {
            $headers['location'] = $this->rewriteLocation($routeName, $route, $path, $rawHeaders['location']);
        }

        return ['status' => $status, 'headers' => $headers, 'body' => $buffer];
    }

    // A redirect stays inside the same approved upstream; anything else is refused, never followed.
    private function rewriteLocation(string $routeName, array $route, string $currentPath, string $location): string
    {
        $upstream = parse_url((string) $route['upstream']);
        $target = parse_url($location);
        if ($target === false) {
            throw new GatewayException(502, 'Upstream sent an invalid redirect');
        }
        if (isset($target['host'])) {
            $sameOrigin = strtolower($target['host']) === strtolower($upstream['host'])
                && ($target['scheme'] ?? $upstream['scheme']) === $upstream['scheme']
                && ($target['port'] ?? ($upstream['scheme'] === 'https' ? 443 : 80)) === ($upstream['port'] ?? ($upstream['scheme'] === 'https' ? 443 : 80));
            if (!$sameOrigin) {
                throw new GatewayException(502, 'Redirect to an unapproved destination was blocked');
            }
        }
        $path = $target['path'] ?? '';
        if ($path === '') {
            $path = $currentPath;
        } elseif ($path[0] !== '/') {
            $path = substr($currentPath, 0, (int) strrpos($currentPath, '/') + 1) . $path;
        }
        $path = $this->policy->validatePath($path);
        $query = isset($target['query']) ? '?' . $this->policy->validateQuery($target['query']) : '';
        return "/r/$routeName$path$query";
    }
}
