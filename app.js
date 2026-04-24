// PROTOTYPE - NOT FOR PRODUCTION
// Question: Does the Bingo event core loop (Sortear -> stamps -> line close) feel right on mobile?
// Date: 2026-04-24

// Phase 3.2 iteration:
// - Ball ledger (4x5 = 20 slots) to the right of the drum; every drawn ball lands there.
// - Hits do a two-leg journey: spout -> cartela tile (stamp) -> ledger slot.
// - Misses do a one-leg journey: spout -> ledger slot.
// - FIFO eviction on ball 21: oldest ball flies off-right, remaining balls shift left.
// - At event end, ledger clears with a staggered fly-out.

const MISSION_ICONS = {
  play:     '🃏',
  canastra: '♠',
  limpa:    '✨',
  coringa:  '🃟',
};

const SUIT_ARCHETYPES = new Set(['canastra']);

const DRUM_SPIN_MS      = 1200;
const BALL_TRAVEL_MS    = 650;   // spout -> first destination (cartela tile or ledger slot)
const LEDGER_TRAVEL_MS  = 400;   // second leg after a stamp: cartela tile -> ledger slot
const POST_STAMP_PAUSE  = 250;   // beat between stamp VFX and second-leg launch
const BETWEEN_BALLS_MS  = 250;
const LEDGER_EVICT_MS   = 450;   // oldest-ball fly-out when ledger is full
const LONG_PRESS_MS     = 500;

// ---------- Mission tile rendering ----------

function getMissionState(mission) {
  if (mission.progress === 0) return 'not-started';
  if (mission.progress >= mission.goal) return 'completed';
  return 'in-progress';
}

function missionFillPct(mission) {
  return Math.min(100, (mission.progress / mission.goal) * 100);
}

function renderMissionTile(el, mission) {
  el.className = 'tile tile--mission';
  el.dataset.state = getMissionState(mission);
  el.dataset.missionId = mission.id;
  const icon = MISSION_ICONS[mission.archetype] || '❓';
  const iconClass = SUIT_ARCHETYPES.has(mission.archetype)
    ? 'mission-icon mission-icon--suit'
    : 'mission-icon';
  el.innerHTML =
    '<div class="mission-icon-area">' +
      '<div class="mission-fill" style="height: ' + missionFillPct(mission) + '%"></div>' +
      '<div class="' + iconClass + '">' + icon + '</div>' +
    '</div>' +
    '<div class="mission-label">' + mission.label + '</div>' +
    '<div class="mission-stamp">CARIMBADO</div>';
}

// ---------- Cartela render ----------

function renderCartela() {
  const cartelaEl = document.getElementById('cartela');
  cartelaEl.innerHTML = '';

  for (let row = 1; row <= 5; row++) {
    for (let col = 1; col <= 5; col++) {
      const tile = getTileAt(row, col);
      const el = document.createElement('div');
      el.dataset.row = row;
      el.dataset.col = col;

      if (tile.kind === 'free') {
        el.className = 'tile tile--free';
        el.dataset.kind = 'free';
        el.innerHTML = '<span class="free-star">★</span><span class="free-label">GRÁTIS</span>';
      } else if (tile.kind === 'mission') {
        el.dataset.kind = 'mission';
        renderMissionTile(el, tile.mission);
        attachMissionHandlers(el, tile.mission);
      } else {
        el.className = 'tile tile--number';
        el.dataset.kind = 'number';
        el.dataset.number = tile.number;
        el.textContent = tile.number;
      }

      cartelaEl.appendChild(el);
    }
  }
}

function renderBallCounter() {
  document.getElementById('ball-counter').textContent = '🎱 ' + STATE.ballsAvailable + ' bolas';
}

function renderCountdown() {
  const sub = document.getElementById('countdown-subtitle');
  if (eventIsOver()) { sub.textContent = 'Evento terminado'; return; }
  if (STATE.day >= STATE.maxDay) { sub.textContent = 'Último dia do evento'; return; }
  const remaining = STATE.maxDay - STATE.day + 1;
  sub.textContent = 'Evento termina em ' + remaining + ' dias';
}

function eventIsOver() {
  const outOfDays  = STATE.day >= STATE.maxDay;
  const outOfBalls = STATE.ballsAvailable === 0;
  const outOfBonus = STATE.bonusBallsToday >= STATE.maxBonusBallsPerDay;
  return outOfDays && outOfBalls && outOfBonus;
}

