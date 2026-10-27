const GRID = 20;
const COLS = 20;
const ROWS = 20;
const SIZE = GRID * COLS;
const BASE_INTERVAL = 150;
const SPEED_STEP = 15;
const POINTS_PER_FOOD = 10;
const FOODS_PER_LEVEL = 5;
const LEADERBOARD_SIZE = 5;

const COLOR_GLAZE  = [251, 252, 254];
const COLOR_GROUT  = '#e1e7f1';
const COLOR_COBALT = [30, 68, 160];
const COLOR_WASH   = [143, 168, 218];
const COLOR_OCHRE  = '#d99a1e';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const DPR = Math.min(window.devicePixelRatio || 1, 3);
canvas.width = SIZE * DPR;
canvas.height = SIZE * DPR;
ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const levelPipsEl = document.getElementById('levelPips');
const highScoreEl = document.getElementById('high-score');
const finalScoreEl = document.getElementById('finalScore');
const newRecordEl = document.getElementById('newRecord');
const gameOverTitleEl = document.getElementById('gameOverTitle');
const leaderboardListEl = document.getElementById('leaderboardList');
const levelUpText = document.getElementById('levelUpText');

const startScreen = document.getElementById('startScreen');
const levelUpScreen = document.getElementById('levelUpScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const restartButton = document.getElementById('restartButton');

let snake, direction, nextDirection, food;
let score, level, foodEaten, highScore;
let intervalId, gameState;

// Lays text into a plaque, one letter per tile; spaces become blank tiles.
function setPlaque(el, text) {
  const letters = [...text.toUpperCase()];
  el.setAttribute('aria-label', text);
  el.style.setProperty('--cols', letters.length);
  el.innerHTML = letters
    .map((ch, i) => `<span class="plaque__tile" aria-hidden="true" style="--i:${i}">${ch === ' ' ? '' : ch}</span>`)
    .join('');
}

function loadLeaderboard() {
  try {
    const d = JSON.parse(localStorage.getItem('snakeLeaderboard') || '[]');
    return Array.isArray(d) ? d.filter(n => Number.isFinite(n)) : [];
  } catch { return []; }
}

function addToLeaderboard(s) {
  const scores = loadLeaderboard();
  scores.push(s);
  scores.sort((a, b) => b - a);
  if (scores.length > LEADERBOARD_SIZE) scores.length = LEADERBOARD_SIZE;
  try { localStorage.setItem('snakeLeaderboard', JSON.stringify(scores)); } catch {}
  return scores;
}

function renderLeaderboard(scores, current) {
  const mine = scores.indexOf(current);
  leaderboardListEl.innerHTML = scores
    .map((s, i) => `<li${i === mine ? ' class="is-current"' : ''}><span>${i + 1}º</span><span>${s}</span></li>`)
    .join('');
}

// The tiled wall is static, so it is painted once and copied every frame.
const tiles = document.createElement('canvas');
tiles.width = SIZE * DPR;
tiles.height = SIZE * DPR;

function paintTiles() {
  const t = tiles.getContext('2d');
  t.setTransform(DPR, 0, 0, DPR, 0, 0);

  // Hand-made tiles are never quite the same white.
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const jitter = ((col * 31 + row * 17 + col * row * 7) % 3) - 1;
      const [r, g, b] = COLOR_GLAZE.map(c => c + jitter);
      t.fillStyle = `rgb(${r}, ${g}, ${b})`;
      t.fillRect(col * GRID, row * GRID, GRID, GRID);
    }
  }

  // Quarter-circle corners on every tile meet as a ring and dot at each joint.
  t.fillStyle = 'rgba(30, 68, 160, 0.10)';
  t.strokeStyle = 'rgba(30, 68, 160, 0.10)';
  t.lineWidth = 1;
  for (let col = 0; col <= COLS; col++) {
    for (let row = 0; row <= ROWS; row++) {
      t.beginPath();
      t.arc(col * GRID, row * GRID, 2.5, 0, Math.PI * 2);
      t.fill();
      t.beginPath();
      t.arc(col * GRID, row * GRID, 6.5, 0, Math.PI * 2);
      t.stroke();
    }
  }

  t.strokeStyle = COLOR_GROUT;
  t.beginPath();
  for (let i = 1; i < COLS; i++) {
    t.moveTo(i * GRID + 0.5, 0);
    t.lineTo(i * GRID + 0.5, SIZE);
  }
  for (let i = 1; i < ROWS; i++) {
    t.moveTo(0, i * GRID + 0.5);
    t.lineTo(SIZE, i * GRID + 0.5);
  }
  t.stroke();
}

