const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const overlay = document.getElementById('game-overlay');
const overlayStartBtn = document.getElementById('overlay-start-btn');
const startRunBtn = document.getElementById('start-run-btn');
const showTipBtn = document.getElementById('show-tip-btn');
const heroTip = document.getElementById('hero-tip');

const overlayBadge = document.querySelector('.overlay-badge');
const overlayTitle = document.querySelector('.overlay-card h3');
const overlayText = document.querySelector('.overlay-card p');
const overlayHelper = document.getElementById('overlay-helper');

const playerNameInput = document.getElementById('player-name-input');
const playerValue = document.getElementById('player-value');
const distanceValue = document.getElementById('distance-value');
const coinValue = document.getElementById('coin-value');
const bestValue = document.getElementById('best-value');

const guestbookCount = document.getElementById('guestbook-count');
const guestbookList = document.getElementById('guestbook-list');
const guestbookForm = document.getElementById('guestbook-form');
const guestbookInput = document.getElementById('guestbook-input');
const leaderboardList = document.getElementById('leaderboard-list');
const jumpBtn = document.getElementById('jump-btn');
const duckBtn = document.getElementById('duck-btn');
const pauseBtn = document.getElementById('pause-btn');

const otterSource = document.getElementById('otter-source');

const STORAGE_KEYS = {
  visitors: 'karby_visitors',
  guestbook: 'karby_guestbook',
  leaderboard: 'karby_leaderboard',
  lastPlayer: 'karby_last_player',
};

const groundY = canvas.height - 96;
const obstacles = [];
const collectibles = [];
const flyers = [];
const particles = [];

let visitors = loadJson(STORAGE_KEYS.visitors, []);
let guestbook = loadJson(STORAGE_KEYS.guestbook, []);
let leaderboard = loadJson(STORAGE_KEYS.leaderboard, []);
let otterSprite = null;
let spawnTimer = 0;
let collectibleTimer = 0;
let flyerTimer = 0;
let cloudOffset = 0;
let hillOffset = 0;
let sparkOffset = 0;

const state = {
  playing: false,
  paused: false,
  distance: 0,
  coins: 0,
  best: 0,
  speed: 5.6,
  gravity: 0.78,
  lastTime: 0,
  playerName: localStorage.getItem(STORAGE_KEYS.lastPlayer) || 'yelin',
};

const player = {
  x: 140,
  y: 0,
  width: 104,
  height: 116,
  baseHeight: 116,
  velocityY: 0,
  jumpPower: -16.6,
  grounded: true,
  bob: 0,
  ducking: false,
};

function loadJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function normalizeName(value) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 18);
}

function isEditableTarget(target) {
  return Boolean(target && target.closest('input, textarea, [contenteditable="true"]'));
}

function updateOverlay(mode, message) {
  if (mode === 'ready') {
    overlayBadge.textContent = 'READY';
    overlayTitle.textContent = '카비와 함께 출발할 이름을 적어주세요';
    overlayText.textContent = message || '이름을 입력하면 방문자 채팅에 글을 남길 수 있고, 게임 종료 후 점수 랭킹에도 반영됩니다.';
    overlayStartBtn.textContent = '출발하기';
  } else {
    overlayBadge.textContent = 'GAME OVER';
    overlayTitle.textContent = `${state.playerName || 'Guest'}의 러닝 기록`;
    overlayText.textContent = message;
    overlayStartBtn.textContent = '다시 달리기';
  }
}

function setHelper(text, isError = false) {
  overlayHelper.textContent = text;
  overlayHelper.classList.toggle('error', isError);
}

function findLeaderboardEntry(name) {
  return leaderboard.find(entry => entry.name.toLowerCase() === name.toLowerCase());
}

function refreshPlayerHud() {
  playerValue.textContent = state.playerName || 'Guest';
  const best = findLeaderboardEntry(state.playerName || '');
  state.best = best ? best.bestDistance : 0;
  bestValue.textContent = `${String(Math.floor(state.best)).padStart(3, '0')}m`;
}