function updateSortearEnabled() {
  const btn = document.getElementById('sortear-btn');
  const enabled = STATE.ballsAvailable > 0 && !STATE.animating && !eventIsOver();
  btn.disabled = !enabled;
  btn.classList.toggle('sortear--disabled', !enabled);
}

function updateDevDayEnabled() {
  const btn = document.getElementById('dev-day-btn');
  const enabled = STATE.day < STATE.maxDay && !STATE.animating;
  btn.disabled = !enabled;
  btn.classList.toggle('dev-btn--disabled', !enabled);
}

function updateDevWinEnabled() {
  const btn = document.getElementById('dev-win-btn');
  const enabled = STATE.bonusBallsToday < STATE.maxBonusBallsPerDay && !STATE.animating;
  btn.disabled = !enabled;
  btn.classList.toggle('dev-btn--disabled', !enabled);
}

function refreshUI() {
  renderBallCounter();
  renderCountdown();
  updateSortearEnabled();
  updateDevDayEnabled();
  updateDevWinEnabled();
}

// ---------- Mission tap / long-press ----------

function attachMissionHandlers(el, mission) {
  let pressTimer = null;
  let longPressed = false;

  const start = function () {
    if (STATE.animating) return;
    longPressed = false;
    pressTimer = setTimeout(function () {
      longPressed = true;
      pressTimer = null;
      devAdvanceMission(mission, el);
    }, LONG_PRESS_MS);
  };

  const cancel = function () {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
  };

  const end = function () {
    const fired = longPressed;
    cancel();
    if (!fired && !STATE.animating) {
      openMissionPopup(mission);
    }
    longPressed = false;
  };

  el.addEventListener('pointerdown', start);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointerleave', cancel);
  el.addEventListener('pointercancel', cancel);
}

function devAdvanceMission(mission, el) {
  if (mission.progress >= mission.goal) return;
  mission.progress += 1;
  const newState = getMissionState(mission);
  el.dataset.state = newState;
  el.querySelector('.mission-fill').style.height = missionFillPct(mission) + '%';

  if (newState === 'completed') {
    const stamp = el.querySelector('.mission-stamp');
    stamp.style.animation = 'none';
    void stamp.offsetWidth;
    stamp.style.animation = '';

    const newlyClosed = detectNewLineClosures();
    newlyClosed.forEach(celebrateLineClose);
  }
}

// ---------- Mission popup ----------

function openMissionPopup(mission) {
  document.getElementById('mission-popup-title').textContent = mission.label;
  document.getElementById('mission-popup-progress').textContent =
    'Você fez ' + mission.progress + ' de ' + mission.goal + '.';
  document.getElementById('mission-popup-disambig').textContent = mission.disambiguation;
  document.getElementById('mission-popup-reward').textContent = mission.reward;
  document.getElementById('mission-popup-backdrop').dataset.open = 'true';
}

function closeMissionPopup() {
  document.getElementById('mission-popup-backdrop').dataset.open = 'false';
}

function wireMissionPopup() {
  const backdrop = document.getElementById('mission-popup-backdrop');
  document.getElementById('mission-popup-close').addEventListener('click', closeMissionPopup);
  backdrop.addEventListener('click', function (e) {
    if (e.target === backdrop) closeMissionPopup();
  });
}

// ---------- Sortear orchestration ----------

function wait(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, STATE.skipRequested ? Math.min(20, ms) : ms);
  });
}

async function doSortear() {
  if (STATE.ballsAvailable <= 0 || STATE.animating || eventIsOver()) return;

  STATE.animating = true;
  STATE.skipRequested = false;
  updateSortearEnabled();
  updateDevDayEnabled();
  updateDevWinEnabled();

  const N = STATE.ballsAvailable;
  const draws = drawNBalls(N);
  STATE.ballsAvailable = 0;
  renderBallCounter();

  const drumBody = document.getElementById('drum-body');
  drumBody.classList.add('drum-body--spinning');

  const skipHandler = function () { STATE.skipRequested = true; };
  document.body.addEventListener('click', skipHandler, true);

  await wait(DRUM_SPIN_MS);
  drumBody.classList.remove('drum-body--spinning');

  for (let i = 0; i < draws.length; i++) {
    const num = draws[i];
    await animateBall(num);

    if (CARTELA_NUMBER_SET.has(num)) {
      const newlyClosed = detectNewLineClosures();
      for (const lineId of newlyClosed) {
        celebrateLineClose(lineId);
        await wait(320);
      }
    }

    await wait(BETWEEN_BALLS_MS);
  }

  document.body.removeEventListener('click', skipHandler, true);
  STATE.animating = false;
  refreshUI();

  if (eventIsOver()) {
    showToast('Evento terminado');
    await clearLedgerWithFlourish();
  }
}