function renderPips() {
  levelPipsEl.innerHTML = Array.from({ length: FOODS_PER_LEVEL }, (_, i) =>
    `<i${i < foodEaten ? ' class="is-filled"' : ''}></i>`
  ).join('');
}

function showOverlay(el) {
  [startScreen, levelUpScreen, gameOverScreen].forEach(o => o.classList.add('hidden'));
  el.classList.remove('hidden');
}

function hideOverlays() {
  [startScreen, levelUpScreen, gameOverScreen].forEach(o => o.classList.add('hidden'));
}

function spawnFood() {
  const occupied = new Set(snake.map(s => `${s.x},${s.y}`));
  if (occupied.size >= COLS * ROWS) return null;
  let pos;
  do {
    pos = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
  } while (occupied.has(`${pos.x},${pos.y}`));
  return pos;
}

function startLoop() {
  clearInterval(intervalId);
  const interval = Math.max(50, BASE_INTERVAL - (level - 1) * SPEED_STEP);
  intervalId = setInterval(tick, interval);
}

function initGame() {
  const cx = Math.floor(COLS / 2);
  const cy = Math.floor(ROWS / 2);
  snake = [
    { x: cx,     y: cy },
    { x: cx - 1, y: cy },
    { x: cx - 2, y: cy },
  ];
  direction = { x: 1, y: 0 };
  nextDirection = { x: 1, y: 0 };
  score = 0;
  level = 1;
  foodEaten = 0;
  highScore = loadLeaderboard()[0] || 0;
  food = spawnFood();
  gameState = 'playing';

  updateHUD();
  hideOverlays();
  render();
  startLoop();
}

function startIfIdle() {
  if (gameState === 'start' || gameState === 'gameover') initGame();
}

function tick() {
  update();
  render();
}

function update() {
  direction = nextDirection;

  const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };

  if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
    finishGame('Fim de jogo');
    return;
  }

  // Exclude the tail: it vacates its cell this tick (when no food is eaten),
  // so moving into that cell is valid.
  if (snake.slice(0, -1).some(s => s.x === head.x && s.y === head.y)) {
    finishGame('Fim de jogo');
    return;
  }

  snake.unshift(head);

  if (head.x === food.x && head.y === food.y) {
    score += POINTS_PER_FOOD;
    foodEaten++;
    if (score > highScore) {
      highScore = score;
    }
    updateHUD();

    if (foodEaten >= FOODS_PER_LEVEL) {
      triggerLevelUp();
    } else {
      const nextFood = spawnFood();
      if (!nextFood) { finishGame('Você venceu'); return; }
      food = nextFood;
    }
  } else {
    snake.pop();
  }
}

function triggerLevelUp() {
  clearInterval(intervalId);
  gameState = 'levelup';
  level++;
  foodEaten = 0;
  const nextFood = spawnFood();
  if (!nextFood) { finishGame('Você venceu'); return; }
  food = nextFood;
  updateHUD();
  render();

  setPlaque(levelUpText, `Nível ${level}`);
  showOverlay(levelUpScreen);

  setTimeout(() => {
    if (gameState === 'levelup') {
      hideOverlays();
      gameState = 'playing';
      startLoop();
    }
  }, 1000);
}

function finishGame(title) {
  clearInterval(intervalId);
  gameState = 'gameover';
  const previousBest = loadLeaderboard()[0] || 0;
  const scores = addToLeaderboard(score);
  highScore = scores[0] || 0;
  finalScoreEl.textContent = score;
  newRecordEl.hidden = !(score > previousBest);
  setPlaque(gameOverTitleEl, title);
  renderLeaderboard(scores, score);
  updateHUD();
  showOverlay(gameOverScreen);
  restartButton.focus({ preventScroll: true });
}

function updateHUD() {
  scoreEl.textContent = score;
  levelEl.textContent = level;
  highScoreEl.textContent = highScore;
  renderPips();
}