function renderHud() {
  playerValue.textContent = state.playerName || 'Guest';
  distanceValue.textContent = `${String(Math.floor(state.distance)).padStart(3, '0')}m`;
  coinValue.textContent = String(state.coins).padStart(2, '0');
  bestValue.textContent = `${String(Math.floor(state.best)).padStart(3, '0')}m`;
}

function registerVisitor(name) {
  const now = new Date().toISOString();
  const existingIndex = visitors.findIndex(entry => entry.name.toLowerCase() === name.toLowerCase());
  if (existingIndex >= 0) {
    const existing = visitors.splice(existingIndex, 1)[0];
    visitors.unshift({
      ...existing,
      name,
      visits: (existing.visits || 0) + 1,
      lastSeen: now,
    });
  } else {
    visitors.unshift({
      name,
      visits: 1,
      lastSeen: now,
    });
  }
  visitors = visitors.slice(0, 12);
  saveJson(STORAGE_KEYS.visitors, visitors);
}

function updateLeaderboard(distance, coins) {
  const name = state.playerName;
  if (!name) return;

  const existing = findLeaderboardEntry(name);
  const now = new Date().toISOString();
  if (!existing) {
    leaderboard.push({
      name,
      bestDistance: distance,
      bestCoins: coins,
      updatedAt: now,
    });
  } else if (
    distance > existing.bestDistance ||
    (distance === existing.bestDistance && coins > existing.bestCoins)
  ) {
    existing.bestDistance = distance;
    existing.bestCoins = coins;
    existing.updatedAt = now;
  }

  leaderboard.sort((a, b) => {
    if (b.bestDistance !== a.bestDistance) return b.bestDistance - a.bestDistance;
    if (b.bestCoins !== a.bestCoins) return b.bestCoins - a.bestCoins;
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });
  leaderboard = leaderboard.slice(0, 20);
  saveJson(STORAGE_KEYS.leaderboard, leaderboard);
  refreshPlayerHud();
  renderLeaderboard();
}