// ---------- Ball travel ----------

function getTileElementForNumber(num) {
  return document.querySelector('.tile--number[data-number="' + num + '"]');
}

function getSpoutCoords() {
  const drum = document.querySelector('.drum');
  const rect = drum.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.bottom - 2 };
}

// Moves a ball element (positioned absolutely with style.left/top set) to the center
// of targetEl via a CSS transform transition. Resolves after duration.
function travelBallTo(ball, targetEl, durationMs, targetScale) {
  return new Promise(function (resolve) {
    const rect = targetEl.getBoundingClientRect();
    const tx = rect.left + rect.width / 2;
    const ty = rect.top + rect.height / 2;
    const originX = parseFloat(ball.style.left);
    const originY = parseFloat(ball.style.top);
    const ms = STATE.skipRequested ? 20 : durationMs;
    ball.style.transition = 'transform ' + ms + 'ms cubic-bezier(0.4, 0.2, 0.3, 1)';
    ball.style.transform =
      'translate(' + (tx - originX) + 'px, ' + (ty - originY) + 'px) ' +
      'translate(-50%, -50%) scale(' + targetScale + ')';
    setTimeout(resolve, ms);
  });
}

async function animateBall(num) {
  const isHit = CARTELA_NUMBER_SET.has(num);

  // Make room in the ledger before the ball arrives.
  if (STATE.ledger.length >= STATE.ledgerMax) {
    await evictOldestLedger();
  }
  const slotIndex = STATE.ledger.length;
  STATE.ledger.push(num);

  const stage = document.getElementById('ball-stage');
  const ball = document.createElement('div');
  ball.className = 'ball';
  ball.textContent = num;
  const spout = getSpoutCoords();
  ball.style.left = spout.x + 'px';
  ball.style.top = spout.y + 'px';
  stage.appendChild(ball);
  void ball.offsetWidth;

  if (isHit) {
    const tile = getTileElementForNumber(num);
    await travelBallTo(ball, tile, BALL_TRAVEL_MS, 0.55);
    stampNumberTile(num);
    await wait(POST_STAMP_PAUSE);
    const slotEl = getLedgerSlotEl(slotIndex);
    await travelBallTo(ball, slotEl, LEDGER_TRAVEL_MS, 0.85);
  } else {
    const slotEl = getLedgerSlotEl(slotIndex);
    await travelBallTo(ball, slotEl, BALL_TRAVEL_MS, 0.85);
  }

  // Swap: place the static ledger-ball in the slot, then remove the flier.
  syncLedgerDOM();
  ball.remove();
}

// ---------- Stamp number tile ----------

function stampNumberTile(num) {
  if (STATE.stampedNumbers.has(num)) return;
  STATE.stampedNumbers.add(num);
  const tile = getTileElementForNumber(num);
  if (!tile) return;
  tile.classList.add('stamped');
  void tile.offsetWidth;
}

// ---------- Ball ledger (4x5 grid) ----------

function renderLedgerSkeleton() {
  const el = document.getElementById('ball-ledger');
  el.innerHTML = '';
  for (let i = 0; i < STATE.ledgerMax; i++) {
    const slot = document.createElement('div');
    slot.className = 'ball-ledger-slot';
    slot.dataset.slotIndex = String(i);
    el.appendChild(slot);
  }
}

function getLedgerSlotEl(slotIndex) {
  return document.querySelector(
    '#ball-ledger .ball-ledger-slot[data-slot-index="' + slotIndex + '"]'
  );
}

// Reconciles the ledger DOM against STATE.ledger. Keeps ledger-balls that are
// already at the correct slot+value; adds/removes as needed so visual state matches.
function syncLedgerDOM() {
  for (let i = 0; i < STATE.ledgerMax; i++) {
    const slot = getLedgerSlotEl(i);
    if (!slot) continue;
    const num = STATE.ledger[i];
    const existing = slot.querySelector('.ledger-ball');
    if (num === undefined) {
      if (existing) existing.remove();
      continue;
    }
    if (existing) {
      if (existing.textContent !== String(num)) {
        existing.textContent = num;
      }
    } else {
      const b = document.createElement('div');
      b.className = 'ledger-ball';
      b.textContent = num;
      slot.appendChild(b);
    }
  }
}

