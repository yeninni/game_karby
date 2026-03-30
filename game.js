const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const overlay = document.getElementById('game-overlay');
const overlayStartBtn = document.getElementById('overlay-start-btn');
const startRunBtn = document.getElementById('start-run-btn');
const showTipBtn = document.getElementById('show-tip-btn');
const heroTip = document.getElementById('hero-tip');
const playerNameInput = document.getElementById('player-name-input');
const overlayHelper = document.getElementById('overlay-helper');
const playerValue = document.getElementById('player-value');
const distanceValue = document.getElementById('distance-value');
const bestValue = document.getElementById('best-value');
const leaderboardList = document.getElementById('leaderboard-list');

const chatWindow = document.getElementById('chat-window');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const replyButtons = document.querySelectorAll('.reply-btn');

const responses = {
  '점프 타이밍 알려줘!': '가시나 통나무가 가까워지면 너무 빨리 말고, 바로 앞에서 톡 하고 뛰면 제일 안정적이야.',
  '숲길 분위기 어때?': '낙엽이 폭신해서 분위기는 좋은데, 버섯 바위가 랜덤으로 튀어나와. 긴장해!',
  '도토리 간식 챙겨줘': '이미 주머니에 넣어뒀지. 최고 기록 세우면 하나 더 줄게.',
};

const STORAGE_KEYS = {
  leaderboard: 'karby_leaderboard',
  lastPlayer: 'karby_last_player',
};

const leaderboard = loadJson(STORAGE_KEYS.leaderboard, []);
const lastPlayer = localStorage.getItem(STORAGE_KEYS.lastPlayer) || '';
const BIRD_UNLOCK_DISTANCE = 5000;
const BIRD_SPAWN_CHANCE = 0.12;
const BIRD_COOLDOWN_MIN_MS = 6500;
const BIRD_COOLDOWN_MAX_MS = 11000;

let state = {
  playing: false,
  paused: false,
  distance: 0,
  best: 0,
  speed: 4.2,
  gravity: 0.68,
  lastTime: 0,
  timeOfDayTime: 0,
  birdIntroShown: false,
  playerName: lastPlayer,
};

const player = {
  x: 140,
  y: 0,
  width: 84,
  height: 84,
  velocityY: 0,
  jumpPower: -15,
  grounded: true,
  bob: 0,
  sliding: false,
};

const groundY = canvas.height - 96;
const obstacles = [];
const particles = [];
let spawnTimer = 0;
let birdCooldown = 0;
let cloudOffset = 0;
let hillOffset = 0;
let sparkOffset = 0;

const MORNING_HOLD_MS = 18000;
const NOON_HOLD_MS = 18000;
const EVENING_HOLD_MS = 18000;
const NIGHT_HOLD_MS = 24000;
const TIME_OF_DAY_TRANSITION_MS = 2500;

