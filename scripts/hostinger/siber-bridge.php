<?php
/**
 * SiberPHP <-> MySQL kopru (Hostinger uzerinde calisir).
 *
 * KURULUM
 * 1) Bu dosyayi Hostinger'da public_html icine yukle (ornek: /public_html/bridge.php).
 * 2) Asagidaki DB bilgilerini kendi bilgilerinle doldur.
 * 3) BRIDGE_TOKEN icin uzun rastgele bir deger uret (ornek: openssl rand -hex 32)
 *    ve ayni degeri Lovable tarafinda MYSQL_BRIDGE_TOKEN olarak kaydet.
 * 4) Dosyanin HTTPS ile erisilebildigini dogrula.
 *
 * NOT: Sifreleri asla sohbette paylasma. Bu dosya sadece sunucunda durur.
 */

declare(strict_types=1);

const DB_HOST = 'localhost';
const DB_NAME = 'CHANGE_ME_DB';
const DB_USER = 'CHANGE_ME_USER';
const DB_PASS = 'CHANGE_ME_PASSWORD';

// Lovable tarafindaki MYSQL_BRIDGE_TOKEN ile birebir ayni olmali.
const BRIDGE_TOKEN = 'CHANGE_ME_TOKEN';

header('Content-Type: application/json; charset=utf-8');

function fail(int $status, string $message): never {
    http_response_code($status);
    echo json_encode(['error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    fail(405, 'Only POST is allowed');
}

$provided = $_SERVER['HTTP_X_BRIDGE_TOKEN'] ?? '';
if (BRIDGE_TOKEN === 'CHANGE_ME_TOKEN' || !hash_equals(BRIDGE_TOKEN, (string) $provided)) {
    fail(401, 'Unauthorized');
}

$raw = file_get_contents('php://input') ?: '';
$payload = json_decode($raw, true);
if (!is_array($payload) || !isset($payload['sql']) || !is_string($payload['sql'])) {
    fail(400, 'Invalid payload: { sql: string, params?: any[] }');
}

$sql = trim($payload['sql']);
$params = $payload['params'] ?? [];
if (!is_array($params)) {
    fail(400, 'params must be an array');
}

// Tek ifade calistir: zincirlenmis sorgulari engelle.
if (substr_count(rtrim($sql, "; \t\n\r"), ';') > 0) {
    fail(400, 'Only a single statement is allowed');
}

try {
    $pdo = new PDO(
        sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', DB_HOST, DB_NAME),
        DB_USER,
        DB_PASS,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );
} catch (Throwable $e) {
    fail(500, 'Database connection failed');
}

try {
    $stmt = $pdo->prepare($sql);
    $stmt->execute(array_values($params));

    $isRead = (bool) preg_match('/^\s*(select|show|describe|explain|with)\b/i', $sql);

    echo json_encode([
        'rows' => $isRead ? $stmt->fetchAll() : [],
        'rowCount' => $stmt->rowCount(),
        'insertId' => $isRead ? null : $pdo->lastInsertId(),
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    fail(400, 'Query failed: ' . $e->getMessage());
}
