<?php
// データベース接続設定
$host = 'localhost';
$dbname = 'dropcrash_db'; // データベース名
$user = 'root';           // XAMPPの初期ユーザー
$pass = '';               // XAMPPの初期パスワード（空欄）

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    echo json_encode(['status' => 'error', 'message' => '接続失敗: ' . $e->getMessage()]);
    exit;
}
?>
