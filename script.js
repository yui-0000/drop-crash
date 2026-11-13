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

  // タッチ状態（両手タップ＆片手スライド判定）をリセットするヘルパー
  function resetTouchState() {
    keys.left = false;
    keys.right = false;
    slideState.active = false;
    slideState.touchId = null;
    slideState.isSliding = false;
    slideState.targetX = null;
    if (btnLeft) btnLeft.classList.remove('active');
    if (btnRight) btnRight.classList.remove('active');
  }

  // ゲーム画面（プレイ中・GAME OVER画面の両方）からホーム画面へ戻る処理
  function returnToHome() {
    isGameOver = true;
    isCountingDown = false;
    countdownText = '';
    if (countdownTimer) {
      clearTimeout(countdownTimer);
      countdownTimer = null;
    }
    resetTouchState();
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

  // カウントダウン用変数（0.7秒間隔）
  let isCountingDown = false;
  let countdownText = '';
  let countdownStepStart = 0;
  let countdownTimer = null;

  // 1プレイ中に取ったアイテムの個数カウント
  let itemStats = {
    apple: 0,
    strawberry: 0,
    star: 0,
    clock: 0,
    chestnut: 0,
    bomb: 0
  };

  // 時計の出現数制限
  let clockSpawnedCount = 0;
  let maxClockCount = 3;

  // 状態タイマー（stunTimer: しびれ残り秒数）
  let stunTimer = 0;
  let feverTimer = 0;
  let feverMaxDuration = 5;

  // しびれ解除の1秒前に、画面一番上（y = -itemSize）から自然に障害物を落下させる
  // 「すぐ動けば確実に避けられるが、最初の一歩が遅れると避けきれない」速度に調整
  function spawnTopApproachingHazard() {
    if (selectedDifficulty === 'easy') return;

    // 発生確率：NORMAL 15% / HARD 30%（たまにやってくる緊張感）
    const chance = (selectedDifficulty === 'hard') ? 0.30 : 0.15;
    if (Math.random() >= chance) return;

    const isHard = (selectedDifficulty === 'hard');
    // いがぐり（70%）と爆弾（30%）の両方がランダムで降ってくる
    const isBomb = Math.random() < 0.30;
    const type = isBomb ? 'bomb' : 'chestnut';
    const itemSize = (type === 'chestnut') ? 49 : 40;

    // 終盤でも理不尽に速くなりすぎないよう速度ボーナスは控えめ（最大+1.0）に制限
    const speedBonus = Math.min(score / 150, 1.0);

    // HARD: 7.4〜7.9（復活後約0.7秒で到達 → すぐ動けば回避、一歩遅れると被弾）
    // NORMAL: 6.2〜6.6（復活後約0.85秒で到達 → HARDより少し余裕あり）
    const speed = (isHard ? (isBomb ? 7.9 : 7.4) : (isBomb ? 6.6 : 6.2)) + speedBonus;

    // プレイヤーのド真ん中（±10pxのわずかな揺らぎ）を狙うため、しっかり一歩動かないと避けられない
    const jitter = (Math.random() - 0.5) * 20;
    const rawX = player.x + (player.width - itemSize) / 2 + jitter;
    const itemX = Math.max(0, Math.min(canvas.width - itemSize, rawX));

    items.push({
      x: itemX,
      y: -itemSize,
      width: itemSize,
      height: itemSize,
      type: type,
      speed: speed
    });
  }

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

  // 片手スライド追従用の管理状態（感度2.35倍＋壁での折り返し補正つき）
  const SLIDE_SENSITIVITY = 2.35;
  const slideState = {
    active: false,
    touchId: null,
    startScreenX: 0,
    startPlayerX: 0,
    isSliding: false,
    targetX: null
  };

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
        retry: { x: canvas.width / 2 - 210, y: canvas.height / 2 + 65, width: 420, height: 74, label: 'もう一度遊ぶ' },
        easy: { x: canvas.width / 2 - 295, y: canvas.height / 2 + 153, width: 180, height: 58, diff: 'easy', label: 'EASY' },
        normal: { x: canvas.width / 2 - 90, y: canvas.height / 2 + 153, width: 180, height: 58, diff: 'normal', label: 'NORMAL' },
        hard: { x: canvas.width / 2 + 115, y: canvas.height / 2 + 153, width: 180, height: 58, diff: 'hard', label: 'HARD' },
        guide: { x: canvas.width / 2 - 295, y: canvas.height / 2 + 225, width: 280, height: 54, label: 'アイテム説明' },
        home: { x: canvas.width / 2 + 15, y: canvas.height / 2 + 225, width: 280, height: 54, label: 'ホームへ戻る' }
      };
    }
    return {
      retry: { x: canvas.width / 2 - 95, y: canvas.height / 2 + 78, width: 190, height: 40, label: 'もう一度遊ぶ' },
      easy: { x: canvas.width / 2 - 145, y: canvas.height / 2 + 130, width: 90, height: 34, diff: 'easy', label: 'EASY' },
      normal: { x: canvas.width / 2 - 45, y: canvas.height / 2 + 130, width: 90, height: 34, diff: 'normal', label: 'NORMAL' },
      hard: { x: canvas.width / 2 + 55, y: canvas.height / 2 + 130, width: 90, height: 34, diff: 'hard', label: 'HARD' },
      guide: { x: canvas.width / 2 - 145, y: canvas.height / 2 + 176, width: 140, height: 34, label: 'アイテム説明' },
      home: { x: canvas.width / 2 + 5, y: canvas.height / 2 + 176, width: 140, height: 34, label: 'ホームへ戻る' }
    };
  }

  function isInsideRect(px, py, rect) {
    return (
      px >= rect.x &&
      px <= rect.x + rect.width &&
      py >= rect.y &&
      py <= rect.y + rect.height
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

  // スマホ・タブレット専用：画面全体どこからでも反応する「両手タップ＆片手スライド」操作
  function handleTouchInput(e) {
    if (isGameOver) return;
    if (canvas.style.display === 'none') return;
    if (authScreen && authScreen.style.display !== 'none') return;
    if (guideScreen && guideScreen.style.display !== 'none') return;

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

    if (e.cancelable) {
      e.preventDefault();
    }

    if (e.touches.length === 0) {
      resetTouchState();
      return;
    }

    if (e.touches.length >= 2) {
      slideState.active = false;
      slideState.touchId = null;
      slideState.isSliding = false;
      slideState.targetX = null;

      const screenHalfX = window.innerWidth / 2;
      let touchLeft = false;
      let touchRight = false;
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].clientX < screenHalfX) {
          touchLeft = true;
        } else {
          touchRight = true;
        }
      }
      keys.left = touchLeft;
      keys.right = touchRight;
      if (btnLeft) btnLeft.classList.toggle('active', touchLeft);
      if (btnRight) btnRight.classList.toggle('active', touchRight);
      return;
    }

    const t = e.touches[0];
    if (!slideState.active || slideState.touchId !== t.identifier) {
      slideState.active = true;
      slideState.touchId = t.identifier;
      slideState.startScreenX = t.clientX;
      slideState.startPlayerX = player.x;
      slideState.isSliding = false;
      slideState.targetX = null;
    }

    const deltaScreenX = t.clientX - slideState.startScreenX;

    if (!slideState.isSliding && Math.abs(deltaScreenX) >= 12) {
      slideState.isSliding = true;
      slideState.startScreenX = t.clientX;
      slideState.startPlayerX = player.x;
      keys.left = false;
      keys.right = false;
      if (btnLeft) btnLeft.classList.remove('active');
      if (btnRight) btnRight.classList.remove('active');
    }

    if (slideState.isSliding) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / (rect.width || window.innerWidth);
      const maxX = canvas.width - player.width;
      const moveCanvasX = (t.clientX - slideState.startScreenX) * scaleX * SLIDE_SENSITIVITY;
      const rawTarget = slideState.startPlayerX + moveCanvasX;

      if (rawTarget < 0) {
        slideState.targetX = 0;
        slideState.startScreenX = t.clientX;
        slideState.startPlayerX = 0;
      } else if (rawTarget > maxX) {
        slideState.targetX = maxX;
        slideState.startScreenX = t.clientX;
        slideState.startPlayerX = maxX;
      } else {
        slideState.targetX = rawTarget;
      }
    } else {
      const isLeft = t.clientX < window.innerWidth / 2;
      keys.left = isLeft;
      keys.right = !isLeft;
      if (btnLeft) btnLeft.classList.toggle('active', isLeft);
      if (btnRight) btnRight.classList.toggle('active', !isLeft);
    }
  }

  document.addEventListener('touchstart', handleTouchInput, { passive: false });
  document.addEventListener('touchmove', handleTouchInput, { passive: false });
  document.addEventListener('touchend', handleTouchInput, { passive: false });
  document.addEventListener('touchcancel', () => {
    resetTouchState();
  });

  // キャンバスクリック判定
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    if (!isGameOver) {
      if (isInsideRect(clickX, clickY, getInGameHomeButton())) {
        returnToHome();
      }
      return;
    }

    const buttons = getGameOverButtons();

    ['easy', 'normal', 'hard'].forEach(diffKey => {
      const btn = buttons[diffKey];
      if (isInsideRect(clickX, clickY, btn)) {
        syncDiffButtons(btn.diff);
        draw();
      }
    });

    if (isInsideRect(clickX, clickY, buttons.guide)) {
      openGuide('gameover');
      return;
    }

    if (isInsideRect(clickX, clickY, buttons.home)) {
      returnToHome();
      return;
    }

    if (isInsideRect(clickX, clickY, buttons.retry)) {
      resetAndStartGame();
    }
  });

  // スタートボタン処理
  if (startBtn) {
    startBtn.onclick = function () {
      const rawName = usernameInput.value.trim();
      const username = rawName || 'GUEST';

      if (rawName) {
        localStorage.setItem(STORAGE_NAME_KEY, rawName);
      } else {
        localStorage.removeItem(STORAGE_NAME_KEY);
      }

      currentUsername = username;
      authScreen.style.display = 'none';
      if (guideScreen) guideScreen.style.display = 'none';
      canvas.style.display = 'block';
      if (touchControls) touchControls.classList.add('is-visible');
      resetAndStartGame();
    };
  }

  // ゲーム本編の落下＆制限時間タイマーを動かす関数
  function beginActiveGameplay() {
    isCountingDown = false;
    countdownText = '';
    resetTouchState();

    startSpawning();
    countTimer = setInterval(() => {
      if (timeLeft > 0) {
        timeLeft--;
      } else {
        endGame();
      }
      if (stunTimer > 0) {
        stunTimer--;
        // しびれ解除の1秒前（残り1sになった瞬間）に画面一番上から自然に障害物を降らせる
        if (stunTimer === 1) {
          spawnTopApproachingHazard();
        }
      }
      if (feverTimer > 0) {
        feverTimer--;
        if (feverTimer === 0) {
          player.speed = normalSpeed;
          startSpawning();
        }
      }
    }, 1000);
  }

  function resetAndStartGame() {
    score = 0;
    combo = 0;
    clockSpawnedCount = 0;
    stunTimer = 0;
    feverTimer = 0;
    isNewRecord = false;
    footPopups.length = 0;
    itemStats = {
      apple: 0,
      strawberry: 0,
      star: 0,
      clock: 0,
      chestnut: 0,
      bomb: 0
    };
    resetTouchState();
    player.speed = normalSpeed;
    player.x = canvas.width / 2 - 40;
    items.length = 0;
    isGameOver = false;

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
    if (countdownTimer) clearTimeout(countdownTimer);

    isCountingDown = true;
    const steps = ['3', '2', '1', 'START!'];
    let stepIndex = 0;

    function runCountdownStep() {
      if (isGameOver) return;
      countdownText = steps[stepIndex];
      countdownStepStart = performance.now();
      stepIndex++;

      if (stepIndex < steps.length) {
        countdownTimer = setTimeout(runCountdownStep, 700);
      } else {
        countdownTimer = setTimeout(() => {
          if (!isGameOver) {
            beginActiveGameplay();
          }
        }, 450);
      }
    }

    runCountdownStep();
    gameLoop();
  }

  function startSpawning() {
    if (spawnTimer) clearInterval(spawnTimer);
    const interval = feverTimer > 0 ? 200 : (selectedDifficulty === 'hard' ? 370 : 550);
    spawnTimer = setInterval(spawnItem, interval);
  }

  function spawnItem() {
    if (isGameOver || isCountingDown) return;
    const rand = Math.random();
    let baseSpeed = 3.5;
    if (selectedDifficulty === 'easy') baseSpeed = 3.0;
    if (selectedDifficulty === 'hard') baseSpeed = 5.4;
    const speedBonus = Math.min(score / 50, 3.5);

    let type = 'strawberry';
    let speed = baseSpeed + speedBonus;

    if (feverTimer > 0) {
      if (selectedDifficulty === 'easy') {
        if (rand < 0.30) { type = 'star'; speed = 8.5 + speedBonus; }
        else if (rand < 0.70) { type = 'apple'; speed = 6.0 + speedBonus; }
        else { type = 'strawberry'; speed = 5.0 + speedBonus; }
      } else if (selectedDifficulty === 'normal') {
        if (rand < 0.20) { type = 'star'; speed = 9.0 + speedBonus; }
        else if (rand < 0.55) { type = 'apple'; speed = 6.0 + speedBonus; }
        else if (rand < 0.85) { type = 'strawberry'; speed = 5.0 + speedBonus; }
        else if (rand < 0.95) { type = 'chestnut'; speed = 6.5 + speedBonus; }
        else { type = 'bomb'; speed = 7.5 + speedBonus; }
      } else {
        if (rand < 0.15) { type = 'star'; speed = 10.5 + speedBonus; }
        else if (rand < 0.40) { type = 'apple'; speed = 7.5 + speedBonus; }
        else if (rand < 0.65) { type = 'strawberry'; speed = 6.5 + speedBonus; }
        else if (rand < 0.83) { type = 'chestnut'; speed = 8.2 + speedBonus; }
        else { type = 'bomb'; speed = 9.2 + speedBonus; }
      }
    } else if (selectedDifficulty === 'hard') {
      if (rand < 0.05) {
        type = 'star';
        speed = baseSpeed + 4.8 + speedBonus;
      } else if (rand < 0.11 && clockSpawnedCount < maxClockCount) {
        type = 'clock';
        speed = baseSpeed + 1.8 + speedBonus;
        clockSpawnedCount++;
      } else if (rand < 0.29) {
        type = 'bomb';
        speed = baseSpeed + 3.2 + speedBonus;
      } else if (rand < 0.63) {
        type = 'chestnut';
        speed = baseSpeed + 2.2 + speedBonus;
      } else if (rand < 0.82) {
        type = 'apple';
        speed = baseSpeed + 1.2 + speedBonus;
      } else {
        type = 'strawberry';
        speed = baseSpeed + speedBonus;
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

    const itemSize = (type === 'chestnut') ? 49 : 40;
    const itemX = Math.random() * (canvas.width - itemSize);
    items.push({ x: itemX, y: -itemSize, width: itemSize, height: itemSize, type: type, speed: speed });
  }

  function update() {
    if (isGameOver || isCountingDown) return;

    for (let i = footPopups.length - 1; i >= 0; i--) {
      footPopups[i].y += 0.25;
      footPopups[i].alpha -= 0.03;
      if (footPopups[i].alpha <= 0) {
        footPopups.splice(i, 1);
      }
    }

    if (stunTimer === 0) {
      if (slideState.isSliding && slideState.targetX !== null) {
        const diff = slideState.targetX - player.x;
        if (Math.abs(diff) <= player.speed) {
          player.x = slideState.targetX;
        } else {
          player.x += Math.sign(diff) * player.speed;
        }
      } else {
        if (keys.left && player.x > 0) player.x -= player.speed;
        if (keys.right && player.x < canvas.width - player.width) player.x += player.speed;
      }
    } else if (slideState.isSliding) {
      slideState.startPlayerX = player.x;
      slideState.targetX = player.x;
    }

    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      item.y += item.speed;

      const pad = (item.type === 'chestnut') ? 4 : 0;

      if (
        player.x < item.x + item.width - pad &&
        player.x + player.width > item.x + pad &&
        player.y < item.y + item.height - pad &&
        player.y + player.height > item.y + pad
      ) {
        const isHazard = (item.type === 'chestnut' || item.type === 'bomb');

        // しびれ中（動けない間）のみ障害アイテムをすり抜ける
        if (isHazard && stunTimer > 0) {
          if (item.y > canvas.height) {
            items.splice(i, 1);
          }
          continue;
        }

        if (itemStats[item.type] !== undefined) {
          itemStats[item.type]++;
        }

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
          const lost = Math.ceil(1 * minusMultiplier);
          score = Math.max(0, score - lost);
          stunTimer = 3;
          addFootPopup(`-${lost}`, '#ff6b81');
        } else if (item.type === 'bomb') {
          combo = 0;
          const lost = Math.ceil(5 * minusMultiplier);
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
    resetTouchState();
    clearInterval(spawnTimer);
    clearInterval(countTimer);

    const prevBest = bestScores[selectedDifficulty] || 0;
    if (score > prevBest) {
      bestScores[selectedDifficulty] = score;
      isNewRecord = true;
      try {
        localStorage.setItem(STORAGE_BEST_KEY, JSON.stringify(bestScores));
      } catch (e) {
      }
    }
  }

  function drawChestnutIcon(x, y, size) {
    const img = itemImages.chestnut;
    if (!img || !img.complete || img.naturalWidth === 0) return;

    ctx.save();
    const centerX = x + size / 2;
    const centerY = y + size / 2;
    const radius = size / 2;

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius - 1, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(186, 220, 88, 0.25)';
    ctx.fill();
    ctx.strokeStyle = '#badc58';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius - 1, 0, Math.PI * 2);
    ctx.clip();

    const cropSize = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - cropSize) / 2;
    const sy = (img.naturalHeight - cropSize) / 2;
    ctx.drawImage(img, sx, sy, cropSize, cropSize, x, y, size, size);
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    if (stunTimer > 0) {
      ctx.globalAlpha = 0.5;
    }

    if (feverTimer > 0) {
      ctx.shadowBlur = 25;
      ctx.shadowColor = '#fffa65';
    }
    ctx.drawImage(playerImg, player.x, player.y, player.width, player.height);
    ctx.restore();

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

    items.forEach(item => {
      const img = itemImages[item.type];
      if (!img || !img.complete) return;

      if (item.type === 'chestnut' && img.naturalWidth > 0 && img.naturalHeight > 0) {
        ctx.save();
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#badc58';
        drawChestnutIcon(item.x, item.y, item.width);
        ctx.restore();
      } else {
        ctx.drawImage(img, item.x, item.y, item.width, item.height);
      }
    });

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

    if (isCountingDown && countdownText) {
      const mobile = isMobileDevice();
      const elapsed = performance.now() - countdownStepStart;
      const progress = Math.min(elapsed / 220, 1);
      const scale = 0.65 + 0.35 * Math.sin(progress * (Math.PI / 2));

      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2 - (mobile ? 18 : 14));
      ctx.scale(scale, scale);

      const isStart = (countdownText === 'START!');
      const baseFontSize = mobile ? (isStart ? 115 : 150) : (isStart ? 86 : 115);
      ctx.font = `900 ${baseFontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.lineWidth = mobile ? 14 : 10;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.strokeText(countdownText, 0, 0);

      ctx.fillStyle = isStart ? '#fffa65' : '#ffffff';
      ctx.shadowBlur = 24;
      ctx.shadowColor = isStart ? 'rgba(255, 250, 101, 0.9)' : 'rgba(112, 161, 255, 0.85)';
      ctx.fillText(countdownText, 0, 0);
      ctx.restore();

      const hintText = mobile ? '◀ タップ または スライドで移動 ▶' : '◀ 矢印キー（← →）で移動 ▶';
      const hintY = canvas.height / 2 + (mobile ? 95 : 68);
      ctx.font = mobile ? 'bold 30px sans-serif' : 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = mobile ? 7 : 5;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.strokeText(hintText, canvas.width / 2, hintY);
      ctx.fillStyle = '#7bed9f';
      ctx.fillText(hintText, canvas.width / 2, hintY);

      ctx.restore();
    }

    if (isGameOver) {
      const mobile = isMobileDevice();
      const buttons = getGameOverButtons();
      const diffBest = bestScores[selectedDifficulty] || 0;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#ff4757';
      ctx.font = mobile ? 'bold 76px sans-serif' : 'bold 46px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', canvas.width / 2, mobile ? canvas.height / 2 - 190 : canvas.height / 2 - 125);

      if (isNewRecord && score > 0) {
        ctx.fillStyle = '#fffa65';
        ctx.font = mobile ? 'bold 34px sans-serif' : 'bold 20px sans-serif';
        ctx.fillText('★ NEW RECORD! ★', canvas.width / 2, mobile ? canvas.height / 2 - 135 : canvas.height / 2 - 86);
      }

      ctx.fillStyle = '#ffffff';
      ctx.font = mobile ? 'bold 36px sans-serif' : '22px sans-serif';
      ctx.fillText(`${currentUsername} さんのスコア: ${score}`, canvas.width / 2, mobile ? canvas.height / 2 - 88 : canvas.height / 2 - 52);

      ctx.fillStyle = '#7bed9f';
      ctx.font = mobile ? 'bold 28px sans-serif' : '18px sans-serif';
      ctx.fillText(`${selectedDifficulty.toUpperCase()} 自己ベスト: ${diffBest}`, canvas.width / 2, mobile ? canvas.height / 2 - 46 : canvas.height / 2 - 22);

      const statList = [
        { key: 'apple', color: '#7bed9f' },
        { key: 'strawberry', color: '#7bed9f' },
        { key: 'star', color: '#fffa65' },
        { key: 'clock', color: '#70a1ff' },
        { key: 'chestnut', color: '#ff6b81' },
        { key: 'bomb', color: '#ff4757' }
      ];
      const barWidth = mobile ? 720 : 520;
      const barHeight = mobile ? 66 : 46;
      const barX = (canvas.width - barWidth) / 2;
      const barY = mobile ? canvas.height / 2 - 22 : canvas.height / 2 + 4;

      ctx.fillStyle = 'rgba(47, 54, 64, 0.9)';
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(barX, barY, barWidth, barHeight, 10);
      } else {
        ctx.rect(barX, barY, barWidth, barHeight);
      }
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const slotWidth = barWidth / statList.length;
      const iconSize = mobile ? 34 : 24;
      statList.forEach((entry, idx) => {
        const slotCenterX = barX + slotWidth * idx + slotWidth / 2;
        const iconX = slotCenterX - (mobile ? 44 : 30);
        const iconY = barY + (barHeight - iconSize) / 2;

        if (entry.key === 'chestnut') {
          drawChestnutIcon(iconX, iconY, iconSize);
        } else {
          const img = itemImages[entry.key];
          if (img && img.complete) {
            ctx.drawImage(img, iconX, iconY, iconSize, iconSize);
          }
        }

        ctx.fillStyle = entry.color;
        ctx.font = mobile ? 'bold 26px sans-serif' : 'bold 16px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`×${itemStats[entry.key]}`, iconX + iconSize + (mobile ? 6 : 4), barY + (mobile ? 42 : 29));
      });
      ctx.textAlign = 'center';

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
      ctx.font = mobile ? 'bold 34px sans-serif' : 'bold 18px sans-serif';
      ctx.fillText(retry.label, canvas.width / 2, retry.y + (mobile ? 49 : 26));

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
        ctx.font = mobile ? 'bold 26px sans-serif' : 'bold 14px sans-serif';
        ctx.fillText(btn.label, btn.x + btn.width / 2, btn.y + (mobile ? 38 : 22));
      });

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
        ctx.font = mobile ? 'bold 25px sans-serif' : 'bold 14px sans-serif';
        ctx.fillText(subBtn.label, subBtn.x + subBtn.width / 2, subBtn.y + (mobile ? 35 : 22));
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