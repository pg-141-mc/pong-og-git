// Enhanced Pong: Start/Pause, AI difficulty, win condition, and sounds.
(() => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  // DOM controls
  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const restartBtn = document.getElementById('restartBtn');
  const difficultySelect = document.getElementById('difficulty');
  const winScoreInput = document.getElementById('winScore');
  const volumeControl = document.getElementById('volume');
  const overlay = document.getElementById('overlay');
  const overlayMsg = document.getElementById('overlayMsg');
  const overlayStart = document.getElementById('overlayStart');

  const playerScoreEl = document.getElementById('playerScore');
  const computerScoreEl = document.getElementById('computerScore');

  const W = canvas.width;
  const H = canvas.height;

  // Game objects
  const paddleWidth = 12;
  const paddleHeight = 110;
  const basePaddleSpeed = 6; // arrow keys
  const ballRadius = 8;

  const player = {
    x: 12,
    y: (H - paddleHeight) / 2,
    width: paddleWidth,
    height: paddleHeight
  };

  const computer = {
    x: W - paddleWidth - 12,
    y: (H - paddleHeight) / 2,
    width: paddleWidth,
    height: paddleHeight
  };

  const ball = {
    x: W / 2,
    y: H / 2,
    vx: 0,
    vy: 0,
    speed: 5,
    radius: ballRadius
  };

  // Scores and game state
  let playerScore = 0;
  let computerScore = 0;
  let winScore = parseInt(winScoreInput.value, 10) || 7;

  let gameState = 'menu'; // 'menu' | 'running' | 'paused' | 'gameover'
  let rafId = null;

  // Input states
  const keys = { ArrowUp: false, ArrowDown: false };

  // AI parameters (controlled via difficulty)
  const difficultyPresets = {
    easy: { aiSpeed: 3.0, reaction: 0.18 },
    normal: { aiSpeed: 4.2, reaction: 0.45 },
    hard: { aiSpeed: 6.0, reaction: 0.85 }
  };
  let aiSpeed = difficultyPresets.normal.aiSpeed;
  let aiReaction = difficultyPresets.normal.reaction;

  // Audio (WebAudio) setup
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  let audioCtx = null;
  let masterGain = null;
  function ensureAudio() {
    if (!audioCtx) {
      audioCtx = new AudioContext();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = parseFloat(volumeControl.value || 0.8);
      masterGain.connect(audioCtx.destination);
    }
  }
  volumeControl.addEventListener('input', () => {
    if (masterGain) masterGain.gain.value = parseFloat(volumeControl.value);
  });

  // Sound helper: short tone with simple envelope
  function playTone(freq = 440, duration = 0.12, type = 'sine', gain = 0.12) {
    try {
      ensureAudio();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = 0;
      o.connect(g);
      g.connect(masterGain);
      const now = audioCtx.currentTime;
      // attack
      g.gain.linearRampToValueAtTime(gain, now + 0.01);
      // release
      g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      o.start(now);
      o.stop(now + duration + 0.02);
    } catch (e) {
      // AudioContext suspended/blocked: ignore
    }
  }

  // Preset sound events
  function sfxPaddle() { playTone(720, 0.12, 'sawtooth', 0.12); }
  function sfxWall() { playTone(300, 0.10, 'sine', 0.09); }
  function sfxScore() { playTone(180, 0.32, 'triangle', 0.14); }
  function sfxWin() {
    // small melody for win
    playTone(900, 0.12, 'sine', 0.18);
    setTimeout(() => playTone(1100, 0.18, 'sine', 0.18), 140);
    setTimeout(() => playTone(1300, 0.22, 'sine', 0.16), 320);
  }

  // Initialize ball to center with random angle, direction param: 1 -> right, -1 -> left
  function resetBall(direction = (Math.random() > 0.5 ? 1 : -1)) {
    ball.x = W / 2;
    ball.y = H / 2;
    ball.speed = 5;
    const angle = (Math.random() * 0.7 - 0.35); // -0.35..0.35 radians
    ball.vx = direction * ball.speed * Math.cos(angle);
    ball.vy = ball.speed * Math.sin(angle);
  }

  // Clamp helper
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  // Input: mouse
  let mouseActive = false;
  canvas.addEventListener('mousemove', (e) => {
    if (gameState !== 'running') return;
    const rect = canvas.getBoundingClientRect();
    const mouseY = e.clientY - rect.top;
    player.y = clamp(mouseY - player.height / 2, 0, H - player.height);
    mouseActive = true;
  });

  // Input: keyboard
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      keys[e.key] = true;
      e.preventDefault();
    } else if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      togglePause();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      keys[e.key] = false;
      e.preventDefault();
    }
  });

  // Button handlers
  startBtn.addEventListener('click', () => {
    startGame();
    canvas.focus();
  });
  pauseBtn.addEventListener('click', togglePause);
  restartBtn.addEventListener('click', () => {
    resetScores();
    startGame();
    canvas.focus();
  });
  overlayStart.addEventListener('click', () => {
    startGame();
    canvas.focus();
  });

  difficultySelect.addEventListener('change', () => {
    applyDifficulty();
  });
  winScoreInput.addEventListener('change', () => {
    const v = parseInt(winScoreInput.value, 10);
    if (!isNaN(v) && v > 0) winScore = v;
  });

  // Apply difficulty preset
  function applyDifficulty() {
    const d = difficultySelect.value;
    const preset = difficultyPresets[d] || difficultyPresets.normal;
    aiSpeed = preset.aiSpeed;
    aiReaction = preset.reaction;
  }
  applyDifficulty();

  // Game control functions
  function startGame() {
    if (gameState === 'running') return;
    if (!audioCtx) {
      // resume/create audio context on first user gesture
      try { ensureAudio(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch {}
    }
    winScore = parseInt(winScoreInput.value, 10) || winScore;
    resetBall((Math.random() > 0.5) ? 1 : -1);
    gameState = 'running';
    overlay.classList.add('hidden');
    startBtn.disabled = true;
    pauseBtn.disabled = false;
    restartBtn.disabled = false;
    if (!rafId) loop();
  }

  function pauseGame() {
    if (gameState !== 'running') return;
    gameState = 'paused';
    pauseBtn.textContent = 'Resume';
    overlayMsg.textContent = 'Paused';
    overlay.classList.remove('hidden');
  }

  function resumeGame() {
    if (gameState !== 'paused') return;
    gameState = 'running';
    pauseBtn.textContent = 'Pause';
    overlay.classList.add('hidden');
    if (!rafId) loop();
  }

  function togglePause() {
    if (gameState === 'running') {
      pauseGame();
    } else if (gameState === 'paused') {
      resumeGame();
    } else if (gameState === 'menu') {
      startGame();
    }
  }

  function resetScores() {
    playerScore = 0;
    computerScore = 0;
    updateScoreDOM();
  }

  function endGame(winner) {
    gameState = 'gameover';
    cancelAnimationFrame(rafId);
    rafId = null;
    overlay.classList.remove('hidden');
    overlayMsg.textContent = (winner === 'player') ? 'You Win!' : 'Computer Wins';
    overlayStart.textContent = 'Play Again';
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    pauseBtn.textContent = 'Pause';
    sfxWin();
  }

  // Scoreboard DOM sync
  function updateScoreDOM() {
    playerScoreEl.textContent = playerScore;
    computerScoreEl.textContent = computerScore;
  }

  // Physics and collision
  function reflectBallFromPaddle(paddle) {
    // Compute relative intersection (-1..1)
    const paddleCenter = paddle.y + paddle.height / 2;
    const relativeY = (ball.y - paddleCenter);
    const normalized = relativeY / (paddle.height / 2);
    const maxBounce = Math.PI / 3; // 60 degrees
    const bounceAngle = normalized * maxBounce;
    const direction = (paddle === player) ? 1 : -1;
    // Slight speedup per hit
    ball.speed = Math.min(12, ball.speed + 0.25);
    ball.vx = direction * ball.speed * Math.cos(bounceAngle);
    ball.vy = ball.speed * Math.sin(bounceAngle);
  }

  // Main update step
  function update() {
    if (gameState !== 'running') return;

    // Player keyboard movement only when keys used
    if (!mouseActive) {
      if (keys.ArrowUp) player.y -= basePaddleSpeed;
      if (keys.ArrowDown) player.y += basePaddleSpeed;
      player.y = clamp(player.y, 0, H - player.height);
    }

    // Simple AI with reaction smoothing:
    // predict target = ball.y - half paddle, then lerp toward it depending on reaction and aiSpeed
    const desired = ball.y - computer.height / 2;
    // Move proportionally to distance, clamped by aiSpeed
    const delta = desired - computer.y;
    // apply reaction (0..1) as fraction of delta to attempt to close per frame, but limit by aiSpeed
    const move = clamp(delta * aiReaction, -aiSpeed, aiSpeed);
    computer.y += move;
    computer.y = clamp(computer.y, 0, H - computer.height);

    // Move ball
    ball.x += ball.vx;
    ball.y += ball.vy;

    // Wall collisions
    if (ball.y - ball.radius <= 0) {
      ball.y = ball.radius;
      ball.vy = -ball.vy;
      sfxWall();
    } else if (ball.y + ball.radius >= H) {
      ball.y = H - ball.radius;
      ball.vy = -ball.vy;
      sfxWall();
    }

    // Paddle collisions (player)
    if (ball.vx < 0 && ball.x - ball.radius <= player.x + player.width) {
      if (ball.y >= player.y && ball.y <= player.y + player.height) {
        ball.x = player.x + player.width + ball.radius;
        reflectBallFromPaddle(player);
        sfxPaddle();
      }
    }

    // Paddle collisions (computer)
    if (ball.vx > 0 && ball.x + ball.radius >= computer.x) {
      if (ball.y >= computer.y && ball.y <= computer.y + computer.height) {
        ball.x = computer.x - ball.radius;
        reflectBallFromPaddle(computer);
        sfxPaddle();
      }
    }

    // Score detection (use margin so ball visibly leaves)
    if (ball.x < -60) {
      // computer scores
      computerScore++;
      updateScoreDOM();
      sfxScore();
      if (computerScore >= winScore) {
        endGame('computer');
        return;
      }
      resetBall(1);
    } else if (ball.x > W + 60) {
      // player scores
      playerScore++;
      updateScoreDOM();
      sfxScore();
      if (playerScore >= winScore) {
        endGame('player');
        return;
      }
      resetBall(-1);
    }
  }

  // Drawing
  function draw() {
    // clear
    ctx.clearRect(0, 0, W, H);

    // center dashed net
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    const netWidth = 4;
    const segment = 18;
    for (let y = 0; y < H; y += segment * 2) {
      ctx.fillRect((W - netWidth) / 2, y, netWidth, segment);
    }

    // paddles
    drawRoundedRect(player.x, player.y, player.width, player.height, 4, '#00d1ff');
    drawRoundedRect(computer.x, computer.y, computer.width, computer.height, 4, '#ff7b7b');

    // ball
    ctx.beginPath();
    ctx.fillStyle = '#e6eef6';
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();

    // glow
    ctx.beginPath();
    const g = ctx.createRadialGradient(ball.x, ball.y, ball.radius / 2, ball.x, ball.y, ball.radius * 4);
    g.addColorStop(0, 'rgba(230,238,246,0.09)');
    g.addColorStop(1, 'rgba(230,238,246,0)');
    ctx.fillStyle = g;
    ctx.arc(ball.x, ball.y, ball.radius * 3, 0, Math.PI * 2);
    ctx.fill();

    // optionally show paused text
    if (gameState === 'paused') {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(W/2 - 160, H/2 - 36, 320, 72);
      ctx.fillStyle = 'rgba(230,238,246,0.95)';
      ctx.font = '20px system-ui, Arial';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', W / 2, H / 2 + 6);
    }
  }

  function drawRoundedRect(x, y, w, h, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  // Main loop
  function loop() {
    rafId = requestAnimationFrame(loop);
    update();
    draw();
    if (gameState === 'gameover' || gameState === 'menu') {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  // Initial state
  function init() {
    overlay.classList.remove('hidden');
    overlayMsg.textContent = 'Press Start to play';
    overlayStart.textContent = 'Start Game';
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    restartBtn.disabled = true;
    resetScores();
    resetBall((Math.random() > 0.5) ? 1 : -1);
    updateScoreDOM();
    // allow canvas to be focused for keyboard (space)
    canvas.setAttribute('tabindex', '0');
  }
  init();

  // Expose for debugging if needed
  window._pong = {
    resetBall, startGame, pauseGame, resumeGame, endGame, resetScores
  };

})();