const TIME_OF_DAY_PALETTES = [
  {
    skyTop: '#bfe8fa',
    skyMid: '#dff3dc',
    skyBottom: '#d6a775',
    cloud: 'rgba(255,255,255,0.72)',
    hill: '#a7cf85',
    grass: '#5f9e5f',
    dirt: '#6b4327',
    spark: '#f7ce65',
    sun: '#ffd46b',
    moon: '#f4f3ff',
    sunY: 92,
    sunOpacity: 1,
    moonY: canvas.height + 80,
    moonOpacity: 0,
    starsOpacity: 0,
  },
  {
    skyTop: '#8fd8ff',
    skyMid: '#b9f0ff',
    skyBottom: '#c7e59a',
    cloud: 'rgba(255,255,255,0.88)',
    hill: '#8fc56f',
    grass: '#4b9551',
    dirt: '#6a4129',
    spark: '#fff0a4',
    sun: '#fff1a8',
    moon: '#f4f3ff',
    sunY: 76,
    sunOpacity: 1,
    moonY: canvas.height + 80,
    moonOpacity: 0,
    starsOpacity: 0,
  },
  {
    skyTop: '#5665c8',
    skyMid: '#ee9267',
    skyBottom: '#6d4d6e',
    cloud: 'rgba(255,230,217,0.68)',
    hill: '#6e8d63',
    grass: '#456b4b',
    dirt: '#513321',
    spark: '#ffc86a',
    sun: '#ffb55d',
    moon: '#f8f6ff',
    sunY: 112,
    sunOpacity: 0.95,
    moonY: 172,
    moonOpacity: 0,
    starsOpacity: 0.08,
  },
  {
    skyTop: '#0f1a3a',
    skyMid: '#182b59',
    skyBottom: '#28406d',
    cloud: 'rgba(214,226,255,0.22)',
    hill: '#2e4c4f',
    grass: '#2c5643',
    dirt: '#35251d',
    spark: '#d6df96',
    sun: '#ffb55d',
    moon: '#f6f4ff',
    sunY: canvas.height + 120,
    sunOpacity: 0,
    moonY: 92,
    moonOpacity: 1,
    starsOpacity: 1,
  },
];

const TIME_OF_DAY_HOLDS = [
  MORNING_HOLD_MS,
  NOON_HOLD_MS,
  EVENING_HOLD_MS,
  NIGHT_HOLD_MS,
];

const TIME_OF_DAY_SEGMENTS = TIME_OF_DAY_PALETTES.map((palette, index) => ({
  palette,
  holdMs: TIME_OF_DAY_HOLDS[index],
}));

const TIME_OF_DAY_CYCLE_MS = TIME_OF_DAY_SEGMENTS.reduce(
  (total, segment) => total + segment.holdMs + TIME_OF_DAY_TRANSITION_MS,
  0,
);

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

function setOverlayHelper(text, isError = false) {
  overlayHelper.textContent = text;
  overlayHelper.classList.toggle('error', isError);
}

function normalizeName(value) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 18);
}

function findLeaderboardEntry(name) {
  return leaderboard.find(entry => entry.name.toLowerCase() === name.toLowerCase());
}

function refreshCurrentPlayer() {
  playerValue.textContent = state.playerName || '-';
  const entry = state.playerName ? findLeaderboardEntry(state.playerName) : null;
  state.best = entry ? entry.bestDistance : 0;
  bestValue.textContent = `${String(Math.floor(state.best)).padStart(3, '0')}m`;
}

function renderLeaderboard() {
  if (!leaderboard.length) {
    leaderboardList.innerHTML = '<li class="chat-line system"><span class="chat-name">system</span><p>아직 기록이 없어요.</p></li>';
    return;
  }

  leaderboardList.innerHTML = leaderboard.slice(0, 5)
    .map((entry, index) => (
      `<li class="leaderboard-item">
        <span class="rank-badge">${index + 1}</span>
        <div>
          <strong>${entry.name}</strong>
          <div class="leader-meta">${entry.bestDistance}m</div>
        </div>
        <span class="leader-meta">${entry.games}회</span>
      </li>`
    ))
    .join('');
}

function saveScore(score) {
  if (!state.playerName) return null;

  const now = new Date().toISOString();
  const existing = findLeaderboardEntry(state.playerName);
  if (existing) {
    existing.games += 1;
    existing.updatedAt = now;
    existing.bestDistance = Math.max(existing.bestDistance, score);
  } else {
    leaderboard.push({
      name: state.playerName,
      bestDistance: score,
      games: 1,
      updatedAt: now,
    });
  }

  leaderboard.sort((a, b) => {
    if (b.bestDistance !== a.bestDistance) return b.bestDistance - a.bestDistance;
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });
  saveJson(STORAGE_KEYS.leaderboard, leaderboard);
  renderLeaderboard();
  refreshCurrentPlayer();
  return leaderboard.findIndex(entry => entry.name.toLowerCase() === state.playerName.toLowerCase()) + 1;
}

