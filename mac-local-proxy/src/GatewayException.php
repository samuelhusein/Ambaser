<?php

declare(strict_types=1);

// An error that maps directly to an HTTP status returned to the browser.
final class GatewayException extends RuntimeException
{
    public function __construct(public readonly int $status, string $message)
    {
        parent::__construct($message);
    }
}
