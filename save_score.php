<?php
header('Content-Type: application/json');
require_once 'db.php';

// POSTデータの取得
$data = json_decode(file_get_contents('php://input'), true);

$username = trim($data['username'] ?? '');
$pincode = trim($data['pincode'] ?? '');
$score = intval($data['score'] ?? 0);

if (empty($username) || empty($pincode) || strlen($pincode) !== 4) {
    echo json_encode(['status' => 'error', 'message' => '入力内容が正しくありません']);
    exit;
}

try {
    // ユーザーが存在するか確認
    $stmt = $pdo->prepare("SELECT * FROM users WHERE username = :username");
    $stmt->execute([':username' => $username]);
    $user = $stmt->fetch();

    if ($user) {
        // 登録済みユーザー：ピンコードの確認
        if ($user['pincode'] !== $pincode) {
            echo json_encode(['status' => 'error', 'message' => 'ピンコードが一致しません']);
            exit;
        }
        $userId = $user['id'];
    } else {
        // 新規ユーザー登録
        $stmt = $pdo->prepare("INSERT INTO users (username, pincode) VALUES (:username, :pincode)");
        $stmt->execute([':username' => $username, ':pincode' => $pincode]);
        $userId = $pdo->lastInsertId();
    }

    // スコアの保存
    $stmt = $pdo->prepare("INSERT INTO scores (user_id, score) VALUES (:user_id, :score)");
    $stmt->execute([':user_id' => $userId, ':score' => $score]);

    echo json_encode(['status' => 'success', 'message' => 'スコアを保存しました']);
} catch (PDOException $e) {
    echo json_encode(['status' => 'error', 'message' => '保存エラー: ' . $e->getMessage()]);
}
?>
