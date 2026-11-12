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

    // タッチ操作用UI（スマホ・タブレット専用）
    const touchControls = document.getElementById('touchControls');
    const btnLeft = document.getElementById('btnLeft');
    const btnRight = document.getElementById('btnRight');

    // どこからアイテム説明を開いたか（'auth' または 'gameover'）
    let guideReturnTarget = 'auth';

    function openGuide(fromTarget) {
        guideReturnTarget = fromTarget;
        if (fromTarget === 'auth') {
            authScreen.style.display = 'none';
        } else {
            canvas.style.display = 'none';
            if (touchControls) touchControls.classList.remove('is-visible');
        }
        if (guideScreen) guideScreen.style.display = 'block';
    }

    function closeGuide() {
        if (guideScreen) guideScreen.style.display = 'none';
        if (guideReturnTarget === 'gameover') {
            canvas.style.display = 'block';
            if (touchControls) touchControls.classList.add('is-visible');
            draw();
        } else {
            authScreen.style.display = 'block';
        }
    }

    // ゲーム画面（プレイ中・GAME OVER画面の両方）からホーム画面へ戻る処理
    function returnToHome() {
        isGameOver = true;
        keys.left = false;
        keys.right = false;
        if (btnLeft) btnLeft.classList.remove('active');
        if (btnRight) btnRight.classList.remove('active');
        if (spawnTimer) clearInterval(spawnTimer);
        if (countTimer) clearInterval(countTimer);

        canvas.style.display = 'none';
        if (guideScreen) guideScreen.style.display = 'none';
        if (touchControls) touchControls.classList.remove('is-visible');
        authScreen.style.display = 'block';
    }

    // スタート画面の「アイテム説明」ボタン
    if (openGuideBtn && guideScreen) {
        openGuideBtn.addEventListener('click', () => openGuide('auth'));
    }

    // アイテム説明画面の「戻る」ボタン
    if (closeGuideBtn && guideScreen) {
        closeGuideBtn.addEventListener('click', closeGuide);
    }

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
        y: canvas.height - 105,
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

    // ハリネズミの足元に出るポップアップ演出
    const footPopups = [];
    function addFootPopup(text, color) {
        footPopups.push({
            text: text,
            color: color,
            x: player.x + player.width / 2,
            y: player.y + player.height + 16,
            alpha: 0.9
        });
        if (footPopups.length > 3) {
            footPopups.shift();
        }
    }

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

    // プレイ中画面の右上「ホーム」ボタン配置
    function getInGameHomeButton() {
        if (isMobileDevice()) {
            return { x: canvas.width - 145, y: 48, width: 120, height: 42, label: 'ホーム' };
        }
        return { x: canvas.width - 115, y: 46, width: 90, height: 30, label: 'ホーム' };
    }

    // --- ゲームオーバー画面用 ボタン配置データ（PC/スマホ自動切り替え） ---
    function getGameOverButtons() {
        if (isMobileDevice()) {
            return {
                retry: { x: canvas.width / 2 - 210, y: canvas.height / 2 + 30, width: 420, height: 80, label: 'もう一度遊ぶ' },
                easy: { x: canvas.width / 2 - 295, y: canvas.height / 2 + 128, width: 180, height: 62, diff: 'easy', label: 'EASY' },
                normal: { x: canvas.width / 2 - 90, y: canvas.height / 2 + 128, width: 180, height: 62, diff: 'normal', label: 'NORMAL' },
                hard: { x: canvas.width / 2 + 115, y: canvas.height / 2 + 128, width: 180, height: 62, diff: 'hard', label: 'HARD' },
                guide: { x: canvas.width / 2 - 295, y: canvas.height / 2 + 208, width: 280, height: 58, label: 'アイテム説明' },
                home: { x: canvas.width / 2 + 15, y: canvas.height / 2 + 208, width: 280, height: 58, label: 'ホームへ戻る' }
            };
        }
        return {
            retry: { x: canvas.width / 2 - 95, y: canvas.height / 2 + 52, width: 190, height: 42, label: 'もう一度遊ぶ' },
            easy: { x: canvas.width / 2 - 145, y: canvas.height / 2 + 108, width: 90, height: 34, diff: 'easy', label: 'EASY' },
            normal: { x: canvas.width / 2 - 45, y: canvas.height / 2 + 108, width: 90, height: 34, diff: 'normal', label: 'NORMAL' },
            hard: { x: canvas.width / 2 + 55, y: canvas.height / 2 + 108, width: 90, height: 34, diff: 'hard', label: 'HARD' },
            guide: { x: canvas.width / 2 - 145, y: canvas.height / 2 + 156, width: 140, height: 36, label: 'アイテム説明' },
            home: { x: canvas.width / 2 + 5, y: canvas.height / 2 + 156, width: 140, height: 36, label: 'ホームへ戻る' }
        };
    }

    function isInsideRect(px, py, rect) {
        return (
            px >= rect.x && px <= rect.x + rect.width &&
            py >= rect.y && py <= rect.y + rect.height
        );
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

    // スマホ・タブレット専用：画面上のどの位置に指があっても（滑らせても）左右判定を維持する
    function updateScreenTouchDirection(e) {
        if (isGameOver) return;
        if (canvas.style.display === 'none') return;

        // プレイ中の右上「ホーム」ボタンをタップしたときは移動扱いにしない
        if (e.type === 'touchstart' && e.touches.length === 1) {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const tx = (e.touches[0].clientX - rect.left) * scaleX;
            const ty = (e.touches[0].clientY - rect.top) * scaleY;
            if (isInsideRect(tx, ty, getInGameHomeButton())) {
                e.preventDefault();
                returnToHome();
                return;
            }
        }

        e.preventDefault();

        const screenHalfX = window.innerWidth / 2;
        let touchLeft = false;
        let touchRight = false;

        for (let i = 0; i < e.touches.length; i++) {
            const x = e.touches[i].clientX;
            if (x < screenHalfX) {
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

    // 操作ボタンエリア＆ゲーム画面の両方で指のタッチ・スライドを追跡
    [touchControls, canvas].forEach(el => {
        if (!el) return;
        el.addEventListener('touchstart', updateScreenTouchDirection, { passive: false });
        el.addEventListener('touchmove', updateScreenTouchDirection, { passive: false });
        el.addEventListener('touchend', (e) => {
            if (isGameOver) return;
            if (e.touches.length === 0) {
                keys.left = false;
                keys.right = false;
                if (btnLeft) btnLeft.classList.remove('active');
                if (btnRight) btnRight.classList.remove('active');
            } else {
                updateScreenTouchDirection(e);
            }
        }, { passive: false });
        el.addEventListener('touchcancel', () => {
            keys.left = false;
            keys.right = false;
            if (btnLeft) btnLeft.classList.remove('active');
            if (btnRight) btnRight.classList.remove('active');
        });
    });

    // キャンバスクリック判定（プレイ中のホームボタン＆ゲームオーバー画面の各種ボタン用）
    canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const clickX = (e.clientX - rect.left) * scaleX;
        const clickY = (e.clientY - rect.top) * scaleY;

        // プレイ中の右上「ホーム」ボタン判定
        if (!isGameOver) {
            if (isInsideRect(clickX, clickY, getInGameHomeButton())) {
                returnToHome();
            }
            return;
        }

        const buttons = getGameOverButtons();

        // 難易度切り替えボタン判定
        ['easy', 'normal', 'hard'].forEach(diffKey => {
            const btn = buttons[diffKey];
            if (isInsideRect(clickX, clickY, btn)) {
                syncDiffButtons(btn.diff);
                draw();
            }
        });

        // 「アイテム説明」ボタン判定
        if (isInsideRect(clickX, clickY, buttons.guide)) {
            openGuide('gameover');
            return;
        }

        // 「ホームへ戻る」ボタン判定
        if (isInsideRect(clickX, clickY, buttons.home)) {
            returnToHome();
            return;
        }

        // 「もう一度遊ぶ」ボタン判定
        if (isInsideRect(clickX, clickY, buttons.retry)) {
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
        footPopups.length = 0;
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

        // 足元ポップアップのアニメーション更新
        for (let i = footPopups.length - 1; i >= 0; i--) {
            footPopups[i].y += 0.25;
            footPopups[i].alpha -= 0.03;
            if (footPopups[i].alpha <= 0) {
                footPopups.splice(i, 1);
            }
        }

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
                    addFootPopup(`+${gained}`, '#7bed9f');
                } else if (item.type === 'strawberry') {
                    combo++;
                    const comboMultiplier = Math.min(combo, 5);
                    const gained = Math.round(3 * comboMultiplier * plusMultiplier);
                    score += gained;
                    addFootPopup(`+${gained}`, '#7bed9f');
                } else if (item.type === 'star') {
                    feverTimer = feverMaxDuration;
                    player.speed = boostSpeed;
                    startSpawning();
                    addFootPopup('FEVER!', '#fffa65');
                } else if (item.type === 'clock') {
                    timeLeft += 5;
                    addFootPopup('+5s!', '#70a1ff');
                } else if (item.type === 'chestnut') {
                    combo = 0;
                    const lost = Math.ceil(1 * minusMultiplier); // 通常:1 / HARDフィーバー:2
                    score = Math.max(0, score - lost);
                    stunTimer = 3;
                    addFootPopup(`-${lost}`, '#ff6b81');
                } else if (item.type === 'bomb') {
                    combo = 0;
                    const lost = Math.ceil(5 * minusMultiplier); // 通常:5 / HARDフィーバー:8
                    score = Math.max(0, score - lost);
                    stunTimer = 5;
                    addFootPopup(`-${lost}`, '#ff4757');
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

        // ハリネズミの足元ポップアップ描画（落下アイテムの視界を邪魔しない下側スペース）
        footPopups.forEach(p => {
            ctx.save();
            ctx.globalAlpha = Math.max(0, p.alpha);
            ctx.fillStyle = p.color;
            ctx.font = 'bold 18px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(p.text, p.x, p.y);
            ctx.restore();
        });

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

        // 右上の残り時間
        ctx.fillStyle = timeLeft <= 5 ? '#ff4757' : '#ffffff';
        ctx.font = '22px sans-serif';
        ctx.fillText(`TIME: ${timeLeft}s`, canvas.width - 130, 35);

        // プレイ中の右上「ホーム」ボタン描画
        if (!isGameOver) {
            const mobile = isMobileDevice();
            const homeBtn = getInGameHomeButton();
            ctx.save();
            ctx.fillStyle = 'rgba(75, 101, 132, 0.85)';
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(homeBtn.x, homeBtn.y, homeBtn.width, homeBtn.height, 6);
            } else {
                ctx.rect(homeBtn.x, homeBtn.y, homeBtn.width, homeBtn.height);
            }
            ctx.fill();

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.font = mobile ? 'bold 20px sans-serif' : 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(homeBtn.label, homeBtn.x + homeBtn.width / 2, homeBtn.y + (mobile ? 28 : 20));
            ctx.restore();
        }

        // GAME OVER 表示
        if (isGameOver) {
            const mobile = isMobileDevice();
            const buttons = getGameOverButtons();
            const diffBest = bestScores[selectedDifficulty] || 0;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = '#ff4757';
            ctx.font = mobile ? 'bold 80px sans-serif' : 'bold 48px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('GAME OVER', canvas.width / 2, mobile ? canvas.height / 2 - 145 : canvas.height / 2 - 85);

            // 新記録のときは金色で「NEW RECORD!」を表示
            if (isNewRecord && score > 0) {
                ctx.fillStyle = '#fffa65';
                ctx.font = mobile ? 'bold 36px sans-serif' : 'bold 20px sans-serif';
                ctx.fillText('★ NEW RECORD! ★', canvas.width / 2, mobile ? canvas.height / 2 - 88 : canvas.height / 2 - 45);
            }

            ctx.fillStyle = '#ffffff';
            ctx.font = mobile ? 'bold 38px sans-serif' : '22px sans-serif';
            ctx.fillText(`${currentUsername} さんのスコア: ${score}`, canvas.width / 2, mobile ? canvas.height / 2 - 38 : canvas.height / 2 - 12);

            ctx.fillStyle = '#7bed9f';
            ctx.font = mobile ? 'bold 30px sans-serif' : '18px sans-serif';
            ctx.fillText(`${selectedDifficulty.toUpperCase()} 自己ベスト: ${diffBest}`, canvas.width / 2, mobile ? canvas.height / 2 + 8 : canvas.height / 2 + 20);

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
            ctx.font = mobile ? 'bold 36px sans-serif' : 'bold 18px sans-serif';
            ctx.fillText(retry.label, canvas.width / 2, retry.y + (mobile ? 53 : 27));

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
                ctx.font = mobile ? 'bold 28px sans-serif' : 'bold 14px sans-serif';
                ctx.fillText(btn.label, btn.x + btn.width / 2, btn.y + (mobile ? 42 : 23));
            });

            // 3. 「アイテム説明」＆「ホームへ戻る」ボタン描画（横並び）
            [buttons.guide, buttons.home].forEach(subBtn => {
                ctx.fillStyle = '#4b6584';
                ctx.beginPath();
                if (ctx.roundRect) {
                    ctx.roundRect(subBtn.x, subBtn.y, subBtn.width, subBtn.height, mobile ? 12 : 6);
                } else {
                    ctx.rect(subBtn.x, subBtn.y, subBtn.width, subBtn.height);
                }
                ctx.fill();

                ctx.strokeStyle = '#778ca3';
                ctx.lineWidth = mobile ? 3 : 1.5;
                ctx.stroke();

                ctx.fillStyle = '#ffffff';
                ctx.font = mobile ? 'bold 26px sans-serif' : 'bold 14px sans-serif';
                ctx.fillText(subBtn.label, subBtn.x + subBtn.width / 2, subBtn.y + (mobile ? 38 : 23));
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