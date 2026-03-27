const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const overlay = document.getElementById('game-overlay');
const overlayStartBtn = document.getElementById('overlay-start-btn');
const startRunBtn = document.getElementById('start-run-btn');
const showTipBtn = document.getElementById('show-tip-btn');
const heroTip = document.getElementById('hero-tip');
const distanceValue = document.getElementById('distance-value');
const coinValue = document.getElementById('coin-value');
const bestValue = document.getElementById('best-value');

const chatWindow = document.getElementById('chat-window');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const replyButtons = document.querySelectorAll('.reply-btn');

const responses = {
  '점프 타이밍 알려줘!': '가시나 통나무가 가까워지면 너무 빨리 말고, 바로 앞에서 톡 하고 뛰면 제일 안정적이야.',
  '숲길 분위기 어때?': '낙엽이 폭신해서 분위기는 좋은데, 버섯 바위가 랜덤으로 튀어나와. 긴장해!',
  '도토리 간식 챙겨줘': '이미 주머니에 넣어뒀지. 최고 기록 세우면 하나 더 줄게.',
};

const bestDistance = Number(localStorage.getItem('karby_best_distance') || 0);
let state = {
  playing: false,
  paused: false,
  distance: 0,
  coins: 0,
  best: bestDistance,
  speed: 5.5,
  gravity: 0.75,
  lastTime: 0,
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
};

const groundY = canvas.height - 96;
const obstacles = [];
const collectibles = [];
const particles = [];
let spawnTimer = 0;
let collectibleTimer = 0;
let cloudOffset = 0;
let hillOffset = 0;
let sparkOffset = 0;

function resetGame() {
  state.distance = 0;
  state.coins = 0;
  state.speed = 5.5;
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
  overlay.classList.add('hidden');
  pushSystemMessage('새 러닝 시작! 바위를 피하고 조개를 모아보세요.');
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
  player.velocityY = player.jumpPower;
  player.grounded = false;
  emitDust(player.x + 18, player.y + player.height - 6, 7, '#f1d29d');
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
  const threshold = Math.max(700, 1480 - state.distance * 0.8);
  if (spawnTimer < threshold) return;
  spawnTimer = 0;

  const tall = Math.random() > 0.45;
  obstacles.push({
    x: canvas.width + 60,
    width: tall ? 74 : 58,
    height: tall ? 72 : 50,
    type: tall ? 'boulder' : 'rock',
  });
}