function prepareRun() {
  const enteredName = normalizeName(playerNameInput.value || state.playerName || '');
  if (!enteredName) {
    setOverlayHelper('사용자 이름을 먼저 입력해 주세요.', true);
    playerNameInput.focus();
    return false;
  }

  state.playerName = enteredName;
  localStorage.setItem(STORAGE_KEYS.lastPlayer, enteredName);
  playerNameInput.value = enteredName;
  refreshCurrentPlayer();
  setOverlayHelper('좋아요. 이제 출발해요!', false);
  resetGame();
  return true;
}

function resetGame() {
  state.distance = 0;
  state.speed = 4.2;
  state.birdIntroShown = false;
  state.playing = true;
  state.paused = false;
  obstacles.length = 0;
  particles.length = 0;
  spawnTimer = 0;
  birdCooldown = 0;
  player.y = groundY - player.height;
  player.velocityY = 0;
  player.grounded = true;
  player.sliding = false;
  overlay.classList.add('hidden');
  pushSystemMessage(`${state.playerName || '플레이어'}님 새 러닝 시작!`);
  renderHud();
}

function togglePause() {
  if (!state.playing) return;
  state.paused = !state.paused;
  pushSystemMessage(state.paused ? '일시정지됨. 다시 ESC를 누르면 이어서 달립니다.' : '다시 출발!');
}

function jump() {
  if (!state.playing || state.paused) return;
  if (!player.grounded) return;
  player.sliding = false;
  player.velocityY = player.jumpPower;
  player.grounded = false;
  emitDust(player.x + 18, player.y + player.height - 6, 7, '#f1d29d');
}

function startSlide() {
  if (!state.playing || state.paused) return;
  if (!player.grounded) return;
  if (player.sliding) return;
  player.sliding = true;
  emitDust(player.x + 18, groundY - 4, 5, '#d5c28b');
}

function stopSlide() {
  player.sliding = false;
}

function emitDust(x, y, count, color) {
  for (let i = 0; i < count; i += 1) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 3.2,
      vy: -Math.random() * 2.4,
      life: 22 + Math.random() * 10,
      color,
    });
  }
}

function maybeSpawnObstacle(delta) {
  spawnTimer += delta;
  const threshold = Math.max(1100, 2150 - state.distance * 0.55);
  if (spawnTimer < threshold) return;
  spawnTimer = 0;

  const canSpawnBird = (
    state.distance >= BIRD_UNLOCK_DISTANCE
    && birdCooldown <= 0
    && Math.random() < BIRD_SPAWN_CHANCE
  );
  if (canSpawnBird) {
    birdCooldown = BIRD_COOLDOWN_MIN_MS + Math.random() * (BIRD_COOLDOWN_MAX_MS - BIRD_COOLDOWN_MIN_MS);
    obstacles.push({
      x: canvas.width + 80,
      y: groundY - player.height + 8,
      width: 72,
      height: 30,
      type: 'bird',
      speedMultiplier: 1.18,
      flap: Math.random() * Math.PI * 2,
    });
    return;
  }

  const tall = Math.random() > 0.68;
  obstacles.push({
    x: canvas.width + 60,
    width: tall ? 32 : 48,
    height: tall ? 72 : 48,
    type: tall ? 'crystal' : 'log',
  });
}