function formatSeen(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderGuestbook() {
  guestbookCount.textContent = `${guestbook.length}개`;
  if (!guestbook.length) {
    guestbookList.innerHTML = '<li class="empty-state">아직 남겨진 글이 없어요. 첫 메시지를 남겨보세요.</li>';
    return;
  }

  guestbookList.innerHTML = guestbook
    .map(entry => (
      `<li class="board-item">
        <div>
          <strong>${entry.name}</strong>
          <div class="visitor-meta">${entry.message}</div>
        </div>
        <span class="visitor-meta">${formatSeen(entry.createdAt)}</span>
      </li>`
    ))
    .join('');
}

function addGuestbookMessage() {
  const message = guestbookInput.value.trim();
  const author = normalizeName(state.playerName || playerNameInput.value);

  if (!author) {
    setHelper('채팅 글을 남기려면 먼저 사용자 이름을 입력해 주세요.', true);
    playerNameInput.focus();
    return;
  }

  if (!message) return;

  if (author !== state.playerName) {
    setCurrentPlayer(author);
  }

  registerVisitor(author);
  guestbook.unshift({
    name: author,
    message: message.slice(0, 120),
    createdAt: new Date().toISOString(),
  });
  guestbook = guestbook.slice(0, 16);
  saveJson(STORAGE_KEYS.guestbook, guestbook);
  guestbookInput.value = '';
  renderGuestbook();
}

function renderLeaderboard() {
  if (!leaderboard.length) {
    leaderboardList.innerHTML = '<li class="empty-state">아직 기록이 없어요. 첫 점수를 만들어보세요.</li>';
    return;
  }

  leaderboardList.innerHTML = leaderboard.slice(0, 5)
    .map((entry, index) => (
      `<li class="leaderboard-item">
        <span class="rank-badge">${index + 1}</span>
        <div>
          <strong>${entry.name}</strong>
          <div class="leader-meta">${entry.bestDistance}m · 조개 ${entry.bestCoins}개</div>
        </div>
        <span class="visitor-meta">${formatSeen(entry.updatedAt)}</span>
      </li>`
    ))
    .join('');
}

function setCurrentPlayer(name) {
  state.playerName = name;
  playerNameInput.value = name;
  localStorage.setItem(STORAGE_KEYS.lastPlayer, name);
  refreshPlayerHud();
  renderHud();
}

function startGameFromInput() {
  if (!playerNameInput.value.trim()) {
    playerNameInput.value = state.playerName || 'yelin';
  }
  const name = normalizeName(playerNameInput.value) || state.playerName || 'yelin';
  if (!name) {
    setHelper('게임 시작 전에 사용자 이름을 입력해 주세요.', true);
    playerNameInput.focus();
    return;
  }

  setCurrentPlayer(name);
  registerVisitor(name);
  setHelper('좋아요. 이제 바위를 피하고 조개를 모아보세요.');
  resetGame();
}

function resetGame() {
  state.distance = 0;
  state.coins = 0;
  state.speed = 4.15;
  state.playing = true;
  state.paused = false;
  state.lastTime = 0;
  obstacles.length = 0;
  collectibles.length = 0;
  flyers.length = 0;
  particles.length = 0;
  spawnTimer = 0;
  collectibleTimer = 0;
  flyerTimer = 0;
  player.y = groundY - player.height;
  player.velocityY = 0;
  player.grounded = true;
  player.ducking = false;
  updateOverlay('ready');
  overlay.classList.add('hidden');
  updatePauseButton();
  renderHud();
}

function togglePause() {
  if (!state.playing) return;
  state.paused = !state.paused;
  updatePauseButton();
  setHelper(state.paused ? '일시정지됨. ESC를 다시 누르면 이어집니다.' : '다시 출발!');
}

function updatePauseButton() {
  if (!pauseBtn) return;
  pauseBtn.textContent = state.paused ? '다시시작' : '일시정지';
}

function jump() {
  if (!state.playing || state.paused) return;
  if (!player.grounded) return;
  if (player.ducking) stopDuck();
  player.velocityY = player.jumpPower;
  player.grounded = false;
  emitDust(player.x + 20, player.y + player.height - 6, 8, '#f1d29d');
}

function startDuck() {
  if (!state.playing || state.paused) return;
  if (!player.grounded) return;
  if (player.ducking) return;
  player.ducking = true;
  player.height = 88;
  player.y = groundY - player.height;
}

function stopDuck() {
  if (!player.ducking) return;
  player.ducking = false;
  player.height = player.baseHeight;
  player.y = Math.min(player.y, groundY - player.height);
}

function emitDust(x, y, count, color) {
  for (let index = 0; index < count; index += 1) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 3.4,
      vy: -Math.random() * 2.5,
      life: 20 + Math.random() * 10,
      color,
    });
  }
}

function maybeSpawnObstacle(delta) {
  spawnTimer += delta;
  const threshold = Math.max(1120, 2200 - state.distance * 1.05);
  if (spawnTimer < threshold) return;
  spawnTimer = 0;

  const largeChance = Math.min(0.62, 0.12 + state.distance / 1800);
  const large = Math.random() < largeChance;
  obstacles.push({
    x: canvas.width + 80,
    width: large ? 80 : 54,
    height: large ? 72 : 48,
    type: large ? 'boulder' : 'rock',
  });
}

function maybeSpawnCollectible(delta) {
  collectibleTimer += delta;
  const threshold = Math.max(520, 980 - state.distance * 0.35);
  if (collectibleTimer < threshold) return;
  collectibleTimer = 0;

  collectibles.push({
    x: canvas.width + 40,
    y: groundY - 68 - Math.random() * 62,
    width: 36,
    height: 30,
    bob: Math.random() * Math.PI * 2,
  });
}

function maybeSpawnFlyer(delta) {
  flyerTimer += delta;
  const threshold = Math.max(3600, 6200 - state.distance * 0.55);
  if (flyerTimer < threshold || state.distance < 90) return;
  flyerTimer = 0;

  flyers.push({
    x: canvas.width + 120,
    y: groundY - 136 - Math.random() * 26,
    width: 74,
    height: 34,
    wing: Math.random() * Math.PI * 2,
  });
}

