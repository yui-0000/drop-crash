<?php
header('Content-Type: application/json');
require_once 'db.php';

try {
    // スコアが高い順（同じスコアなら達成日時が古い順）にTOP5を取得
    $sql = "SELECT u.username, s.score 
            FROM scores s 
            JOIN users u ON s.user_id = u.id 
            ORDER BY s.score DESC, s.created_at ASC 
            LIMIT 5";

    $stmt = $pdo->query($sql);
    $ranking = $stmt->fetchAll();

    echo json_encode(['status' => 'success', 'data' => $ranking]);
} catch (PDOException $e) {
    echo json_encode(['status' => 'error', 'message' => 'ランキング取得エラー: ' . $e->getMessage()]);
}
?>