function maybeSpawnCollectible(delta) {
  collectibleTimer += delta;
  const threshold = Math.max(600, 1180 - state.distance * 0.5);
  if (collectibleTimer < threshold) return;
  collectibleTimer = 0;

  collectibles.push({
    x: canvas.width + 40,
    y: groundY - 72 - Math.random() * 92,
    width: 34,
    height: 28,
    bob: Math.random() * Math.PI * 2,
    collected: false,
  });
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
    if (!player.grounded) emitDust(player.x + 24, groundY - 2, 8, '#ead098');
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

  while (obstacles.length && obstacles[0].x + obstacles[0].width < -30) {
    obstacles.shift();
  }

  while (collectibles.length && collectibles[0].x + collectibles[0].width < -40) {
    collectibles.shift();
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

  for (let index = collectibles.length - 1; index >= 0; index -= 1) {
    const shell = collectibles[index];
    if (intersects(player, shell, 6)) {
      collectibles.splice(index, 1);
      state.coins += 1;
      emitDust(shell.x + shell.width / 2, shell.y + shell.height / 2, 10, '#ffe39d');
      if (state.coins % 5 === 0) {
        pushFriendMessage(`조개 ${state.coins}개 모았어! 계속 달리면 숨은 길도 찾을 수 있겠는데?`);
      }
    }
  }

  renderHud();
}

function intersects(a, obstacle, padding = 12) {
  const ax = a.x + 8;
  const ay = a.y + 10;
  const aw = a.width - 16;
  const ah = a.height - 14;
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
  document.querySelector('.overlay-card p').textContent = `이번 기록은 ${Math.floor(state.distance)}m, 조개는 ${state.coins}개예요. 다시 도전해서 더 멀리 달려보세요.`;
  overlayStartBtn.textContent = '다시 달리기';

  const finalDistance = Math.floor(state.distance);
  if (finalDistance > state.best) {
    state.best = finalDistance;
    localStorage.setItem('karby_best_distance', String(finalDistance));
    pushFriendMessage(`우와! 신기록 ${finalDistance}m 달성! 카비 오늘 컨디션 최고다.`);
  } else {
    pushFriendMessage(`이번엔 ${finalDistance}m였어. 다시 하면 더 멀리 갈 수 있어!`);
  }
  renderHud();
}

function renderHud() {
  distanceValue.textContent = `${String(Math.floor(state.distance)).padStart(3, '0')}m`;
  coinValue.textContent = String(state.coins).padStart(2, '0');
  bestValue.textContent = `${String(Math.floor(state.best)).padStart(3, '0')}m`;
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

  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 0; i < 5; i += 1) {
    const x = ((i * 220) - cloudOffset) % (canvas.width + 200) - 100;
    const y = 40 + (i % 2) * 28;
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, Math.PI * 2);
    ctx.arc(x + 24, y + 8, 20, 0, Math.PI * 2);
    ctx.arc(x - 26, y + 10, 18, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#a7cf85';
  for (let i = 0; i < 4; i += 1) {
    const x = ((i * 320) - hillOffset) % (canvas.width + 380) - 180;
    ctx.beginPath();
    ctx.arc(x, groundY + 72, 150, Math.PI, 0);
    ctx.fill();
  }

  ctx.fillStyle = '#5f9e5f';
  ctx.fillRect(0, groundY + 34, canvas.width, 70);
  ctx.fillStyle = '#6b4327';
  ctx.fillRect(0, groundY + 82, canvas.width, canvas.height - groundY);

  ctx.fillStyle = '#f7ce65';
  for (let i = 0; i < 16; i += 1) {
    const x = ((i * 78) - sparkOffset) % (canvas.width + 40) - 20;
    ctx.beginPath();
    ctx.arc(x, groundY + 18 + (i % 3) * 5, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPlayer() {
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

function drawObstacle(obstacle) {
  const x = obstacle.x;
  const y = groundY - obstacle.height;
  ctx.fillStyle = obstacle.type === 'boulder' ? '#766250' : '#6f6053';
  ctx.beginPath();
  ctx.moveTo(x + obstacle.width * 0.1, y + obstacle.height * 0.7);
  ctx.lineTo(x + obstacle.width * 0.24, y + obstacle.height * 0.2);
  ctx.lineTo(x + obstacle.width * 0.56, y + obstacle.height * 0.04);
  ctx.lineTo(x + obstacle.width * 0.88, y + obstacle.height * 0.24);
  ctx.lineTo(x + obstacle.width, y + obstacle.height * 0.62);
  ctx.lineTo(x + obstacle.width * 0.84, y + obstacle.height);
  ctx.lineTo(x + obstacle.width * 0.28, y + obstacle.height);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = obstacle.type === 'boulder' ? '#a08a72' : '#99826b';
  ctx.beginPath();
  ctx.moveTo(x + obstacle.width * 0.22, y + obstacle.height * 0.62);
  ctx.lineTo(x + obstacle.width * 0.34, y + obstacle.height * 0.28);
  ctx.lineTo(x + obstacle.width * 0.58, y + obstacle.height * 0.18);
  ctx.lineTo(x + obstacle.width * 0.78, y + obstacle.height * 0.34);
  ctx.lineTo(x + obstacle.width * 0.78, y + obstacle.height * 0.72);
  ctx.lineTo(x + obstacle.width * 0.6, y + obstacle.height * 0.84);
  ctx.lineTo(x + obstacle.width * 0.34, y + obstacle.height * 0.82);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(53, 40, 29, 0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + obstacle.width * 0.38, y + obstacle.height * 0.3);
  ctx.lineTo(x + obstacle.width * 0.49, y + obstacle.height * 0.68);
  ctx.lineTo(x + obstacle.width * 0.68, y + obstacle.height * 0.48);
  ctx.stroke();
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
  for (let i = 0; i < 4; i += 1) {
    ctx.beginPath();
    ctx.moveTo(x + 8 + i * 6, y + shell.height - 2);
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
  addChatLine('me', '카비', text);
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
  button.addEventListener('click', resetGame);
});

showTipBtn.addEventListener('click', () => {
  heroTip.classList.toggle('show');
});

window.addEventListener('keydown', event => {
  if (event.code === 'Space') {
    event.preventDefault();
    if (!state.playing) resetGame();
    else jump();
  }
  if (event.code === 'Escape') togglePause();
});

canvas.addEventListener('pointerdown', () => {
  if (!state.playing) resetGame();
  else jump();
});

renderHud();
player.y = groundY - player.height;
requestAnimationFrame(loop);