async function evictOldestLedger() {
  const slot = getLedgerSlotEl(0);
  if (!slot) { STATE.ledger.shift(); return; }
  const existing = slot.querySelector('.ledger-ball');
  if (!existing) { STATE.ledger.shift(); return; }

  const rect = existing.getBoundingClientRect();
  const num = existing.textContent;
  existing.remove();

  const stage = document.getElementById('ball-stage');
  const floater = document.createElement('div');
  floater.className = 'ball';
  floater.style.width = rect.width + 'px';
  floater.style.height = rect.height + 'px';
  floater.style.fontSize = '11px';
  floater.style.left = (rect.left + rect.width / 2) + 'px';
  floater.style.top = (rect.top + rect.height / 2) + 'px';
  floater.textContent = num;
  stage.appendChild(floater);
  void floater.offsetWidth;

  const ms = STATE.skipRequested ? 20 : LEDGER_EVICT_MS;
  floater.style.transition = 'transform ' + ms + 'ms ease-in, opacity ' + ms + 'ms ease';
  const startX = parseFloat(floater.style.left);
  const tx = window.innerWidth + 40;
  floater.style.transform = 'translate(' + (tx - startX) + 'px, 0) translate(-50%, -50%)';
  floater.style.opacity = '0';
  await wait(ms);
  floater.remove();

  STATE.ledger.shift();
  syncLedgerDOM();
}

async function clearLedgerWithFlourish() {
  if (STATE.ledger.length === 0) return;
  const stage = document.getElementById('ball-stage');
  const floaters = [];

  for (let i = 0; i < STATE.ledgerMax; i++) {
    const slot = getLedgerSlotEl(i);
    if (!slot) continue;
    const existing = slot.querySelector('.ledger-ball');
    if (!existing) continue;
    const rect = existing.getBoundingClientRect();
    const num = existing.textContent;
    existing.remove();

    const floater = document.createElement('div');
    floater.className = 'ball';
    floater.style.width = rect.width + 'px';
    floater.style.height = rect.height + 'px';
    floater.style.fontSize = '11px';
    floater.style.left = (rect.left + rect.width / 2) + 'px';
    floater.style.top = (rect.top + rect.height / 2) + 'px';
    floater.textContent = num;
    stage.appendChild(floater);
    floaters.push(floater);
  }

  STATE.ledger = [];
  floaters.forEach(function (f) { void f.offsetWidth; });

  const STAGGER_MS = 45;
  const FLY_MS = STATE.skipRequested ? 30 : 500;

  for (let i = 0; i < floaters.length; i++) {
    const f = floaters[i];
    setTimeout(function () {
      f.style.transition = 'transform ' + FLY_MS + 'ms ease-in, opacity ' + FLY_MS + 'ms ease';
      const startX = parseFloat(f.style.left);
      const tx = window.innerWidth + 40;
      f.style.transform = 'translate(' + (tx - startX) + 'px, 0) translate(-50%, -50%)';
      f.style.opacity = '0';
      setTimeout(function () { f.remove(); }, FLY_MS);
    }, i * (STATE.skipRequested ? 5 : STAGGER_MS));
  }

  await wait(floaters.length * STAGGER_MS + FLY_MS);
}

// ---------- Line closure detection + VFX ----------

function tileFilledAt(row, col) {
  if (row === 3 && col === 3) return true;
  if (row === 3) {
    const missionIndex = col < 3 ? col - 1 : col - 2;
    return MISSIONS[missionIndex].progress >= MISSIONS[missionIndex].goal;
  }
  const num = CARTELA_NUMBERS[row][col - 1];
  return STATE.stampedNumbers.has(num);
}

function detectNewLineClosures() {
  const newly = [];
  for (let row = 1; row <= 5; row++) {
    const id = 'row-' + row;
    if (STATE.linesClosed.has(id)) continue;
    let all = true;
    for (let col = 1; col <= 5; col++) {
      if (!tileFilledAt(row, col)) { all = false; break; }
    }
    if (all) { STATE.linesClosed.add(id); newly.push(id); }
  }
  for (let col = 1; col <= 5; col++) {
    const id = 'col-' + col;
    if (STATE.linesClosed.has(id)) continue;
    let all = true;
    for (let row = 1; row <= 5; row++) {
      if (!tileFilledAt(row, col)) { all = false; break; }
    }
    if (all) { STATE.linesClosed.add(id); newly.push(id); }
  }
  return newly;
}

