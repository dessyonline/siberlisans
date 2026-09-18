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
if (!is_array($payload)) {
    fail(400, 'Invalid payload');
}
$operation = $payload['operation'] ?? 'query';
if (!in_array($operation, ['query', 'reset_password'], true)) {
    fail(400, 'Unknown operation');
}
if ($operation === 'query' && (!isset($payload['sql']) || !is_string($payload['sql']))) {
    fail(400, 'Invalid payload: { sql: string, params?: any[] }');
}

$sql = trim($payload['sql'] ?? '');
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
    if ($operation === 'reset_password') {
        $token = $payload['token'] ?? '';
        $hash = $payload['passwordHash'] ?? '';
        if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/D', $token) ||
            !is_string($hash) || !preg_match('/^pbkdf2\$100000\$[a-f0-9]{32}\$[a-f0-9]{64}$/D', $hash)) {
            fail(400, 'Invalid reset payload');
        }
        $pdo->beginTransaction();
        // Lock the account first so different reset tokens also serialize.
        $stmt = $pdo->prepare('SELECT u.id FROM auth_users u JOIN auth_password_tokens t ON t.user_id=u.id WHERE t.token=? FOR UPDATE');
        $stmt->execute([$token]);
        $user = $stmt->fetch();
        $stmt = $pdo->prepare('SELECT user_id FROM auth_password_tokens WHERE token=? AND used=0 AND expires_at>NOW() FOR UPDATE');
        $stmt->execute([$token]);
        $valid = $stmt->fetch();
        if (!$user || !$valid) {
            $pdo->rollBack();
            echo json_encode(['ok' => false]);
            exit;
        }
        $pdo->prepare('UPDATE auth_users SET password_hash=? WHERE id=?')->execute([$hash, $user['id']]);
        $pdo->prepare('UPDATE auth_password_tokens SET used=1 WHERE user_id=? AND used=0')->execute([$user['id']]);
        $pdo->prepare('DELETE FROM auth_sessions WHERE user_id=?')->execute([$user['id']]);
        $pdo->commit();
        echo json_encode(['ok' => true]);
        exit;
    }
    $stmt = $pdo->prepare($sql);
    $stmt->execute(array_values($params));

    $isRead = (bool) preg_match('/^\s*(select|show|describe|explain|with)\b/i', $sql);

    echo json_encode([
        'rows' => $isRead ? $stmt->fetchAll() : [],
        'rowCount' => $stmt->rowCount(),
        'insertId' => $isRead ? null : $pdo->lastInsertId(),
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fail(400, 'Database operation failed');
}