function mix(from, to, t) {
  const [r, g, b] = from.map((c, i) => Math.round(c + (to[i] - c) * t));
  return `rgb(${r}, ${g}, ${b})`;
}

function center(cell) {
  return [cell.x * GRID + GRID / 2, cell.y * GRID + GRID / 2];
}

// The snake is one continuous brushstroke, deep cobalt at the head
// thinning to a pale wash at the tail.
function drawSnake() {
  const n = snake.length;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = GRID - 6;
  for (let i = n - 1; i > 0; i--) {
    ctx.strokeStyle = mix(COLOR_COBALT, COLOR_WASH, Math.min(0.85, i / Math.max(n - 1, 1)));
    ctx.beginPath();
    ctx.moveTo(...center(snake[i]));
    ctx.lineTo(...center(snake[i - 1]));
    ctx.stroke();
  }

  const [hx, hy] = center(snake[0]);
  ctx.fillStyle = `rgb(${COLOR_COBALT})`;
  ctx.beginPath();
  ctx.arc(hx, hy, GRID / 2 - 2, 0, Math.PI * 2);
  ctx.fill();

  // Eyes sit forward of center, spread across the direction of travel.
  const dir = direction || { x: 1, y: 0 };
  ctx.fillStyle = '#fbfcfe';
  [-1, 1].forEach(side => {
    ctx.beginPath();
    ctx.arc(hx + dir.x * 3 + dir.y * side * 3.5, hy + dir.y * 3 - dir.x * side * 3.5, 1.8, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Food is a four-petal rosette, the commonest azulejo flower.
function drawFood() {
  const [fx, fy] = center(food);
  ctx.fillStyle = COLOR_OCHRE;
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4;
    ctx.beginPath();
    ctx.arc(fx + Math.cos(a) * 4, fy + Math.sin(a) * 4, 3.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = `rgb(${COLOR_COBALT})`;
  ctx.beginPath();
  ctx.arc(fx, fy, 2.4, 0, Math.PI * 2);
  ctx.fill();
}

function render() {
  ctx.drawImage(tiles, 0, 0, SIZE, SIZE);
  if (!snake || !food) return;
  drawFood();
  drawSnake();
}

function setDirection(newDir) {
  if (gameState !== 'playing') return;
  if (newDir.x === -direction.x && newDir.y === -direction.y) return;
  nextDirection = newDir;
}

const DIRS = {
  up:    { x: 0,  y: -1 },
  down:  { x: 0,  y:  1 },
  left:  { x: -1, y:  0 },
  right: { x: 1,  y:  0 },
};

document.addEventListener('keydown', (e) => {
  const keys = {
    ArrowUp: DIRS.up, ArrowDown: DIRS.down, ArrowLeft: DIRS.left, ArrowRight: DIRS.right,
    w: DIRS.up, s: DIRS.down, a: DIRS.left, d: DIRS.right,
    W: DIRS.up, S: DIRS.down, A: DIRS.left, D: DIRS.right,
  };

  if (e.key === 'Enter') {
    if (gameState === 'start' || gameState === 'gameover') {
      e.preventDefault();
      initGame();
    }
    return;
  }

  const newDir = keys[e.key];
  if (!newDir) return;

  e.preventDefault();
  setDirection(newDir);
});

document.getElementById('startButton').addEventListener('click', startIfIdle);
restartButton.addEventListener('click', startIfIdle);

let touchStart = null;
const board = document.getElementById('board');
board.addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  touchStart = { x: t.clientX, y: t.clientY };
}, { passive: true });

board.addEventListener('touchmove', (e) => {
  if (!touchStart) return;
  const t = e.touches[0];
  const dx = t.clientX - touchStart.x;
  const dy = t.clientY - touchStart.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
  setDirection(Math.abs(dx) > Math.abs(dy)
    ? (dx > 0 ? DIRS.right : DIRS.left)
    : (dy > 0 ? DIRS.down : DIRS.up));
  touchStart = { x: t.clientX, y: t.clientY };
}, { passive: true });

board.addEventListener('touchend', () => { touchStart = null; });

setPlaque(document.getElementById('title'), 'Jogo da Cobra');
paintTiles();
highScore = loadLeaderboard()[0] || 0;
highScoreEl.textContent = highScore;
foodEaten = 0;
renderPips();
gameState = 'start';

render();
