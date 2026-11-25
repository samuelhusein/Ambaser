<?php

declare(strict_types=1);

// Writes one JSON line per request. Records only route, method, status, duration and error text:
// never query strings, request bodies, cookies, tokens or proxy credentials.
final class Logger
{
    public function __construct(private string $logDir, private string $stateDir)
    {
    }

    /** @param array{route:string,method:string,status:int,duration_ms:int,error?:string} $entry */
    public function access(array $entry): void
    {
        $line = json_encode(['ts' => gmdate('c')] + $entry, JSON_UNESCAPED_SLASHES);
        $this->write($this->logDir . '/gateway-' . gmdate('Y-m-d') . '.log', $line . "\n", FILE_APPEND);
        if (isset($entry['error'])) {
            $this->write($this->stateDir . '/last-error.json', $line, 0);
        }
    }

    public function lastError(): ?array
    {
        $file = $this->stateDir . '/last-error.json';
        $data = is_readable($file) ? json_decode((string) file_get_contents($file), true) : null;
        return is_array($data) ? $data : null;
    }

    private function write(string $file, string $data, int $flags): void
    {
        $dir = dirname($file);
        if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
            return; // logging must never break request handling
        }
        file_put_contents($file, $data, $flags | LOCK_EX);
    }
}
