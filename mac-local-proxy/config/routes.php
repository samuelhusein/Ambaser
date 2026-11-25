<?php

declare(strict_types=1);

// Static allowlist of approved destinations. Nothing outside this file can be proxied.
// Add an entry only after the corporate network administrator approves the destination.
return [
    'internal-app' => [
        'upstream' => 'http://10.243.210.86',
        'enabled' => true,
        'allowed_methods' => ['GET', 'HEAD'],
    ],
];
