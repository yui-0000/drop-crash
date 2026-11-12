document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    const authScreen = document.getElementById('authScreen');
    const guideScreen = document.getElementById('guideScreen');
    const openGuideBtn = document.getElementById('openGuideBtn');
    const closeGuideBtn = document.getElementById('closeGuideBtn');
    const startBtn = document.getElementById('startBtn');
    const usernameInput = document.getElementById('username');
    // const pincodeInput = document.getElementById('pincode'); // 今回未使用
    const diffButtons = document.querySelectorAll('.diff-btn');

    // 「アイテム説明」画面の切り替え処理
    if (openGuideBtn && guideScreen) {
        openGuideBtn.addEventListener('click', () => {
            authScreen.style.display = 'none';
            guideScreen.style.display = 'block';
        });
    }

    if (closeGuideBtn && guideScreen) {
        closeGuideBtn.addEventListener('click', () => {
            guideScreen.style.display = 'none';
            authScreen.style.display = 'block';
        });
    }

    // タッチ操作用UI（スマホ・タブレット専用）
    const touchControls = document.getElementById('touchControls');
    const btnLeft = document.getElementById('btnLeft');
    const btnRight = document.getElementById('btnRight');

    // 端末保存用キー（localStorage）
    const STORAGE_NAME_KEY = 'dropCrash_username';
    const STORAGE_BEST_KEY = 'dropCrash_bestScores';

    // 保存済みの名前があれば自動入力
    const savedName = localStorage.getItem(STORAGE_NAME_KEY);
    if (savedName && usernameInput) {
        usernameInput.value = savedName;
    }

    // 難易度別ハイスコアの読み込み
    let bestScores = { easy: 0, normal: 0, hard: 0 };
    try {
        const savedBest = JSON.parse(localStorage.getItem(STORAGE_BEST_KEY));
        if (savedBest && typeof savedBest === 'object') {
            bestScores = {
                easy: Number(savedBest.easy) || 0,
                normal: Number(savedBest.normal) || 0,
                hard: Number(savedBest.hard) || 0
            };
        }
    } catch (e) {
        // 読み込み失敗時は初期値0のまま
    }

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
    let timeLeft = 50;
    let isGameOver = false;
    let isNewRecord = false;
    let spawnTimer = null;
    let countTimer = null;
    let currentUsername = '';

    // 時計の出現数制限
    let clockSpawnedCount = 0;
    let maxClockCount = 3;

    // 状態タイマー
    let stunTimer = 0;
    let feverTimer = 0;
    let feverMaxDuration = 5;

    // コンボ
    let combo = 0;

    const items = [];
    const keys = { left: false, right: false };

    // スマホ・タッチ端末判定（横向きでも確実にスマホ判定する）
    function isMobileDevice() {
        return (
            'ontouchstart' in window ||
            navigator.maxTouchPoints > 0 ||
            window.matchMedia('(hover: none) and (pointer: coarse)').matches ||
            window.innerHeight <= 600
        );
    }

    // --- ゲームオーバー画面用 ボタン配置データ（PC/スマホ自動切り替え） ---
    function getGameOverButtons() {
        if (isMobileDevice()) {
            return {
                retry: { x: canvas.width / 2 - 210, y: canvas.height / 2 + 55, width: 420, height: 92, label: 'もう一度遊ぶ' },
                easy: { x: canvas.width / 2 - 295, y: canvas.height / 2 + 175, width: 180, height: 72, diff: 'easy', label: 'EASY' },
                normal: { x: canvas.width / 2 - 90, y: canvas.height / 2 + 175, width: 180, height: 72, diff: 'normal', label: 'NORMAL' },
                hard: { x: canvas.width / 2 + 115, y: canvas.height / 2 + 175, width: 180, height: 72, diff: 'hard', label: 'HARD' }
            };
        }
        return {
            retry: { x: canvas.width / 2 - 90, y: canvas.height / 2 + 70, width: 180, height: 42, label: 'もう一度遊ぶ' },
            easy: { x: canvas.width / 2 - 145, y: canvas.height / 2 + 130, width: 90, height: 35, diff: 'easy', label: 'EASY' },
            normal: { x: canvas.width / 2 - 45, y: canvas.height / 2 + 130, width: 90, height: 35, diff: 'normal', label: 'NORMAL' },
            hard: { x: canvas.width / 2 + 55, y: canvas.height / 2 + 130, width: 90, height: 35, diff: 'hard', label: 'HARD' }
        };
    }

    // パソコン用キーボード操作（矢印キーのみ）
    window.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            keys.left = true;
        }
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            keys.right = true;
        }
    });

    window.addEventListener('keyup', (e) => {
        if (e.key === 'ArrowLeft') keys.left = false;
        if (e.key === 'ArrowRight') keys.right = false;
    });

    // スマホ・タブレット専用 左右タッチボタン操作
    function bindTouchButton(button, direction) {
        if (!button) return;

        const press = (e) => {
            e.preventDefault();
            keys[direction] = true;
            button.classList.add('active');
        };

        const release = (e) => {
            e.preventDefault();
            keys[direction] = false;
            button.classList.remove('active');
        };

        button.addEventListener('touchstart', press, { passive: false });
        button.addEventListener('touchend', release, { passive: false });
        button.addEventListener('touchcancel', release, { passive: false });
    }

    bindTouchButton(btnLeft, 'left');
    bindTouchButton(btnRight, 'right');

    // スマホ・タブレット専用：ゲーム画面（Canvas）の左半分・右半分を直接タップして左右移動
    function updateCanvasTouchDirection(e) {
        if (isGameOver) return;
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        let touchLeft = false;
        let touchRight = false;

        for (let i = 0; i < e.touches.length; i++) {
            const touchX = e.touches[i].clientX - rect.left;
            if (touchX < rect.width / 2) {
                touchLeft = true;
            } else {
                touchRight = true;
            }
        }

        keys.left = touchLeft;
        keys.right = touchRight;
        if (btnLeft) btnLeft.classList.toggle('active', touchLeft);
        if (btnRight) btnRight.classList.toggle('active', touchRight);
    }

    canvas.addEventListener('touchstart', (e) => {
        if (isGameOver) return;
        updateCanvasTouchDirection(e);
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        if (isGameOver) return;
        updateCanvasTouchDirection(e);
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
        if (isGameOver) return;
        if (e.touches.length === 0) {
            keys.left = false;
            keys.right = false;
            if (btnLeft) btnLeft.classList.remove('active');
            if (btnRight) btnRight.classList.remove('active');
        } else {
            updateCanvasTouchDirection(e);
        }
    }, { passive: false });

    canvas.addEventListener('touchcancel', () => {
        keys.left = false;
        keys.right = false;
        if (btnLeft) btnLeft.classList.remove('active');
        if (btnRight) btnRight.classList.remove('active');
    });

    // キャンバスクリック判定（ゲームオーバー画面のボタン用）
    canvas.addEventListener('click', (e) => {
        if (!isGameOver) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const clickX = (e.clientX - rect.left) * scaleX;
        const clickY = (e.clientY - rect.top) * scaleY;

        const buttons = getGameOverButtons();

        // 難易度切り替えボタン判定
        ['easy', 'normal', 'hard'].forEach(diffKey => {
            const btn = buttons[diffKey];
            if (
                clickX >= btn.x && clickX <= btn.x + btn.width &&
                clickY >= btn.y && clickY <= btn.y + btn.height
            ) {
                syncDiffButtons(btn.diff);
                draw();
            }
        });

        // 「もう一度遊ぶ」ボタン判定
        const retry = buttons.retry;
        if (
            clickX >= retry.x && clickX <= retry.x + retry.width &&
            clickY >= retry.y && clickY <= retry.y + retry.height
        ) {
            resetAndStartGame();
        }
    });

    // スタートボタン処理（ニックネームを端末に記憶・ピンコードはコメントアウト）
    if (startBtn) {
        startBtn.onclick = function () {
            const rawName = usernameInput.value.trim();
            const username = rawName || 'GUEST';

            if (rawName) {
                localStorage.setItem(STORAGE_NAME_KEY, rawName);
            } else {
                localStorage.removeItem(STORAGE_NAME_KEY);
            }

            /* ピンコード入力チェック（今回未使用のためコメントアウト）
            const pincode = pincodeInput.value.trim();
            if (!username || !pincode) {
                alert('ユーザー名と4桁のピンコードを入力してください！');
                return;
            }
            if (pincode.length !== 4 || isNaN(pincode)) {
                alert('ピンコードは半角の4桁の数字で入力してください！');
                return;
            }
            */

            currentUsername = username;
            authScreen.style.display = 'none';
            if (guideScreen) guideScreen.style.display = 'none';
            canvas.style.display = 'block';
            if (touchControls) touchControls.classList.add('is-visible');

            resetAndStartGame();
        };
    }

    function resetAndStartGame() {
        score = 0;
        combo = 0;
        clockSpawnedCount = 0;
        stunTimer = 0;
        feverTimer = 0;
        isNewRecord = false;
        keys.left = false;
        keys.right = false;
        if (btnLeft) btnLeft.classList.remove('active');
        if (btnRight) btnRight.classList.remove('active');

        player.speed = normalSpeed;
        player.x = canvas.width / 2 - 40;
        items.length = 0;
        isGameOver = false;

        // 難易度に応じた制限時間・時計出現上限・フィーバー時間
        if (selectedDifficulty === 'easy') {
            timeLeft = 45;
            maxClockCount = 3;
            feverMaxDuration = 7;
        } else if (selectedDifficulty === 'normal') {
            timeLeft = 50;
            maxClockCount = 3;
            feverMaxDuration = 5;
        } else {
            timeLeft = 60;
            maxClockCount = 4;
            feverMaxDuration = 4;
        }

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

        const rand = Math.random();

        let baseSpeed = 3.5;
        if (selectedDifficulty === 'easy') baseSpeed = 3.0;
        if (selectedDifficulty === 'hard') baseSpeed = 4.5;

        const speedBonus = Math.min(score / 50, 3.5);
        let type = 'strawberry';
        let speed = baseSpeed + speedBonus;

        if (feverTimer > 0) {
            if (selectedDifficulty === 'easy') {
                // EASY：スター30% / りんご40% / いちご30%（障害物なし）
                if (rand < 0.30) { type = 'star'; speed = 8.5 + speedBonus; }
                else if (rand < 0.70) { type = 'apple'; speed = 6.0 + speedBonus; }
                else { type = 'strawberry'; speed = 5.0 + speedBonus; }
            } else if (selectedDifficulty === 'normal') {
                // NORMAL：スター20% / りんご35% / いちご30% / いがぐり10% / 爆弾5%
                if (rand < 0.20) { type = 'star'; speed = 9.0 + speedBonus; }
                else if (rand < 0.55) { type = 'apple'; speed = 6.0 + speedBonus; }
                else if (rand < 0.85) { type = 'strawberry'; speed = 5.0 + speedBonus; }
                else if (rand < 0.95) { type = 'chestnut'; speed = 6.5 + speedBonus; }
                else { type = 'bomb'; speed = 7.5 + speedBonus; }
            } else {
                // HARD：スター15% / りんご25% / いちご30% / いがぐり15% / 爆弾15%
                if (rand < 0.15) { type = 'star'; speed = 10.0 + speedBonus; }
                else if (rand < 0.40) { type = 'apple'; speed = 7.0 + speedBonus; }
                else if (rand < 0.70) { type = 'strawberry'; speed = 6.0 + speedBonus; }
                else if (rand < 0.85) { type = 'chestnut'; speed = 7.5 + speedBonus; }
                else { type = 'bomb'; speed = 8.5 + speedBonus; }
            }
        } else {
            if (rand < 0.05) {
                type = 'star';
                speed = baseSpeed + 4.5 + speedBonus;
            } else if (rand < 0.12 && clockSpawnedCount < maxClockCount) {
                type = 'clock';
                speed = baseSpeed + 1.5 + speedBonus;
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

        // いがぐりだけ中間サイズ（49px）にする
        const itemSize = (type === 'chestnut') ? 49 : 40;
        const itemX = Math.random() * (canvas.width - itemSize);

        items.push({
            x: itemX,
            y: -itemSize,
            width: itemSize,
            height: itemSize,
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

            // いがぐりのサイズ（49px）に合わせた当たり判定の余白
            const pad = (item.type === 'chestnut') ? 4 : 0;

            if (
                player.x < item.x + item.width - pad &&
                player.x + player.width > item.x + pad &&
                player.y < item.y + item.height - pad &&
                player.y + player.height > item.y + pad
            ) {
                // フィーバー中の得点・減点倍率（EASY:1倍 / NORMAL:プラス1.2倍 / HARD:プラス2.0倍・マイナス1.5倍）
                let plusMultiplier = 1.0;
                let minusMultiplier = 1.0;
                if (feverTimer > 0) {
                    if (selectedDifficulty === 'normal') {
                        plusMultiplier = 1.2;
                    } else if (selectedDifficulty === 'hard') {
                        plusMultiplier = 2.0;
                        minusMultiplier = 1.5;
                    }
                }

                if (item.type === 'apple') {
                    combo++;
                    const comboMultiplier = Math.min(combo, 5);
                    const gained = Math.round(5 * comboMultiplier * plusMultiplier);
                    score += gained;
                } else if (item.type === 'strawberry') {
                    combo++;
                    const comboMultiplier = Math.min(combo, 5);
                    const gained = Math.round(3 * comboMultiplier * plusMultiplier);
                    score += gained;
                } else if (item.type === 'star') {
                    feverTimer = feverMaxDuration;
                    player.speed = boostSpeed;
                    startSpawning();
                } else if (item.type === 'clock') {
                    timeLeft += 5;
                } else if (item.type === 'chestnut') {
                    combo = 0;
                    const lost = Math.ceil(1 * minusMultiplier); // 通常:1 / HARDフィーバー:2
                    score = Math.max(0, score - lost);
                    stunTimer = 3;
                } else if (item.type === 'bomb') {
                    combo = 0;
                    const lost = Math.ceil(5 * minusMultiplier); // 通常:5 / HARDフィーバー:8
                    score = Math.max(0, score - lost);
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
        keys.left = false;
        keys.right = false;
        if (btnLeft) btnLeft.classList.remove('active');
        if (btnRight) btnRight.classList.remove('active');
        clearInterval(spawnTimer);
        clearInterval(countTimer);

        // 難易度別の自己ベスト更新チェック＆端末保存
        const prevBest = bestScores[selectedDifficulty] || 0;
        if (score > prevBest) {
            bestScores[selectedDifficulty] = score;
            isNewRecord = true;
            try {
                localStorage.setItem(STORAGE_BEST_KEY, JSON.stringify(bestScores));
            } catch (e) {
                // 保存エラー時は無視
            }
        }
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
            ctx.font = 'bold 26px sans-serif';
            ctx.textAlign = 'center';
            let feverLabel = `★ FEVER TIME! (${feverTimer}s) ★`;
            if (selectedDifficulty === 'normal') {
                feverLabel = `★ FEVER! SCORE x1.2 (${feverTimer}s) ★`;
            } else if (selectedDifficulty === 'hard') {
                feverLabel = `★ FEVER! SCORE x2 / RISK x1.5 (${feverTimer}s) ★`;
            }
            ctx.fillText(feverLabel, canvas.width / 2, 75);
            ctx.textAlign = 'left';
        }

        // アイテム描画
        items.forEach(item => {
            const img = itemImages[item.type];
            if (!img || !img.complete) return;

            if (item.type === 'chestnut' && img.naturalWidth > 0 && img.naturalHeight > 0) {
                // いがぐり専用描画：横長画像の左右の黒余白を切り抜き、丸く表示＋黄緑の輪郭光彩で視認性アップ
                ctx.save();
                const centerX = item.x + item.width / 2;
                const centerY = item.y + item.height / 2;
                const radius = item.width / 2;

                // 目立つ黄緑色の輪郭グロー
                ctx.shadowBlur = 12;
                ctx.shadowColor = '#badc58';
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius - 2, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(186, 220, 88, 0.25)';
                ctx.fill();

                // 丸く切り抜いて中央のいがぐり部分を拡大描画
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
                ctx.clip();

                const cropSize = Math.min(img.naturalWidth, img.naturalHeight);
                const sx = (img.naturalWidth - cropSize) / 2;
                const sy = (img.naturalHeight - cropSize) / 2;
                ctx.drawImage(img, sx, sy, cropSize, cropSize, item.x, item.y, item.width, item.height);
                ctx.restore();
            } else {
                ctx.drawImage(img, item.x, item.y, item.width, item.height);
            }
        });

        // UI表示（左上にプレイヤー名・スコア・選択中の難易度のBESTスコア）
        const currentBest = Math.max(score, bestScores[selectedDifficulty] || 0);
        ctx.fillStyle = '#ffffff';
        ctx.font = '22px sans-serif';
        ctx.fillText(`PLAYER: ${currentUsername} [${selectedDifficulty.toUpperCase()}]`, 25, 35);
        ctx.fillText(`SCORE: ${score}`, 25, 65);

        ctx.fillStyle = '#fffa65';
        ctx.font = 'bold 20px sans-serif';
        ctx.fillText(`BEST (${selectedDifficulty.toUpperCase()}): ${currentBest}`, 25, 95);

        if (combo >= 2) {
            ctx.fillStyle = '#70a1ff';
            ctx.font = 'bold 24px sans-serif';
            ctx.fillText(`COMBO x${combo}!`, 25, 125);
        }

        ctx.fillStyle = timeLeft <= 5 ? '#ff4757' : '#ffffff';
        ctx.font = '22px sans-serif';
        ctx.fillText(`TIME: ${timeLeft}s`, canvas.width - 130, 35);

        // GAME OVER 表示
        if (isGameOver) {
            const mobile = isMobileDevice();
            const buttons = getGameOverButtons();
            const diffBest = bestScores[selectedDifficulty] || 0;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = '#ff4757';
            ctx.font = mobile ? 'bold 84px sans-serif' : 'bold 50px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('GAME OVER', canvas.width / 2, mobile ? canvas.height / 2 - 135 : canvas.height / 2 - 75);

            // 新記録のときは金色で「NEW RECORD!」を表示
            if (isNewRecord && score > 0) {
                ctx.fillStyle = '#fffa65';
                ctx.font = mobile ? 'bold 38px sans-serif' : 'bold 22px sans-serif';
                ctx.fillText('★ NEW RECORD! ★', canvas.width / 2, mobile ? canvas.height / 2 - 75 : canvas.height / 2 - 35);
            }

            ctx.fillStyle = '#ffffff';
            ctx.font = mobile ? 'bold 40px sans-serif' : '24px sans-serif';
            ctx.fillText(`${currentUsername} さんのスコア: ${score}`, canvas.width / 2, mobile ? canvas.height / 2 - 25 : canvas.height / 2);

            ctx.fillStyle = '#7bed9f';
            ctx.font = mobile ? 'bold 32px sans-serif' : '18px sans-serif';
            ctx.fillText(`${selectedDifficulty.toUpperCase()} 自己ベスト: ${diffBest}`, canvas.width / 2, mobile ? canvas.height / 2 + 22 : canvas.height / 2 + 32);

            // 1. 「もう一度遊ぶ」ボタン描画
            const retry = buttons.retry;
            ctx.fillStyle = '#ff4757';
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(retry.x, retry.y, retry.width, retry.height, mobile ? 16 : 8);
            } else {
                ctx.rect(retry.x, retry.y, retry.width, retry.height);
            }
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.font = mobile ? 'bold 38px sans-serif' : 'bold 18px sans-serif';
            ctx.fillText(retry.label, canvas.width / 2, retry.y + (mobile ? 59 : 27));

            // 2. 難易度切り替えボタン（EASY / NORMAL / HARD）描画
            ['easy', 'normal', 'hard'].forEach(diffKey => {
                const btn = buttons[diffKey];
                const isSelected = (selectedDifficulty === btn.diff);

                if (isSelected) {
                    if (btn.diff === 'easy') ctx.fillStyle = '#2ed573';
                    else if (btn.diff === 'normal') ctx.fillStyle = '#ffa502';
                    else ctx.fillStyle = '#ff4757';
                } else {
                    ctx.fillStyle = '#4b6584';
                }

                ctx.beginPath();
                if (ctx.roundRect) {
                    ctx.roundRect(btn.x, btn.y, btn.width, btn.height, mobile ? 12 : 6);
                } else {
                    ctx.rect(btn.x, btn.y, btn.width, btn.height);
                }
                ctx.fill();

                if (isSelected) {
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = mobile ? 4 : 2;
                    ctx.stroke();
                }

                ctx.fillStyle = '#ffffff';
                ctx.font = mobile ? 'bold 30px sans-serif' : 'bold 14px sans-serif';
                ctx.fillText(btn.label, btn.x + btn.width / 2, btn.y + (mobile ? 47 : 23));
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