function intersects(a, b, padding = 16) {
  const ax = a.x + 14;
  const ay = a.y + 16;
  const aw = a.width - 30;
  const ah = a.height - 22;
  const bx = b.x + padding;
  const by = (b.y ?? (groundY - b.height)) + padding / 2;
  const bw = b.width - padding * 1.15;
  const bh = b.height - padding;

  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function endGame() {
  state.playing = false;
  overlay.classList.remove('hidden');
  updatePauseButton();

  const finalDistance = Math.floor(state.distance);
  const finalCoins = state.coins;
  updateLeaderboard(finalDistance, finalCoins);
  renderHud();

  updateOverlay(
    'game-over',
    `${state.playerName}님 기록은 ${finalDistance}m, 조개 ${finalCoins}개예요. 이름은 바꿔도 되고, 같은 이름으로 다시 도전해도 돼요.`,
  );
  setHelper('다시 달리려면 이름을 확인하고 버튼을 눌러주세요.');
}

function update(delta) {
  if (!state.playing || state.paused) return;

  state.distance += state.speed * delta * 0.024;
  state.speed += delta * 0.00032;
  cloudOffset += state.speed * delta * 0.01;
  hillOffset += state.speed * delta * 0.018;
  sparkOffset += state.speed * delta * 0.03;

  player.velocityY += state.gravity;
  player.y += player.velocityY;
  if (player.y >= groundY - player.height) {
    if (!player.grounded) emitDust(player.x + 28, groundY - 2, 9, '#ead098');
    player.y = groundY - player.height;
    player.velocityY = 0;
    player.grounded = true;
  }
  player.bob += delta * 0.012;

  maybeSpawnObstacle(delta);
  maybeSpawnCollectible(delta);
  maybeSpawnFlyer(delta);

  obstacles.forEach(obstacle => {
    obstacle.x -= state.speed * delta * 0.1;
  });

  collectibles.forEach(shell => {
    shell.x -= state.speed * delta * 0.1;
    shell.bob += delta * 0.01;
  });

  flyers.forEach(flyer => {
    flyer.x -= state.speed * delta * 0.14;
    flyer.wing += delta * 0.018;
  });

  while (obstacles.length && obstacles[0].x + obstacles[0].width < -40) {
    obstacles.shift();
  }

  while (collectibles.length && collectibles[0].x + collectibles[0].width < -40) {
    collectibles.shift();
  }

  while (flyers.length && flyers[0].x + flyers[0].width < -50) {
    flyers.shift();
  }

  for (let index = particles.length - 1; index >= 0; index -= 1) {
    const particle = particles[index];
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.life -= 1;
    particle.vy += 0.05;
    if (particle.life <= 0) particles.splice(index, 1);
  }

  for (const obstacle of obstacles) {
    if (intersects(player, obstacle)) {
      endGame();
      return;
    }
  }

  for (const flyer of flyers) {
    if (intersects(player, flyer, 12)) {
      endGame();
      return;
    }
  }

  for (let index = collectibles.length - 1; index >= 0; index -= 1) {
    const shell = collectibles[index];
    if (intersects(player, shell, 6)) {
      collectibles.splice(index, 1);
      state.coins += 1;
      emitDust(shell.x + shell.width / 2, shell.y + shell.height / 2, 12, '#ffe39d');
    }
  }

  renderHud();
}

function drawRoundedRect(x, y, width, height, radius, fill) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawPixelPattern(originX, originY, blockSize, pattern, color) {
  ctx.fillStyle = color;
  pattern.forEach((row, rowIndex) => {
    row.forEach((cell, cellIndex) => {
      if (!cell) return;
      ctx.fillRect(
        Math.round((originX + cellIndex * blockSize) / 2) * 2,
        Math.round((originY + rowIndex * blockSize) / 2) * 2,
        blockSize,
        blockSize,
      );
    });
  });
}

function drawBackground() {
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#bfe8fa';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#d8f1ff';
  ctx.fillRect(0, 0, canvas.width, 84);

  const cloudPattern = [
    [0, 1, 1, 1, 0, 1, 1, 0],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [0, 1, 1, 1, 1, 1, 1, 0],
  ];
  for (let index = 0; index < 5; index += 1) {
    const x = ((index * 220) - cloudOffset) % (canvas.width + 220) - 110;
    const y = 38 + (index % 2) * 26;
    drawPixelPattern(x, y, 12, cloudPattern, '#ffffff');
  }

  const hillPattern = [
    [0, 0, 0, 1, 1, 0, 0, 0],
    [0, 0, 1, 1, 1, 1, 0, 0],
    [0, 1, 1, 1, 1, 1, 1, 0],
    [1, 1, 1, 1, 1, 1, 1, 1],
  ];
  for (let index = 0; index < 4; index += 1) {
    const x = ((index * 250) - hillOffset) % (canvas.width + 250) - 140;
    drawPixelPattern(x, groundY - 90, 28, hillPattern, '#9fc783');
    drawPixelPattern(x + 20, groundY - 42, hillPattern, 22, '#86b86e');
  }

  for (let index = 0; index < 7; index += 1) {
    const x = ((index * 148) - hillOffset * 1.3) % (canvas.width + 120) - 60;
    ctx.fillStyle = '#4d874e';
    ctx.fillRect(x, groundY - 34, 18, 68);
    drawPixelPattern(x - 18, groundY - 82, 18, [[0,1,0],[1,1,1],[1,1,1]], '#2f6a3f');
  }

  ctx.fillStyle = '#68a55c';
  ctx.fillRect(0, groundY + 26, canvas.width, 74);
  ctx.fillStyle = '#7fc06b';
  for (let index = 0; index < canvas.width; index += 24) {
    ctx.fillRect(index, groundY + 18 + (index % 48 === 0 ? 0 : 8), 12, 18);
  }

  ctx.fillStyle = '#6b4327';
  ctx.fillRect(0, groundY + 82, canvas.width, canvas.height - groundY);

  ctx.fillStyle = '#f7ce65';
  for (let index = 0; index < 16; index += 1) {
    const x = ((index * 78) - sparkOffset) % (canvas.width + 40) - 20;
    ctx.fillRect(x, groundY + 12 + (index % 3) * 6, 6, 6);
  }
}

function drawFallbackPlayer() {
  const bounce = player.grounded ? Math.sin(player.bob) * 2 : -3;
  const x = player.x;
  const y = player.y + bounce;
  const drawY = player.ducking ? y + 20 : y;
  const drawHeight = player.ducking ? 88 : 116;

  ctx.fillStyle = '#7d4a2a';
  ctx.beginPath();
  ctx.ellipse(x + 52, drawY + drawHeight - 54, 35, 30, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#7f4b2c';
  ctx.beginPath();
  ctx.arc(x + 34, drawY + 18, 10, 0, Math.PI * 2);
  ctx.arc(x + 70, drawY + 18, 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#7d4a2a';
  ctx.beginPath();
  ctx.arc(x + 52, drawY + 28, 30, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#f3d5ad';
  ctx.beginPath();
  ctx.ellipse(x + 52, drawY + 36, 24, 19, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#2d1b15';
  ctx.beginPath();
  ctx.arc(x + 42, drawY + 30, 4, 0, Math.PI * 2);
  ctx.arc(x + 62, drawY + 30, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#d27d72';
  ctx.beginPath();
  ctx.arc(x + 33, drawY + 40, 5, 0, Math.PI * 2);
  ctx.arc(x + 71, drawY + 40, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#6f3520';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x + 52, drawY + 38, 10, 0.18 * Math.PI, 0.82 * Math.PI);
  ctx.stroke();

  drawRoundedRect(x + 26, drawY + 6, 52, 16, 9, '#315d90');
  drawRoundedRect(x + 34, drawY - 4, 36, 16, 8, '#476f9d');
  drawRoundedRect(x + 42, drawY + 5, 10, 6, 2, '#e6b74d');

  drawRoundedRect(x + 24, drawY + 50, 58, 22, 11, '#2f7b4c');
  drawRoundedRect(x + 20, drawY + 46, 66, 10, 5, '#bf4937');
  drawRoundedRect(x + 38, drawY + 59, 28, 8, 4, '#b57d2f');

  ctx.fillStyle = '#7d4a2a';
  ctx.fillRect(x + 28, drawY + 70, 12, 24);
  ctx.fillRect(x + 64, drawY + 70, 12, 24);
  ctx.fillRect(x + 18, drawY + 54, 12, 24);
  ctx.fillRect(x + 74, drawY + 54, 12, 24);

  ctx.fillStyle = '#f0d2ad';
  ctx.fillRect(x + 26, drawY + 86, 16, 8);
  ctx.fillRect(x + 62, drawY + 86, 16, 8);

  ctx.strokeStyle = '#6f3f22';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(x + 18, drawY + 62);
  ctx.quadraticCurveTo(x - 4, drawY + 44, x + 8, drawY + 28);
  ctx.stroke();

  drawRoundedRect(x + 77, drawY + 48, 18, 34, 8, '#8B5C33');
  drawRoundedRect(x + 81, drawY + 54, 10, 22, 5, '#5A3A24');
  ctx.fillStyle = '#F6D27A';
  ctx.beginPath();
  ctx.arc(x + 86, drawY + 65, 5, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlayer() {
  const bounce = player.grounded ? Math.sin(player.bob) * 2 : -4;
  const x = player.x;
  const y = player.y + bounce;

  ctx.fillStyle = 'rgba(76, 53, 29, 0.22)';
  ctx.beginPath();
  ctx.ellipse(x + 52, groundY + 4, 38, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  drawFallbackPlayer();

  if (!otterSprite || !otterSprite.complete) {
    return;
  }

  try {
    ctx.imageSmoothingEnabled = false;
    if (player.ducking) {
      ctx.drawImage(otterSprite, x + 8, y + 24, 84, 84);
    } else {
      ctx.drawImage(otterSprite, x + 6, y + 6, 92, 92);
    }
  } catch (error) {
    otterSprite = null;
  }
}

function drawObstacle(obstacle) {
  const x = obstacle.x;
  const y = groundY - obstacle.height;

  ctx.fillStyle = obstacle.type === 'boulder' ? '#766250' : '#6f6053';
  ctx.beginPath();
  ctx.moveTo(x + obstacle.width * 0.1, y + obstacle.height * 0.72);
  ctx.lineTo(x + obstacle.width * 0.24, y + obstacle.height * 0.2);
  ctx.lineTo(x + obstacle.width * 0.58, y + obstacle.height * 0.06);
  ctx.lineTo(x + obstacle.width * 0.88, y + obstacle.height * 0.24);
  ctx.lineTo(x + obstacle.width, y + obstacle.height * 0.62);
  ctx.lineTo(x + obstacle.width * 0.84, y + obstacle.height);
  ctx.lineTo(x + obstacle.width * 0.28, y + obstacle.height);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = obstacle.type === 'boulder' ? '#a08a72' : '#99826b';
  ctx.beginPath();
  ctx.moveTo(x + obstacle.width * 0.22, y + obstacle.height * 0.64);
  ctx.lineTo(x + obstacle.width * 0.34, y + obstacle.height * 0.28);
  ctx.lineTo(x + obstacle.width * 0.58, y + obstacle.height * 0.18);
  ctx.lineTo(x + obstacle.width * 0.78, y + obstacle.height * 0.34);
  ctx.lineTo(x + obstacle.width * 0.78, y + obstacle.height * 0.72);
  ctx.lineTo(x + obstacle.width * 0.6, y + obstacle.height * 0.84);
  ctx.lineTo(x + obstacle.width * 0.34, y + obstacle.height * 0.82);
  ctx.closePath();
  ctx.fill();
}

function drawCollectible(shell) {
  const x = shell.x;
  const y = shell.y + Math.sin(shell.bob) * 6;

  ctx.fillStyle = '#ffe09e';
  ctx.beginPath();
  ctx.ellipse(x + shell.width / 2, y + shell.height / 2, 18, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#fff3ce';
  ctx.beginPath();
  ctx.ellipse(x + shell.width / 2, y + shell.height / 2 + 2, 14, 9, 0, 0, Math.PI, true);
  ctx.fill();

  ctx.strokeStyle = '#d08a47';
  ctx.lineWidth = 2;
  for (let index = 0; index < 4; index += 1) {
    ctx.beginPath();
    ctx.moveTo(x + 8 + index * 6, y + shell.height - 2);
    ctx.lineTo(x + shell.width / 2, y + 7);
    ctx.stroke();
  }

  ctx.fillStyle = '#f4c74b';
  ctx.beginPath();
  ctx.arc(x + shell.width - 4, y + 4, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawFlyer(flyer) {
  const flap = Math.sin(flyer.wing) * 6;
  const x = flyer.x;
  const y = flyer.y;

  ctx.fillStyle = '#eff4ff';
  ctx.beginPath();
  ctx.ellipse(x + 36, y + 18, 18, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#d5dceb';
  ctx.beginPath();
  ctx.moveTo(x + 26, y + 16);
  ctx.lineTo(x + 8, y + 10 - flap);
  ctx.lineTo(x + 20, y + 22);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x + 44, y + 16);
  ctx.lineTo(x + 66, y + 10 + flap);
  ctx.lineTo(x + 54, y + 22);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#f0b65d';
  ctx.beginPath();
  ctx.moveTo(x + 54, y + 18);
  ctx.lineTo(x + 68, y + 14);
  ctx.lineTo(x + 56, y + 22);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#36445f';
  ctx.fillRect(x + 42, y + 15, 3, 3);
}

function drawParticles() {
  particles.forEach(particle => {
    ctx.globalAlpha = Math.max(0, particle.life / 30);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  });
}

function render() {
  drawBackground();
  collectibles.forEach(drawCollectible);
  flyers.forEach(drawFlyer);
  drawPlayer();
  obstacles.forEach(drawObstacle);
  drawParticles();
}

function loop(timestamp) {
  if (!state.lastTime) state.lastTime = timestamp;
  const delta = timestamp - state.lastTime;
  state.lastTime = timestamp;

  update(delta);
  render();
  requestAnimationFrame(loop);
}

function buildOtterSprite() {
  if (!otterSource) {
    return;
  }

  if (!otterSource.complete) {
    otterSource.addEventListener('load', () => {
      otterSprite = otterSource;
    }, { once: true });
    return;
  }
  otterSprite = otterSource;
}

startRunBtn.addEventListener('click', () => {
  canvas.scrollIntoView({ behavior: 'smooth', block: 'center' });
  startGameFromInput();
});

overlayStartBtn.addEventListener('click', startGameFromInput);

playerNameInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    startGameFromInput();
  }
});

showTipBtn.addEventListener('click', () => {
  heroTip.classList.toggle('show');
});

window.addEventListener('keydown', event => {
  if (isEditableTarget(event.target)) return;

  if (event.code === 'Space') {
    event.preventDefault();
    if (!state.playing) startGameFromInput();
    else jump();
  }

  if (event.code === 'ArrowDown') {
    event.preventDefault();
    startDuck();
  }

  if (event.code === 'Escape') togglePause();
});

window.addEventListener('keyup', event => {
  if (event.code === 'ArrowDown') {
    stopDuck();
  }
});

canvas.addEventListener('pointerdown', () => {
  if (!state.playing) startGameFromInput();
  else jump();
});

player.y = groundY - player.height;
playerNameInput.value = state.playerName || 'yelin';
renderGuestbook();
renderLeaderboard();
refreshPlayerHud();
renderHud();
updateOverlay('ready');
setHelper('앞으로 더 재미있는 게임을 만들겠습니당');
requestAnimationFrame(loop);
buildOtterSprite();
updatePauseButton();

guestbookForm.addEventListener('submit', event => {
  event.preventDefault();
  addGuestbookMessage();
});

jumpBtn.addEventListener('click', () => {
  if (!state.playing) startGameFromInput();
  else jump();
});

pauseBtn.addEventListener('click', () => {
  if (!state.playing) {
    startGameFromInput();
    return;
  }
  togglePause();
});

duckBtn.addEventListener('pointerdown', event => {
  event.preventDefault();
  startDuck();
});

['pointerup', 'pointerleave', 'pointercancel'].forEach(type => {
  duckBtn.addEventListener(type, stopDuck);
});
