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

const visitorCount = document.getElementById('visitor-count');
const visitorList = document.getElementById('visitor-list');
const leaderboardList = document.getElementById('leaderboard-list');

const otterSource = document.getElementById('otter-source');
const otterPreview = document.getElementById('otter-preview');

const STORAGE_KEYS = {
  visitors: 'karby_visitors',
  leaderboard: 'karby_leaderboard',
  lastPlayer: 'karby_last_player',
};

const groundY = canvas.height - 96;
const obstacles = [];
const collectibles = [];
const particles = [];

let visitors = loadJson(STORAGE_KEYS.visitors, []);
let leaderboard = loadJson(STORAGE_KEYS.leaderboard, []);
let otterSprite = null;
let spawnTimer = 0;
let collectibleTimer = 0;
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
  playerName: localStorage.getItem(STORAGE_KEYS.lastPlayer) || '',
};

const player = {
  x: 140,
  y: 0,
  width: 104,
  height: 116,
  velocityY: 0,
  jumpPower: -15.8,
  grounded: true,
  bob: 0,
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
    overlayText.textContent = message || '이름을 입력하면 방문자 목록에 남고, 게임 종료 후 점수 랭킹에도 반영됩니다.';
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
  renderVisitors();
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

function renderVisitors() {
  visitorCount.textContent = `${visitors.length}명`;
  if (!visitors.length) {
    visitorList.innerHTML = '<li class="empty-state">아직 등록된 방문자가 없어요. 첫 플레이어가 되어보세요.</li>';
    return;
  }

  visitorList.innerHTML = visitors
    .map(entry => (
      `<li class="board-item">
        <div>
          <strong>${entry.name}</strong>
          <div class="visitor-meta">최근 방문 ${formatSeen(entry.lastSeen)}</div>
        </div>
        <span class="visitor-meta">${entry.visits}회</span>
      </li>`
    ))
    .join('');
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
  const name = normalizeName(playerNameInput.value);
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
  state.speed = 5.6;
  state.playing = true;
  state.paused = false;
  obstacles.length = 0;
  collectibles.length = 0;
  particles.length = 0;
  spawnTimer = 0;
  collectibleTimer = 0;
  player.y = groundY - player.height;
  player.velocityY = 0;
  player.grounded = true;
  updateOverlay('ready');
  overlay.classList.add('hidden');
  renderHud();
}

function togglePause() {
  if (!state.playing) return;
  state.paused = !state.paused;
  setHelper(state.paused ? '일시정지됨. ESC를 다시 누르면 이어집니다.' : '다시 출발!');
}

function jump() {
  if (!state.playing || state.paused) return;
  if (!player.grounded) return;
  player.velocityY = player.jumpPower;
  player.grounded = false;
  emitDust(player.x + 20, player.y + player.height - 6, 8, '#f1d29d');
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
  const threshold = Math.max(720, 1480 - state.distance * 0.85);
  if (spawnTimer < threshold) return;
  spawnTimer = 0;

  const large = Math.random() > 0.48;
  obstacles.push({
    x: canvas.width + 80,
    width: large ? 84 : 62,
    height: large ? 78 : 54,
    type: large ? 'boulder' : 'rock',
  });
}

function maybeSpawnCollectible(delta) {
  collectibleTimer += delta;
  const threshold = Math.max(580, 1080 - state.distance * 0.5);
  if (collectibleTimer < threshold) return;
  collectibleTimer = 0;

  collectibles.push({
    x: canvas.width + 40,
    y: groundY - 78 - Math.random() * 88,
    width: 36,
    height: 30,
    bob: Math.random() * Math.PI * 2,
  });
}

function intersects(a, b, padding = 12) {
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
  state.speed += delta * 0.0009;
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

  obstacles.forEach(obstacle => {
    obstacle.x -= state.speed * delta * 0.1;
  });

  collectibles.forEach(shell => {
    shell.x -= state.speed * delta * 0.1;
    shell.bob += delta * 0.01;
  });

  while (obstacles.length && obstacles[0].x + obstacles[0].width < -40) {
    obstacles.shift();
  }

  while (collectibles.length && collectibles[0].x + collectibles[0].width < -40) {
    collectibles.shift();
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

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#bfe8fa');
  gradient.addColorStop(0.55, '#dff3dc');
  gradient.addColorStop(1, '#d6a775');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  for (let index = 0; index < 5; index += 1) {
    const x = ((index * 220) - cloudOffset) % (canvas.width + 200) - 100;
    const y = 40 + (index % 2) * 28;
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, Math.PI * 2);
    ctx.arc(x + 24, y + 8, 20, 0, Math.PI * 2);
    ctx.arc(x - 26, y + 10, 18, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#a7cf85';
  for (let index = 0; index < 4; index += 1) {
    const x = ((index * 320) - hillOffset) % (canvas.width + 380) - 180;
    ctx.beginPath();
    ctx.arc(x, groundY + 72, 150, Math.PI, 0);
    ctx.fill();
  }

  ctx.fillStyle = '#5f9e5f';
  ctx.fillRect(0, groundY + 34, canvas.width, 70);
  ctx.fillStyle = '#6b4327';
  ctx.fillRect(0, groundY + 82, canvas.width, canvas.height - groundY);

  ctx.fillStyle = '#f7ce65';
  for (let index = 0; index < 16; index += 1) {
    const x = ((index * 78) - sparkOffset) % (canvas.width + 40) - 20;
    ctx.beginPath();
    ctx.arc(x, groundY + 18 + (index % 3) * 5, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFallbackPlayer() {
  const bounce = player.grounded ? Math.sin(player.bob) * 2 : -3;
  const x = player.x;
  const y = player.y + bounce;

  drawRoundedRect(x + 16, y + 28, 62, 60, 22, '#7d4a2a');
  drawRoundedRect(x + 24, y + 12, 48, 34, 18, '#84502f');
  drawRoundedRect(x + 26, y + 26, 42, 22, 12, '#f2d3a8');
  drawRoundedRect(x + 16, y + 52, 62, 16, 8, '#bf4937');
}

function drawPlayer() {
  const bounce = player.grounded ? Math.sin(player.bob) * 2 : -4;
  const x = player.x;
  const y = player.y + bounce;

  ctx.fillStyle = 'rgba(76, 53, 29, 0.22)';
  ctx.beginPath();
  ctx.ellipse(x + 52, groundY + 4, 38, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  if (!otterSprite) {
    drawFallbackPlayer();
    return;
  }

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(otterSprite, x - 4, y - 6, player.width, player.height);
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
  if (!otterSource.complete) {
    otterSource.addEventListener('load', buildOtterSprite, { once: true });
    return;
  }

  const rawCanvas = document.createElement('canvas');
  const rawCtx = rawCanvas.getContext('2d', { willReadFrequently: true });
  rawCanvas.width = otterSource.naturalWidth;
  rawCanvas.height = otterSource.naturalHeight;
  rawCtx.drawImage(otterSource, 0, 0);

  const imageData = rawCtx.getImageData(0, 0, rawCanvas.width, rawCanvas.height);
  const { data } = imageData;
  let minX = rawCanvas.width;
  let minY = rawCanvas.height;
  let maxX = 0;
  let maxY = 0;

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const average = (r + g + b) / 3;
    const isDarkNeutral = max - min < 18 && average < 90;

    if (isDarkNeutral) {
      data[index + 3] = 0;
      continue;
    }

    const pixelIndex = index / 4;
    const x = pixelIndex % rawCanvas.width;
    const y = Math.floor(pixelIndex / rawCanvas.width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  rawCtx.putImageData(imageData, 0, 0);

  if (minX >= maxX || minY >= maxY) {
    otterSprite = rawCanvas;
    otterPreview.src = rawCanvas.toDataURL('image/png');
    return;
  }

  const padding = 10;
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = width + padding * 2;
  finalCanvas.height = height + padding * 2;
  const finalCtx = finalCanvas.getContext('2d');
  finalCtx.imageSmoothingEnabled = false;
  finalCtx.drawImage(rawCanvas, minX, minY, width, height, padding, padding, width, height);

  otterSprite = finalCanvas;
  otterPreview.src = finalCanvas.toDataURL('image/png');
}

startRunBtn.addEventListener('click', () => {
  canvas.scrollIntoView({ behavior: 'smooth', block: 'center' });
  overlay.classList.remove('hidden');
  playerNameInput.focus();
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

  if (event.code === 'Escape') togglePause();
});

canvas.addEventListener('pointerdown', () => {
  if (!state.playing) startGameFromInput();
  else jump();
});

player.y = groundY - player.height;
if (state.playerName) {
  playerNameInput.value = state.playerName;
}
renderVisitors();
renderLeaderboard();
refreshPlayerHud();
renderHud();
updateOverlay('ready');
setHelper('이 브라우저 기준으로 기록이 저장돼요.');
buildOtterSprite();
requestAnimationFrame(loop);