function update(delta) {
  state.timeOfDayTime += delta;
  if (!state.playing || state.paused) return;

  state.distance += state.speed * delta * 0.024;
  state.speed += delta * 0.00035;
  birdCooldown = Math.max(0, birdCooldown - delta);
  if (state.distance >= BIRD_UNLOCK_DISTANCE && !state.birdIntroShown) {
    state.birdIntroShown = true;
    pushSystemMessage('5000m 돌파! 새가 날아오면 오른쪽 방향키로 슬라이딩해서 피하세요.');
  }
  cloudOffset += state.speed * delta * 0.01;
  hillOffset += state.speed * delta * 0.018;
  sparkOffset += state.speed * delta * 0.03;

  player.velocityY += state.gravity;
  player.y += player.velocityY;
  if (player.y >= groundY - player.height) {
    if (!player.grounded) emitDust(player.x + 24, groundY - 2, 8, '#ead098');
    player.y = groundY - player.height;
    player.velocityY = 0;
    player.grounded = true;
  }
  if (!player.grounded) player.sliding = false;
  player.bob += delta * 0.012;

  maybeSpawnObstacle(delta);

  obstacles.forEach(obstacle => {
    obstacle.x -= state.speed * delta * 0.1 * (obstacle.speedMultiplier || 1);
    if (obstacle.type === 'bird') obstacle.flap += delta * 0.018;
  });

  while (obstacles.length && obstacles[0].x + obstacles[0].width < -30) {
    obstacles.shift();
  }

  particles.forEach((particle, index) => {
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.life -= 1;
    particle.vy += 0.05;
    if (particle.life <= 0) particles.splice(index, 1);
  });

  for (const obstacle of obstacles) {
    if (intersects(player, obstacle)) {
      endGame();
      break;
    }
  }

  renderHud();
}

