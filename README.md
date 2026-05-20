# Scacchi dei Pinci — v1.4.6

Un gioco di strategia per 2 giocatori ispirato ai racconti di Jorge Luis Borges.

🎮 **[Gioca ora](https://grandepinnatk.github.io/scacchideipinci/)**

---

## Come si gioca

Il campo è una linea di 5 caselle divise in 3 zone: **Castello** (1-2), **Sala del Re** (3) e **Villaggio** (4-5).

I due giocatori inseriscono i pezzi da lati opposti. Ogni nuovo pezzo spinge quelli esistenti verso l'avversario. Quando due pezzi si trovano nella stessa casella, si confrontano i valori per quella zona. Il primo a **50 punti** vince.

**Turno 1:** G1 inserisce 1 carta, G2 ne inserisce 2. Dal turno 2 entrambi inseriscono 2 carte.

**Sala del Re:** vincere il confronto nella casella 3 vale **2 punti** invece di 1.

---

## Come giocare le carte

| Dispositivo | Azione |
|-------------|--------|
| **PC** | Click per selezionare · Doppio click per giocare subito |
| **Mobile / Tablet** | Tap per selezionare · Swipe verso l'alto per giocare |
| **Tutti** | Seleziona + bottone "Gioca Carta" |

---

## Multiplayer

Accedi con email/password, Google o Microsoft. Dalla lobby puoi:

- **Partita rapida** — il sistema trova automaticamente un avversario
- **Invita amico** — genera un codice da condividere, l'amico lo inserisce per unirsi

Timer **45 secondi** per mossa. Se un giocatore abbandona per più di 2 minuti, la vittoria va all'avversario.

---

## Gioca vs CPU

Il pulsante "🤖 Gioca vs CPU" apre una schermata di selezione difficoltà. Ad ogni partita viene **sorteggiato** chi gioca per primo: puoi trovarti come G1 o come G2, e il CPU si adatta di conseguenza.

| Difficoltà | Strategia |
|------------|-----------|
| **🎲 Facile** | Sceglie le carte con un weighted random proporzionale al valore (`val`). Non valuta il campo. Adatto per imparare. |
| **⚔ Medio** | Simula ogni possibile inserimento (fino a 10 carte) e sceglie il delta di punteggio migliore. Ha un 10% di probabilità di scegliere la seconda opzione migliore. |
| **💀 Difficile** | Ottimizza la coppia di carte del turno testando tutte le coppie ordinate (fino a 90 combinazioni). Aggiunge un bonus posizionale per la valutazione dello stato del campo. Raramente sbaglia. |

Al termine della partita il giocatore torna automaticamente alla schermata di selezione difficoltà.

Le partite vs CPU **non modificano ELO né statistiche** — solo le partite multiplayer online contano per la classifica.

Il motore è implementato in `ai.js`, senza dipendenze da Firebase.

---

## Lobby

- **Statistiche personali** — Partite, Vittorie, ELO e Posizione in classifica globale
- **Pulsanti di gioco** — Partita rapida, Invita amico, Gioca vs CPU
- **Classifica globale** — Top 10 per ELO con pallino stato per ogni giocatore (🟢 online, 🟠 in gioco, ⚫ offline) e link "Vedi completa →" alla pagina classifica dedicata

---

## Classifica

La pagina `leaderboard.html` mostra la classifica completa di tutti i giocatori registrati. Il design riprende integralmente quello della lobby: stessi font, stessa palette colori, stesso layout `.lobby-box`. La pagina include:

- **Podio** — le prime tre posizioni evidenziate come stat-card con medaglie 🥇🥈🥉
- **Classifica paginata** — tutti i giocatori ordinati per ELO con navigazione a pagine; menu a tendina per scegliere 10, 20 o 50 righe per pagina; indicatore "X–Y di N" e pulsanti con ellissi intelligente
- **Apertura contestuale** — se l'utente è loggato, la vista si apre direttamente sulla pagina che contiene la propria riga
- **Stato giocatore** — pallino colorato in ogni riga: 🟢 online, 🟠 in gioco, ⚫ offline (basato su `lastSeen` e campo `inGame` su Firebase)
- **Evidenziazione** — la propria riga è sempre marcata in oro; le medaglie per i top 3 sono mantenute indipendentemente dalla pagina

---

## Temi grafici

Il layout del gioco è personalizzabile con tre temi selezionabili dai pulsanti circolari in alto a destra nella lobby. La scelta viene salvata nel browser.

| Tema | Descrizione |
|------|-------------|
| ⬛ **Classico** | Design originale scuro con palette sabbia/oro |
| 🌑 **Moderno Scuro** | Sfondo quasi nero con score-card orizzontali e avatar |
| 🌕 **Moderno Chiaro** | Sfondo marmo bianco con bcard colorate su fondo chiaro |

---

## Sistema Premi

Accessibile dall'icona 🏅 nell'header della lobby. Mostra un badge numerico rosso quando ci sono premi non visti.

### Badge

Otto badge sbloccabili automaticamente durante le partite multiplayer online (non vs CPU):

| Badge | Condizione |
|-------|-----------|
| 💥 Boom!! | Prima partita vinta |
| 🔥 3 in a Row | 3 vittorie consecutive |
| 🌋 On Fire | 5 vittorie consecutive |
| ⚡ 10 in a Row | 10 vittorie consecutive |
| 🏆 Inarrestabile | 15 vittorie consecutive |
| 🪡 Filo di lana | Vittoria con 1 punto di scarto |
| 🐉 Dragon | Vittoria con più di 20 punti di scarto |
| ✨ Super Saiyan | Vittoria con più di 30 punti di scarto |

### Mazzi di Carte

Quattro mazzi sbloccabili per soglia ELO. Una volta sbloccato, il mazzo rimane disponibile anche se l'ELO scende. La preferenza viene salvata su Firebase e caricata ad ogni login.

| Mazzo | ELO | Cartella |
|-------|-----|---------|
| 🎨 Classico | sempre | `img/1000/` |
| 🖍️ Cartoon | ≥ 1010 | `img/1010/` |
| 🚀 Spaziale | ≥ 1020 | `img/1020/` |
| 🟡 Simpson | ≥ 1030 | `img/1030/` |

---

## I 40 Pezzi

| Rarità | Forza | Limite in gioco |
|--------|-------|-----------------|
| 🟡 Leggendario | val ≥ 20 | Deve essere l'unica carta non-comune in campo |
| 🟣 Epico | val 15–19 | Max 2 non-comuni totali, nessuna Leggendaria, al massimo 1 Epica |
| 🔵 Raro | val 10–14 | Max 2 non-comuni totali, nessuna Leggendaria |
| ⚫ Comune | val < 10 | Sempre giocabile |

Le carte che violano i limiti appaiono grigie e non selezionabili nel basket. Ogni piece-chip nel campo di gioco mostra un badge colorato (`C`/`R`/`E`/`L`) accanto al nome.

Ogni pezzo ha valori C/R/V per le tre zone e un'illustrazione in stile pittura fiamminga (Bruegel, Bosch, van Eyck).

---

## Struttura del Progetto

```
index.html        — HTML + @font-face embedded
leaderboard.html  — Pagina classifica completa (design lobby)
admin.html        — Console di amministrazione
style.css         — Tutti gli stili del gioco
themes.css        — Variabili CSS per i tre temi (Classico, Moderno Scuro, Moderno Chiaro)
firebase.js       — Inizializzazione Firebase SDK
shared.js         — Stato condiviso (MP, getCurrentUser, showScreen)
game.js           — Logica di gioco, render, animazioni, settings
matchmaking.js    — Quick match, invite, sync online, timer, forfeit
auth.js           — Autenticazione, lobby, ELO, classifica, bootstrap
ai.js             — Motore AI (Facile / Medio / Difficile), nessuna dipendenza Firebase
audio.js          — Sintetizzatore audio via Web Audio API (nessun file esterno)
audio-hooks.js    — Collegamento eventi di gioco → audio (unico punto di contatto)
rewards.js        — Sistema premi: badge e mazzi di carte, sincronizzato su Firebase
img/              — 40 illustrazioni PNG dei pezzi
CHANGELOG.md      — Storia delle versioni
```

---

## Console Admin

Accessibile su `/admin.html`. Richiede login con email autorizzata.

Super admin fisso: `grandepinna.tk@gmail.com`

- **Carte** — modifica C/R/V e forza; rarità aggiornata automaticamente
- **Impostazioni** — punteggio vittoria (10–200) e pesi rarità per fascia (0–30)
- **Amministratori** — aggiungi/rimuovi email con ruolo admin

---

## Firebase Setup

**Regole Realtime Database:**
```json
{
  "rules": {
    "users": {
      ".read": "auth != null",
      ".indexOn": ["elo"],
      "$uid": { ".write": "auth != null && auth.uid == $uid" }
    },
    "games": { "$gameId": { ".read": "auth != null", ".write": "auth != null" } },
    "matchmaking": { ".read": "auth != null", ".write": "auth != null" },
    "activeGame": {
      "$uid": {
        ".read": "auth != null && auth.uid == $uid",
        ".write": "auth != null && auth.uid == $uid"
      }
    },
    "invites": { ".read": "auth != null", ".write": "auth != null" },
    "admin": { ".read": "auth != null", ".write": "auth != null" }
  }
}
```