function celebrateLineClose(lineId) {
  const parts = lineId.split('-');
  const kind = parts[0];
  const idx = parseInt(parts[1], 10);

  const tiles = [];
  for (let i = 1; i <= 5; i++) {
    const selector = kind === 'row'
      ? '.tile[data-row="' + idx + '"][data-col="' + i + '"]'
      : '.tile[data-row="' + i + '"][data-col="' + idx + '"]';
    const t = document.querySelector(selector);
    if (t) tiles.push(t);
  }

  tiles.forEach(function (t) { t.classList.add('line-closed'); });

  const firstR = tiles[0].getBoundingClientRect();
  const lastR = tiles[tiles.length - 1].getBoundingClientRect();
  const stage = document.getElementById('ball-stage');

  const sweep = document.createElement('div');
  sweep.className = 'line-sweep line-sweep--' + kind;
  if (kind === 'row') {
    sweep.style.left = firstR.left + 'px';
    sweep.style.top = firstR.top + 'px';
    sweep.style.width = (lastR.right - firstR.left) + 'px';
    sweep.style.height = firstR.height + 'px';
  } else {
    sweep.style.left = firstR.left + 'px';
    sweep.style.top = firstR.top + 'px';
    sweep.style.width = firstR.width + 'px';
    sweep.style.height = (lastR.bottom - firstR.top) + 'px';
  }
  stage.appendChild(sweep);
  setTimeout(function () { sweep.remove(); }, 1000);

  const centerX = (firstR.left + lastR.right) / 2;
  const centerY = (firstR.top + lastR.bottom) / 2;
  const cf = document.createElement('div');
  cf.className = 'currency-float';
  cf.textContent = '+' + STATE.rewardPerLine + ' moedas';
  cf.style.left = centerX + 'px';
  cf.style.top = centerY + 'px';
  stage.appendChild(cf);
  setTimeout(function () { cf.remove(); }, 1200);

  if (!STATE.firstLineClosedEvent) {
    STATE.firstLineClosedEvent = true;
    try { localStorage.setItem(FIRST_LINE_FLAG_KEY, 'true'); } catch (e) {}
    showFirstLineBanner();
  }
}

function showFirstLineBanner() {
  const banner = document.getElementById('first-line-banner');
  banner.querySelector('.banner-text').textContent =
    'Primeira linha! +' + STATE.rewardPerLine + ' moedas';
  banner.dataset.visible = 'true';
  setTimeout(function () { banner.dataset.visible = 'false'; }, 2000);
}

// ---------- Dev buttons ----------

function devAddDay() {
  if (STATE.animating) return;
  if (STATE.day >= STATE.maxDay) return;
  STATE.day += 1;
  STATE.ballsAvailable += STATE.ballsPerDay;
  STATE.bonusBallsToday = 0;
  refreshUI();
  showToast('Dia ' + STATE.day + ': +' + STATE.ballsPerDay + ' bolas');
}

function devAddWin() {
  if (STATE.animating) return;
  if (STATE.bonusBallsToday >= STATE.maxBonusBallsPerDay) return;
  STATE.bonusBallsToday += 1;
  STATE.ballsAvailable += 1;
  refreshUI();
  showToast('+1 bola de bingo (' + STATE.bonusBallsToday + '/' + STATE.maxBonusBallsPerDay + ' hoje)');
}

// ---------- Wiring ----------

function wireButtons() {
  document.getElementById('sortear-btn').addEventListener('click', doSortear);
  document.getElementById('dev-day-btn').addEventListener('click', devAddDay);
  document.getElementById('dev-win-btn').addEventListener('click', devAddWin);
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(function () { toast.classList.add('toast--visible'); });
  setTimeout(function () {
    toast.classList.remove('toast--visible');
    setTimeout(function () { toast.remove(); }, 300);
  }, 1800);
}

// ---------- Init ----------

renderCartela();
renderLedgerSkeleton();
syncLedgerDOM();
refreshUI();
wireButtons();
wireMissionPopup();
