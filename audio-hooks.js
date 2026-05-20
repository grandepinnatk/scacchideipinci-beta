// ─── audio-hooks.js — collegamento tra eventi di gioco e sistema audio ────────
// Questo modulo è l'unico punto di contatto tra game.js e audio.js.
// game.js chiama window._audioHooks.onXxx() senza sapere nulla di audio.js.
// audio-hooks.js importa SFX da audio.js e risponde ad ogni evento.
//
// Per silenziare o sostituire l'audio basta cambiare questo file.

import { SFX } from './audio.js?v=1.4.5';

export function initAudioHooks() {
  window._audioHooks = {
    /** Carta selezionata nel basket */
    onSelect() {
      SFX.select();
    },

    /** Carta inserita nella pipe (prima dello slide) */
    onPlay() {
      SFX.play();
    },

    /** Animazione slide completata — direction: 'right' | 'left' */
    onSlide(direction) {
      SFX.slide(direction);
    },

    /** Combattimento risolto — winner: 0=pareggio, 1=G1, 2=G2 */
    onCombat(winner) {
      SFX.combat(winner);
    },

    /** Fine partita — vittoria */
    onWin() {
      SFX.win();
    },

    /** Fine partita — sconfitta */
    onLose() {
      SFX.lose();
    },
  };
}
