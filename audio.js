// ─── audio.js — effetti sonori sintetizzati via Web Audio API ─────────────────
// Nessun file esterno: tutti i suoni sono generati al volo.
// Esporta: SFX.select(), SFX.play(), SFX.slide(), SFX.combat(), SFX.win(), SFX.lose()
// Il volume globale è controllabile con SFX.setVolume(0..1).
// I suoni vengono silenziati se l'utente non ha ancora interagito con la pagina
// (requisito browser per AudioContext).

const _ctx = (() => {
  try { return new (window.AudioContext || window.webkitAudioContext)(); }
  catch(e) { return null; }
})();

let _vol = 0.55;  // volume globale default

export const SFX = {
  setVolume(v) { _vol = Math.max(0, Math.min(1, v)); },
  select,
  play:   playCard,
  slide,
  combat,
  win,
  lose,
};

// ── Riattiva il contesto dopo il primo gesto utente (requisito browser) ───────
document.addEventListener('click', () => {
  if (_ctx && _ctx.state === 'suspended') _ctx.resume();
}, { once: false });

// ── Helpers ───────────────────────────────────────────────────────────────────

function _gain(value, when, duration) {
  if (!_ctx) return null;
  const g = _ctx.createGain();
  g.gain.setValueAtTime(value * _vol, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  g.connect(_ctx.destination);
  return g;
}

function _osc(type, freq, when, duration, gainVal) {
  if (!_ctx) return;
  const o = _ctx.createOscillator();
  const g = _gain(gainVal, when, duration);
  if (!g) return;
  o.type = type;
  o.frequency.setValueAtTime(freq, when);
  o.connect(g);
  o.start(when);
  o.stop(when + duration + 0.05);
}

function _freqRamp(type, freqStart, freqEnd, when, duration, gainVal) {
  if (!_ctx) return;
  const o = _ctx.createOscillator();
  const g = _gain(gainVal, when, duration);
  if (!g) return;
  o.type = type;
  o.frequency.setValueAtTime(freqStart, when);
  o.frequency.exponentialRampToValueAtTime(freqEnd, when + duration);
  o.connect(g);
  o.start(when);
  o.stop(when + duration + 0.05);
}

function _noise(when, duration, gainVal, filterFreq) {
  if (!_ctx) return;
  const bufSize = _ctx.sampleRate * duration;
  const buf     = _ctx.createBuffer(1, bufSize, _ctx.sampleRate);
  const data    = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

  const src    = _ctx.createBufferSource();
  const filter = _ctx.createBiquadFilter();
  const g      = _gain(gainVal, when, duration);
  if (!g) return;

  filter.type            = 'bandpass';
  filter.frequency.value = filterFreq || 800;
  filter.Q.value         = 1.5;

  src.buffer = buf;
  src.connect(filter);
  filter.connect(g);
  src.start(when);
  src.stop(when + duration + 0.05);
}

// ── Selezione carta ───────────────────────────────────────────────────────────
// Click secco + leggero tick → feedback che la carta è stata evidenziata
function select() {
  if (!_ctx) return;
  const t = _ctx.currentTime;
  _osc('sine',   1200, t,        0.04, 0.18);
  _osc('square',  900, t + 0.02, 0.03, 0.10);
}

// ── Carta giocata (prima del slide) ──────────────────────────────────────────
// Suono di "lancio" breve e secco
function playCard() {
  if (!_ctx) return;
  const t = _ctx.currentTime;
  _freqRamp('sawtooth', 300, 120, t,        0.08, 0.22);
  _freqRamp('sine',     500, 200, t + 0.02, 0.10, 0.15);
  _noise(t, 0.06, 0.12, 1200);
}

// ── Slide — scorrimento carte sul campo ───────────────────────────────────────
// Whoosh: rumore filtrato che sale e scende
function slide(direction) {
  if (!_ctx) return;
  const t = _ctx.currentTime;
  const fStart = direction === 'right' ? 300 : 1200;
  const fEnd   = direction === 'right' ? 1200 : 300;

  _noise(t, 0.22, 0.28, 600);

  // Sweep tonale che accompagna il movimento
  _freqRamp('sine', fStart, fEnd, t, 0.20, 0.10);
}

// ── Combattimento ─────────────────────────────────────────────────────────────
// Impatto metallico: rumore burst + risonanza
function combat(winner) {
  if (!_ctx) return;
  const t = _ctx.currentTime;

  // Burst di rumore (impatto)
  _noise(t, 0.06, 0.45, 2000);
  _noise(t, 0.10, 0.25, 400);

  if (winner === 0) {
    // Pareggio: suono neutro
    _osc('sine', 440, t + 0.04, 0.18, 0.12);
    _osc('sine', 440, t + 0.10, 0.12, 0.08);
  } else {
    // Vittoria combattimento: tonalità ascendente breve
    _freqRamp('sine', 300, 600, t + 0.03, 0.15, 0.18);
    _osc('triangle', 800, t + 0.15, 0.12, 0.10);
  }
}

// ── Vittoria partita ──────────────────────────────────────────────────────────
// Fanfara ascendente a 3 note
function win() {
  if (!_ctx) return;
  const t = _ctx.currentTime;
  const notes = [523, 659, 784, 1047];  // Do Mi Sol Do (ottava su)
  notes.forEach((freq, i) => {
    const when = t + i * 0.14;
    _osc('sine',     freq,       when, 0.25, 0.28);
    _osc('triangle', freq * 2,   when, 0.20, 0.10);
    if (i === notes.length - 1) {
      // Ultimo accordo più lungo
      _osc('sine',     freq,     when, 0.55, 0.25);
      _osc('sine',     freq * 1.5, when, 0.45, 0.12);
    }
  });
}

// ── Sconfitta / fine partita negativa ────────────────────────────────────────
// Sequenza discendente triste
function lose() {
  if (!_ctx) return;
  const t = _ctx.currentTime;
  const notes = [392, 330, 262, 196];   // Sol Fa Mi Do (discendente)
  notes.forEach((freq, i) => {
    const when = t + i * 0.18;
    _osc('sine',     freq,     when, 0.30, 0.20);
    _osc('triangle', freq * 0.5, when, 0.25, 0.10);
  });
}
