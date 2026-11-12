document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    const authScreen = document.getElementById('authScreen');
    const startBtn = document.getElementById('startBtn');
    const usernameInput = document.getElementById('username');
    const pincodeInput = document.getElementById('pincode');
    const diffButtons = document.querySelectorAll('.diff-btn');

    // 選択された難易度（デフォルト：normal）
    let selectedDifficulty = 'normal';

    // HTML側の難易度ボタン同期
    function syncDiffButtons(diff) {
        selectedDifficulty = diff;
        diffButtons.forEach(btn => {
            if (btn.dataset.diff === diff) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    diffButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            syncDiffButtons(btn.dataset.diff);
        });
    });

    // 画像の読み込み
    const playerImg = new Image();
    playerImg.src = 'images/player.png';

    const itemImages = {
        apple: new Image(),
        strawberry: new Image(),
        star: new Image(),
        clock: new Image(),
        chestnut: new Image(),
        bomb: new Image()
    };

    itemImages.apple.src = 'images/apple.png';
    itemImages.strawberry.src = 'images/strawberry.png';
    itemImages.star.src = 'images/star.png';
    itemImages.clock.src = 'images/item_clock.png';
    itemImages.chestnut.src = 'images/chestnut.png';
    itemImages.bomb.src = 'images/bomb.png';

    // プレイヤー設定
    const normalSpeed = 8;
    const boostSpeed = 15;

    const player = {
        x: canvas.width / 2 - 40,
        y: canvas.height - 100,
        width: 80,
        height: 80,
        speed: normalSpeed
    };

    let score = 0;
    let timeLeft = 30;
    let isGameOver = false;
    let spawnTimer = null;
    let countTimer = null;
    let currentUsername = '';

    // 時計の出現数制限
    let clockSpawnedCount = 0;
    const maxClockCount = 3;

    // 状態タイマー
    let stunTimer = 0;
    let feverTimer = 0;
    let feverMaxDuration = 5;

    // コンボ
    let combo = 0;

    const items = [];
    const keys = { left: false, right: false };

    // --- ゲームオーバー画面用 ボタン配置データ ---
    const gameOverButtons = {
        retry: { x: canvas.width / 2 - 90, y: canvas.height / 2 + 50, width: 180, height: 42, label: 'もう一度遊ぶ' },
        easy: { x: canvas.width / 2 - 145, y: canvas.height / 2 + 110, width: 90, height: 35, diff: 'easy', label: 'EASY' },
        normal: { x: canvas.width / 2 - 45, y: canvas.height / 2 + 110, width: 90, height: 35, diff: 'normal', label: 'NORMAL' },
        hard: { x: canvas.width / 2 + 55, y: canvas.height / 2 + 110, width: 90, height: 35, diff: 'hard', label: 'HARD' }
    };

    window.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = true;
        if (e.key === 'ArrowRight' || e.key === 'd') keys.right = true;
    });

    window.addEventListener('keyup', (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = false;
        if (e.key === 'ArrowRight' || e.key === 'd') keys.right = false;
    });

    // キャンバスクリック判定（ゲームオーバー画面のボタン用）
    canvas.addEventListener('click', (e) => {
        if (!isGameOver) return;

        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        // 難易度切り替えボタン判定
        ['easy', 'normal', 'hard'].forEach(diffKey => {
            const btn = gameOverButtons[diffKey];
            if (
                clickX >= btn.x && clickX <= btn.x + btn.width &&
                clickY >= btn.y && clickY <= btn.y + btn.height
            ) {
                syncDiffButtons(btn.diff);
            }
        });

        // 「もう一度遊ぶ」ボタン判定（選択中の難易度ですぐにスタート）
        const retry = gameOverButtons.retry;
        if (
            clickX >= retry.x && clickX <= retry.x + retry.width &&
            clickY >= retry.y && clickY <= retry.y + retry.height
        ) {
            resetAndStartGame();
        }
    });

    // スタートボタン処理
    if (startBtn) {
        startBtn.onclick = function () {
            const username = usernameInput.value.trim();
            const pincode = pincodeInput.value.trim();

            if (!username || !pincode) {
                alert('ユーザー名と4桁のピンコードを入力してください！');
                return;
            }

            if (pincode.length !== 4 || isNaN(pincode)) {
                alert('ピンコードは半角の4桁の数字で入力してください！');
                return;
            }

            currentUsername = username;
            authScreen.style.display = 'none';
            canvas.style.display = 'block';

            resetAndStartGame();
        };
    }

    function resetAndStartGame() {
        score = 0;
        timeLeft = 30;
        combo = 0;
        clockSpawnedCount = 0;
        stunTimer = 0;
        feverTimer = 0;
        player.speed = normalSpeed;
        player.x = canvas.width / 2 - 40;
        items.length = 0;
        isGameOver = false;

        // 難易度に応じたフィーバー時間
        if (selectedDifficulty === 'easy') feverMaxDuration = 7;
        else if (selectedDifficulty === 'normal') feverMaxDuration = 5;
        else if (selectedDifficulty === 'hard') feverMaxDuration = 4;

        if (spawnTimer) clearInterval(spawnTimer);
        if (countTimer) clearInterval(countTimer);

        startSpawning();

        countTimer = setInterval(() => {
            if (timeLeft > 0) {
                timeLeft--;
            } else {
                endGame();
            }

            if (stunTimer > 0) stunTimer--;

            if (feverTimer > 0) {
                feverTimer--;
                if (feverTimer === 0) {
                    player.speed = normalSpeed;
                    startSpawning();
                }
            }
        }, 1000);

        gameLoop();
    }

    function startSpawning() {
        if (spawnTimer) clearInterval(spawnTimer);
        const interval = feverTimer > 0 ? 200 : (selectedDifficulty === 'hard' ? 450 : 550);
        spawnTimer = setInterval(spawnItem, interval);
    }

    function spawnItem() {
        if (isGameOver) return;
        const itemX = Math.random() * (canvas.width - 40);
        const rand = Math.random();

        let baseSpeed = 3.5;
        if (selectedDifficulty === 'easy') baseSpeed = 3.0;
        if (selectedDifficulty === 'hard') baseSpeed = 4.5;

        const speedBonus = Math.min(score / 50, 3.5);
        let type = 'strawberry';
        let speed = baseSpeed + speedBonus;

        if (feverTimer > 0) {
            if (selectedDifficulty === 'easy') {
                if (rand < 0.30) {
                    type = 'star';
                    speed = 8.5 + speedBonus;
                } else if (rand < 0.70) {
                    type = 'apple';
                    speed = 6.0 + speedBonus;
                } else {
                    type = 'strawberry';
                    speed = 5.0 + speedBonus;
                }
            } else if (selectedDifficulty === 'normal') {
                if (rand < 0.25) {
                    type = 'star';
                    speed = 9.0 + speedBonus;
                } else if (rand < 0.65) {
                    type = 'apple';
                    speed = 6.0 + speedBonus;
                } else {
                    type = 'strawberry';
                    speed = 5.0 + speedBonus;
                }
            } else {
                if (rand < 0.20) {
                    type = 'star';
                    speed = 10.0 + speedBonus;
                } else if (rand < 0.45) {
                    type = 'apple';
                    speed = 7.0 + speedBonus;
                } else if (rand < 0.70) {
                    type = 'bomb';
                    speed = 8.0 + speedBonus;
                } else {
                    type = 'strawberry';
                    speed = 6.0 + speedBonus;
                }
            }
        } else {
            if (rand < 0.05) {
                type = 'star';
                speed = baseSpeed + 4.5 + speedBonus;
            } else if (rand < 0.12 && clockSpawnedCount < maxClockCount) {
                type = 'clock';
                speed = baseSpeed + 3.5 + speedBonus;
                clockSpawnedCount++;
            } else if (rand < 0.25) {
                type = 'bomb';
                speed = baseSpeed + 3.0 + speedBonus;
            } else if (rand < 0.45) {
                type = 'chestnut';
                speed = baseSpeed + 2.0 + speedBonus;
            } else if (rand < 0.70) {
                type = 'apple';
                speed = baseSpeed + 1.0 + speedBonus;
            } else {
                type = 'strawberry';
                speed = baseSpeed + speedBonus;
            }
        }

        items.push({
            x: itemX,
            y: -40,
            width: 40,
            height: 40,
            type: type,
            speed: speed
        });
    }

    function update() {
        if (isGameOver) return;

        if (stunTimer === 0) {
            if (keys.left && player.x > 0) player.x -= player.speed;
            if (keys.right && player.x < canvas.width - player.width) player.x += player.speed;
        }

        for (let i = items.length - 1; i >= 0; i--) {
            const item = items[i];
            item.y += item.speed;

            if (
                player.x < item.x + item.width &&
                player.x + player.width > item.x &&
                player.y < item.y + item.height &&
                player.y + player.height > item.y
            ) {
                if (item.type === 'apple') {
                    combo++;
                    const comboMultiplier = Math.min(combo, 5);
                    score += 5 * comboMultiplier;
                } else if (item.type === 'strawberry') {
                    combo++;
                    const comboMultiplier = Math.min(combo, 5);
                    score += 3 * comboMultiplier;
                } else if (item.type === 'star') {
                    feverTimer = feverMaxDuration;
                    player.speed = boostSpeed;
                    startSpawning();
                } else if (item.type === 'clock') {
                    timeLeft += 5;
                } else if (item.type === 'chestnut') {
                    combo = 0;
                    score = Math.max(0, score - 1);
                    stunTimer = 3;
                } else if (item.type === 'bomb') {
                    combo = 0;
                    score = Math.max(0, score - 5);
                    stunTimer = 5;
                }

                items.splice(i, 1);
            } else if (item.y > canvas.height) {
                items.splice(i, 1);
            }
        }
    }

    function endGame() {
        isGameOver = true;
        clearInterval(spawnTimer);
        clearInterval(countTimer);
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // プレイヤー描画
        ctx.save();
        if (stunTimer > 0) {
            ctx.globalAlpha = 0.5;
        } else if (feverTimer > 0) {
            ctx.shadowBlur = 25;
            ctx.shadowColor = '#fffa65';
        }
        ctx.drawImage(playerImg, player.x, player.y, player.width, player.height);
        ctx.restore();

        if (stunTimer > 0) {
            ctx.fillStyle = '#ff4757';
            ctx.font = 'bold 16px sans-serif';
            ctx.fillText(`痺れている! (${stunTimer}s)`, player.x + 5, player.y - 10);
        }

        if (feverTimer > 0) {
            ctx.fillStyle = '#fffa65';
            ctx.font = 'bold 28px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`★ FEVER TIME! (${feverTimer}s) ★`, canvas.width / 2, 75);
            ctx.textAlign = 'left';
        }

        // アイテム描画
        items.forEach(item => {
            const img = itemImages[item.type];
            if (img && img.complete) {
                ctx.drawImage(img, item.x, item.y, item.width, item.height);
            }
        });

        // UI表示
        ctx.fillStyle = '#ffffff';
        ctx.font = '22px sans-serif';
        ctx.fillText(`PLAYER: ${currentUsername} [${selectedDifficulty.toUpperCase()}]`, 25, 35);
        ctx.fillText(`SCORE: ${score}`, 25, 65);

        if (combo >= 2) {
            ctx.fillStyle = '#70a1ff';
            ctx.font = 'bold 24px sans-serif';
            ctx.fillText(`COMBO x${combo}!`, 25, 95);
        }

        ctx.fillStyle = timeLeft <= 5 ? '#ff4757' : '#ffffff';
        ctx.fillText(`TIME: ${timeLeft}s`, canvas.width - 130, 35);

        // GAME OVER 表示
        if (isGameOver) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = '#ff4757';
            ctx.font = 'bold 50px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 50);

            ctx.fillStyle = '#ffffff';
            ctx.font = '24px sans-serif';
            ctx.fillText(`${currentUsername} さんのスコア: ${score}`, canvas.width / 2, canvas.height / 2);

            // 1. 「もう一度遊ぶ」ボタン描画
            const retry = gameOverButtons.retry;
            ctx.fillStyle = '#ff4757';
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(retry.x, retry.y, retry.width, retry.height, 8);
            } else {
                ctx.rect(retry.x, retry.y, retry.width, retry.height);
            }
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 18px sans-serif';
            ctx.fillText(retry.label, canvas.width / 2, retry.y + 27);

            // 2. 難易度切り替えボタン（EASY / NORMAL / HARD）描画
            ['easy', 'normal', 'hard'].forEach(diffKey => {
                const btn = gameOverButtons[diffKey];
                const isSelected = (selectedDifficulty === btn.diff);

                // 選択中かどうかで色を変更
                if (isSelected) {
                    if (btn.diff === 'easy') ctx.fillStyle = '#2ed573';
                    else if (btn.diff === 'normal') ctx.fillStyle = '#ffa502';
                    else ctx.fillStyle = '#ff4757';
                } else {
                    ctx.fillStyle = '#4b6584';
                }

                ctx.beginPath();
                if (ctx.roundRect) {
                    ctx.roundRect(btn.x, btn.y, btn.width, btn.height, 6);
                } else {
                    ctx.rect(btn.x, btn.y, btn.width, btn.height);
                }
                ctx.fill();

                // 選択中の場合は白枠をつける
                if (isSelected) {
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }

                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 14px sans-serif';
                ctx.fillText(btn.label, btn.x + btn.width / 2, btn.y + 23);
            });

            ctx.textAlign = 'left';
        }
    }

    function gameLoop() {
        update();
        draw();
        if (!isGameOver) {
            requestAnimationFrame(gameLoop);
        }
    }
});
