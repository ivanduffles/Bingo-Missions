// PROTOTYPE - NOT FOR PRODUCTION
// Question: Does the Bingo event core loop (Sortear -> stamps -> line close) feel right on mobile?
// Date: 2026-04-24

// Phase 3.1: 10 balls/day, +1 Vitória dev button with 3/day cap, Faça Canastras -> spade.
// Mission popup copy lives on each MISSION entry.

const MISSIONS = [
  {
    id: 'jogue', label: 'Jogue Partidas', goal: 2, progress: 0, archetype: 'play',
    disambiguation: 'Só partidas concluídas contam — partidas abandonadas não contam.',
    reward: 'Completar esta missão fecha a linha correspondente da cartela.',
  },
  {
    id: 'faca', label: 'Faça Canastras', goal: 3, progress: 0, archetype: 'canastra',
    disambiguation: 'Canastras do naipe indicado contam; de outros naipes, não.',
    reward: 'Completar esta missão fecha a linha correspondente da cartela.',
  },
  {
    id: 'limpas', label: 'Canastras Limpas', goal: 1, progress: 0, archetype: 'limpa',
    disambiguation: 'Só canastras sem coringa contam como limpas.',
    reward: 'Completar esta missão fecha a linha correspondente da cartela.',
  },
  {
    id: 'coringas', label: 'Use Coringas', goal: 4, progress: 0, archetype: 'coringa',
    disambiguation: 'Todo coringa jogado conta, seja em canastra ou em sequência.',
    reward: 'Completar esta missão fecha a linha correspondente da cartela.',
  },
];

// 5x5 cartela layout.
// Row 3 cols 1, 2, 4, 5 are missions. Row 3 col 3 is free.
// Numbers pre-picked within Brazilian bingo column ranges
// (col 1: 1-15, col 2: 16-30, col 3: 31-45, col 4: 46-60, col 5: 61-75).
const CARTELA_NUMBERS = {
  1: [  3, 18, 33, 48, 63 ],
  2: [  7, 22, 38, 51, 68 ],
  // row 3 skipped — missions
  4: [ 11, 27, 42, 55, 72 ],
  5: [ 14, 30, 45, 60, 74 ],
};

function getTileAt(row, col) {
  if (row === 3 && col === 3) return { kind: 'free' };
  if (row === 3) {
    const missionIndex = col < 3 ? col - 1 : col - 2;
    return { kind: 'mission', mission: MISSIONS[missionIndex] };
  }
  return { kind: 'number', number: CARTELA_NUMBERS[row][col - 1] };
}

function makeBallPool() {
  const pool = [];
  for (let i = 1; i <= 75; i++) pool.push(i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
  }
  return pool;
}

function collectCartelaNumbers() {
  const s = new Set();
  [1, 2, 4, 5].forEach(function (row) {
    CARTELA_NUMBERS[row].forEach(function (n) { s.add(n); });
  });
  return s;
}

const CARTELA_NUMBER_SET = collectCartelaNumbers();
const FIRST_LINE_FLAG_KEY = 'bingo-first-line-closed';

function readFirstLineFlag() {
  try { return localStorage.getItem(FIRST_LINE_FLAG_KEY) === 'true'; }
  catch (e) { return false; }
}

const STATE = {
  day: 1,
  maxDay: 7,
  ballsAvailable: 10,
  ballsPerDay: 10,
  bonusBallsToday: 0,
  maxBonusBallsPerDay: 3,
  ballPool: makeBallPool(),
  ballPoolIndex: 0,
  stampedNumbers: new Set(),
  linesClosed: new Set(),
  firstLineClosedEvent: readFirstLineFlag(),
  animating: false,
  skipRequested: false,
  rewardPerLine: 50,
  ledger: [],         // numbers currently shown in the ledger grid (FIFO, capped at ledgerMax)
  ledgerMax: 20,      // 4x5 grid capacity
};

function drawNBalls(n) {
  const draws = [];
  for (let i = 0; i < n && STATE.ballPoolIndex < STATE.ballPool.length; i++) {
    draws.push(STATE.ballPool[STATE.ballPoolIndex++]);
  }
  return draws;
}