function intersects(a, obstacle) {
  const playerTopPadding = a.sliding ? 42 : 10;
  const playerHeightPadding = a.sliding ? 48 : 14;
  const ax = a.x + 8;
  const ay = a.y + playerTopPadding;
  const aw = a.width - 16;
  const ah = a.height - playerHeightPadding;
  const padding = obstacle.type === 'bird' ? 8 : 12;
  const bx = obstacle.x + padding;
  const by = (obstacle.y ?? (groundY - obstacle.height)) + padding / 2;
  const bw = obstacle.width - padding * 1.2;
  const bh = obstacle.height - padding;

  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function endGame() {
  state.playing = false;
  overlay.classList.remove('hidden');
  document.querySelector('.overlay-badge').textContent = 'GAME OVER';
  document.querySelector('.overlay-card h3').textContent = '카비가 잠깐 미끄러졌어요!';
  const finalDistance = Math.floor(state.distance);
  const rank = saveScore(finalDistance);
  document.querySelector('.overlay-card p').textContent = `이번 기록은 ${finalDistance}m 입니다.${rank ? ` 현재 ${rank}위예요.` : ''} 다시 도전해보세요.`;
  overlayStartBtn.textContent = '다시 달리기';
  setOverlayHelper('같은 이름으로 다시 도전하거나 다른 이름을 입력할 수 있어요.', false);
  pushSystemMessage(`${state.playerName || '플레이어'}님의 이번 기록은 ${finalDistance}m`);
  renderHud();
}

function renderHud() {
  distanceValue.textContent = `${String(Math.floor(state.distance)).padStart(3, '0')}m`;
  refreshCurrentPlayer();
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

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function mixColor(from, to, amount) {
  const normalize = color => color.replace('#', '');
  const fromHex = normalize(from);
  const toHex = normalize(to);
  const fromR = Number.parseInt(fromHex.slice(0, 2), 16);
  const fromG = Number.parseInt(fromHex.slice(2, 4), 16);
  const fromB = Number.parseInt(fromHex.slice(4, 6), 16);
  const toR = Number.parseInt(toHex.slice(0, 2), 16);
  const toG = Number.parseInt(toHex.slice(2, 4), 16);
  const toB = Number.parseInt(toHex.slice(4, 6), 16);
  const r = Math.round(lerp(fromR, toR, amount));
  const g = Math.round(lerp(fromG, toG, amount));
  const b = Math.round(lerp(fromB, toB, amount));
  return `rgb(${r}, ${g}, ${b})`;
}

function blendPalette(from, to, amount) {
  return {
    skyTop: mixColor(from.skyTop, to.skyTop, amount),
    skyMid: mixColor(from.skyMid, to.skyMid, amount),
    skyBottom: mixColor(from.skyBottom, to.skyBottom, amount),
    cloud: amount < 0.5 ? from.cloud : to.cloud,
    hill: mixColor(from.hill, to.hill, amount),
    grass: mixColor(from.grass, to.grass, amount),
    dirt: mixColor(from.dirt, to.dirt, amount),
    spark: mixColor(from.spark, to.spark, amount),
    sun: mixColor(from.sun, to.sun, amount),
    moon: mixColor(from.moon, to.moon, amount),
    sunY: lerp(from.sunY, to.sunY, amount),
    sunOpacity: lerp(from.sunOpacity, to.sunOpacity, amount),
    moonY: lerp(from.moonY, to.moonY, amount),
    moonOpacity: lerp(from.moonOpacity, to.moonOpacity, amount),
    starsOpacity: lerp(from.starsOpacity, to.starsOpacity, amount),
  };
}

function getTimePalette() {
  const cycleTime = state.timeOfDayTime % TIME_OF_DAY_CYCLE_MS;
  let elapsed = 0;

  for (let index = 0; index < TIME_OF_DAY_SEGMENTS.length; index += 1) {
    const currentSegment = TIME_OF_DAY_SEGMENTS[index];
    const segmentStart = elapsed;
    const holdEnd = segmentStart + currentSegment.holdMs;
    const transitionEnd = holdEnd + TIME_OF_DAY_TRANSITION_MS;

    if (cycleTime < holdEnd) {
      return currentSegment.palette;
    }

    if (cycleTime < transitionEnd) {
      const nextSegment = TIME_OF_DAY_SEGMENTS[(index + 1) % TIME_OF_DAY_SEGMENTS.length];
      const amount = (cycleTime - holdEnd) / TIME_OF_DAY_TRANSITION_MS;
      return blendPalette(currentSegment.palette, nextSegment.palette, amount);
    }

    elapsed = transitionEnd;
  }

  return TIME_OF_DAY_SEGMENTS[0].palette;
}

function drawStars(opacity) {
  if (opacity <= 0.02) return;

  const stars = [
    { x: 86, y: 72, size: 2.2 },
    { x: 148, y: 56, size: 1.8 },
    { x: 214, y: 102, size: 2.6 },
    { x: 308, y: 64, size: 2.1 },
    { x: 392, y: 88, size: 1.9 },
    { x: 484, y: 52, size: 2.4 },
    { x: 576, y: 108, size: 1.7 },
    { x: 664, y: 74, size: 2.5 },
    { x: 748, y: 46, size: 1.8 },
    { x: 824, y: 94, size: 2.2 },
  ];

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = '#fff8dc';

  stars.forEach(star => {
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

function drawMoon(palette) {
  if (palette.moonOpacity <= 0.02) return;

  ctx.save();
  ctx.globalAlpha = palette.moonOpacity;
  ctx.fillStyle = palette.moon;
  ctx.beginPath();
  ctx.arc(canvas.width - 118, palette.moonY, 28, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(202, 216, 255, 0.45)';
  ctx.beginPath();
  ctx.arc(canvas.width - 106, palette.moonY - 8, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSun(palette) {
  if (palette.sunOpacity <= 0.02) return;

  ctx.save();
  ctx.globalAlpha = palette.sunOpacity;
  ctx.fillStyle = palette.sun;
  ctx.beginPath();
  ctx.arc(canvas.width - 110, palette.sunY, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBackground() {
  const palette = getTimePalette();
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, palette.skyTop);
  gradient.addColorStop(0.55, palette.skyMid);
  gradient.addColorStop(1, palette.skyBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawStars(palette.starsOpacity);
  drawMoon(palette);
  drawSun(palette);

  ctx.fillStyle = palette.cloud;
  for (let i = 0; i < 5; i += 1) {
    const x = ((i * 220) - cloudOffset) % (canvas.width + 200) - 100;
    const y = 40 + (i % 2) * 28;
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, Math.PI * 2);
    ctx.arc(x + 24, y + 8, 20, 0, Math.PI * 2);
    ctx.arc(x - 26, y + 10, 18, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = palette.hill;
  for (let i = 0; i < 4; i += 1) {
    const x = ((i * 320) - hillOffset) % (canvas.width + 380) - 180;
    ctx.beginPath();
    ctx.arc(x, groundY + 72, 150, Math.PI, 0);
    ctx.fill();
  }

  ctx.fillStyle = palette.grass;
  ctx.fillRect(0, groundY + 34, canvas.width, 70);
  ctx.fillStyle = palette.dirt;
  ctx.fillRect(0, groundY + 82, canvas.width, canvas.height - groundY);

  ctx.fillStyle = palette.spark;
  for (let i = 0; i < 16; i += 1) {
    const x = ((i * 78) - sparkOffset) % (canvas.width + 40) - 20;
    ctx.beginPath();
    ctx.arc(x, groundY + 18 + (i % 3) * 5, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPlayer() {
  if (player.sliding) {
    drawSlidingPlayer();
    return;
  }

  const bounce = player.grounded ? Math.sin(player.bob) * 2 : -4;
  const x = player.x;
  const y = player.y + bounce;

  ctx.fillStyle = '#7d4a2a';
  ctx.beginPath();
  ctx.ellipse(x + 42, y + 46, 34, 28, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#684125';
  ctx.fillRect(x + 18, y + 30, 14, 38);
  ctx.fillRect(x + 52, y + 34, 14, 36);

  ctx.fillStyle = '#f0cfaa';
  ctx.beginPath();
  ctx.ellipse(x + 44, y + 48, 18, 13, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#7f4b2c';
  ctx.beginPath();
  ctx.arc(x + 26, y + 16, 10, 0, Math.PI * 2);
  ctx.arc(x + 60, y + 16, 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#7d4a2a';
  ctx.beginPath();
  ctx.arc(x + 42, y + 26, 28, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#f3d5ad';
  ctx.beginPath();
  ctx.ellipse(x + 42, y + 33, 22, 18, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#2d1b15';
  ctx.beginPath();
  ctx.arc(x + 32, y + 27, 3.6, 0, Math.PI * 2);
  ctx.arc(x + 52, y + 27, 3.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#d27d72';
  ctx.beginPath();
  ctx.arc(x + 24, y + 36, 5, 0, Math.PI * 2);
  ctx.arc(x + 60, y + 36, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#6f3520';
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.arc(x + 42, y + 34, 9, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();

  ctx.fillStyle = '#203f68';
  drawRoundedRect(x + 18, y + 4, 48, 16, 9, '#315d90');
  drawRoundedRect(x + 24, y - 6, 36, 16, 8, '#476f9d');
  ctx.fillStyle = '#87542e';
  drawRoundedRect(x + 30, y + 6, 22, 4, 2, '#80502d');
  ctx.fillStyle = '#e3b14f';
  drawRoundedRect(x + 40, y + 3, 8, 6, 1.8, '#e6b74d');

  drawRoundedRect(x + 16, y + 50, 50, 20, 10, '#2f7b4c');
  ctx.fillStyle = '#c24032';
  drawRoundedRect(x + 12, y + 46, 58, 10, 5, '#bf4937');

  ctx.strokeStyle = '#f0c458';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 18, y + 52, 46, 16);

  ctx.fillStyle = '#7d4a2a';
  ctx.fillRect(x + 18, y + 67, 10, 24);
  ctx.fillRect(x + 54, y + 67, 10, 24);
  ctx.fillRect(x + 12, y + 52, 12, 26);
  ctx.fillRect(x + 60, y + 54, 14, 24);

  ctx.fillStyle = '#f0d2ad';
  ctx.fillRect(x + 15, y + 76, 14, 8);
  ctx.fillRect(x + 51, y + 76, 14, 8);

  ctx.strokeStyle = '#6f3f22';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(x + 12, y + 60);
  ctx.quadraticCurveTo(x - 8, y + 42, x + 4, y + 28);
  ctx.stroke();
}

function drawSlidingPlayer() {
  const x = player.x;
  const y = player.y + 22;

  ctx.fillStyle = '#7d4a2a';
  ctx.beginPath();
  ctx.ellipse(x + 40, y + 44, 42, 22, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#f0cfaa';
  ctx.beginPath();
  ctx.ellipse(x + 56, y + 34, 18, 12, -0.16, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#7f4b2c';
  ctx.beginPath();
  ctx.arc(x + 49, y + 22, 8, 0, Math.PI * 2);
  ctx.arc(x + 69, y + 24, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#2d1b15';
  ctx.beginPath();
  ctx.arc(x + 54, y + 34, 3.2, 0, Math.PI * 2);
  ctx.arc(x + 68, y + 34, 3.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#6f3520';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(x + 60, y + 39, 8, 0.2 * Math.PI, 0.82 * Math.PI);
  ctx.stroke();

  drawRoundedRect(x + 14, y + 38, 50, 18, 9, '#2f7b4c');
  drawRoundedRect(x + 10, y + 34, 58, 10, 5, '#bf4937');
  ctx.strokeStyle = '#f0c458';
  ctx.lineWidth = 1.4;
  ctx.strokeRect(x + 16, y + 40, 46, 13);

  ctx.fillStyle = '#7d4a2a';
  ctx.fillRect(x + 12, y + 42, 16, 22);
  ctx.fillRect(x + 28, y + 50, 34, 10);
  ctx.fillRect(x + 56, y + 46, 20, 10);

  ctx.fillStyle = '#f0d2ad';
  ctx.fillRect(x + 14, y + 58, 12, 7);
  ctx.fillRect(x + 64, y + 46, 10, 6);

  ctx.strokeStyle = '#6f3f22';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x + 8, y + 46);
  ctx.quadraticCurveTo(x - 10, y + 34, x - 2, y + 18);
  ctx.stroke();
}

function drawObstacle(obstacle) {
  const x = obstacle.x;
  const y = obstacle.y ?? (groundY - obstacle.height);
  if (obstacle.type === 'log') {
    drawRoundedRect(x, y, obstacle.width, obstacle.height, 16, '#6a4228');
    ctx.fillStyle = '#8c5939';
    drawRoundedRect(x + 6, y + 8, obstacle.width - 12, obstacle.height - 14, 12, '#8a5737');
    ctx.strokeStyle = '#4f2f1d';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x + obstacle.width / 2, y + obstacle.height / 2, 12, 0, Math.PI * 2);
    ctx.stroke();
  } else if (obstacle.type === 'crystal') {
    ctx.fillStyle = '#4c8d89';
    ctx.beginPath();
    ctx.moveTo(x + obstacle.width / 2, y);
    ctx.lineTo(x + obstacle.width, y + obstacle.height * 0.6);
    ctx.lineTo(x + obstacle.width * 0.74, y + obstacle.height);
    ctx.lineTo(x + obstacle.width * 0.26, y + obstacle.height);
    ctx.lineTo(x, y + obstacle.height * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#9ff4eb';
    ctx.beginPath();
    ctx.moveTo(x + obstacle.width / 2, y + 10);
    ctx.lineTo(x + obstacle.width * 0.78, y + obstacle.height * 0.58);
    ctx.lineTo(x + obstacle.width * 0.5, y + obstacle.height - 8);
    ctx.lineTo(x + obstacle.width * 0.22, y + obstacle.height * 0.58);
    ctx.closePath();
    ctx.fill();
  } else if (obstacle.type === 'bird') {
    const flap = Math.sin(obstacle.flap || 0);
    ctx.fillStyle = '#5f4636';
    ctx.beginPath();
    ctx.ellipse(x + 34, y + 15, 18, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#785543';
    ctx.beginPath();
    ctx.moveTo(x + 20, y + 14);
    ctx.quadraticCurveTo(x + 6, y + 2 + flap * 5, x + 10, y + 24);
    ctx.quadraticCurveTo(x + 22, y + 20, x + 28, y + 14);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x + 40, y + 14);
    ctx.quadraticCurveTo(x + 60, y + 2 - flap * 5, x + 64, y + 26);
    ctx.quadraticCurveTo(x + 48, y + 21, x + 36, y + 14);
    ctx.fill();

    ctx.fillStyle = '#d9bf91';
    ctx.beginPath();
    ctx.ellipse(x + 39, y + 17, 8, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#251914';
    ctx.beginPath();
    ctx.arc(x + 40, y + 12, 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#d78a47';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(x + 50, y + 15);
    ctx.lineTo(x + 60, y + 13);
    ctx.stroke();
  }
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

function addChatLine(type, name, text) {
  const wrapper = document.createElement('div');
  wrapper.className = `chat-line ${type}`;
  wrapper.innerHTML = `<span class="chat-name">${name}</span><p>${text}</p>`;
  chatWindow.appendChild(wrapper);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function pushFriendMessage(text) {
  addChatLine('friend', '루나', text);
}

function pushMyMessage(text) {
  addChatLine('me', state.playerName || '방문자', text);
}

function pushSystemMessage(text) {
  addChatLine('system', 'system', text);
}

function answerMessage(message) {
  const lower = message.toLowerCase();
  if (responses[message]) return responses[message];
  if (lower.includes('기록')) return `현재 최고 기록은 ${Math.floor(state.best)}m 이야. 이번엔 넘겨보자.`;
  if (lower.includes('안녕')) return '안녕! 오늘도 카비는 숲을 신나게 달릴 준비 완료야.';
  if (lower.includes('수달')) return '당연하지. 카비는 오늘도 제일 귀여운 수달 기사야.';
  return '좋아, 그 메모 저장! 달리면서도 계속 무전 보낼게.';
}

chatForm.addEventListener('submit', event => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;
  pushMyMessage(message);
  chatInput.value = '';
  window.setTimeout(() => pushFriendMessage(answerMessage(message)), 480);
});

replyButtons.forEach(button => {
  button.addEventListener('click', () => {
    const message = button.dataset.reply;
    pushMyMessage(message);
    window.setTimeout(() => pushFriendMessage(answerMessage(message)), 420);
  });
});

[startRunBtn, overlayStartBtn].forEach(button => {
  button.addEventListener('click', prepareRun);
});

showTipBtn.addEventListener('click', () => {
  heroTip.classList.toggle('show');
});

window.addEventListener('keydown', event => {
  if (event.target === playerNameInput) {
    if (event.code === 'Enter') {
      event.preventDefault();
      prepareRun();
    }
    return;
  }
  if (['Space', 'ArrowUp', 'KeyW'].includes(event.code)) {
    event.preventDefault();
    if (!state.playing && overlay.classList.contains('hidden')) prepareRun();
    else jump();
  }
  if (event.code === 'ArrowRight') {
    event.preventDefault();
    startSlide();
  }
  if (event.code === 'Escape') togglePause();
});

window.addEventListener('keyup', event => {
  if (event.code === 'ArrowRight') stopSlide();
});

canvas.addEventListener('pointerdown', () => {
  if (!state.playing && overlay.classList.contains('hidden')) prepareRun();
  else jump();
});

playerNameInput.value = lastPlayer;
renderLeaderboard();
renderHud();
player.y = groundY - player.height;
chatWindow.innerHTML = '<div class="chat-line system"><span class="chat-name">system</span><p>아직 남겨진 글이 없어요.</p></div>';
requestAnimationFrame(loop);
