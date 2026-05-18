# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

**Squadly** (originally "Daily Roulette") is a real-time team facilitation tool. Admins create rooms, team members join via invite link, and the app randomly assigns a facilitator for daily standups using one of four game modes (ruleta, cartas, slots, bomba). It is a vanilla JS SPA hosted on Cloudflare Pages backed by Firebase Realtime Database and Google Auth.

## Two coexisting apps (migración gradual)

El proyecto está en migración gradual. Ambos entornos son válidos y deployables:

| Entorno | Entry point | Cómo correr |
|---|---|---|
| **Original (vanilla JS)** | `index.html` | Live Server en VS Code → `http://localhost:8080` |
| **Nueva app React (Fase 1+)** | `app.html` + `src/main.tsx` | `npm run dev` → `http://localhost:5173` |

```bash
# Instalar dependencias (primera vez)
npm install

# Desarrollo React + Vite
npm run dev

# Verificar tipos TypeScript
npm run typecheck

# Build de producción
npm run build
```

## Deploy

```bash
./deploy.sh
```

Deploys to **https://squadly.pages.dev** via Cloudflare Wrangler (auto-installs if missing). First run requires `wrangler login`.

## Variables de entorno

Copiar `.env.example` a `.env` y completar con las credenciales de Firebase. **Nunca commitear `.env`.**
El prefijo `VITE_` es obligatorio para que Vite las exponga al cliente.

## Architecture

### Nueva estructura (src/ — Fase 1 completada)

```
src/
  main.tsx              ← entry point Vite/React
  app/index.tsx         ← App shell: maneja auth y ruteo entre AuthPage / LobbyView / AppView
  types/index.ts        ← interfaces TypeScript del dominio (Room, Member, History, Presence…)
  utils/
    dates.ts            ← today/tomorrow/dateOffset/fmtDate/getTaskDueDate/availableAgainDate
  services/
    firebase.ts         ← inicialización Firebase desde import.meta.env
    auth.ts             ← signIn/signOut, subscribeToAuthChanges, helpers de localStorage
    db.ts               ← fbAdd / fbSet / fbUpdate / fbRemove (sin dependencias de DOM)
    presence.ts         ← setPresence, isMemberOnline, heartbeat (30 s), umbral offline (90 s)
    status.ts           ← getMemberStatus, getMemberStatusBase, getEligible, canCurrentUserSpin
    rooms.ts            ← createRoom, updateRoomConfig, deleteRoom, fetchRoomMeta, findRoomByCode
    game.ts             ← pickRandomWinner, saveWinner, revertWinner, buildWinnerMessage
  hooks/
    useAuth.ts          ← suscripción reactiva a onAuthStateChanged
    useRooms.ts         ← adminRooms (realtime) + participantRooms (localStorage/memberLinks)
  views/
    AuthPage.tsx        ← pantalla de login con Google
    LobbyView.tsx       ← lista de salas admin + salas donde participo
  components/
    common/
      SquadlyLogo.tsx   ← SVG del logo reutilizable
```

### App original (index.html — fuente de verdad mientras dure la migración)

**The source of truth is `index.html` (~5 000 lines).** `app.js` and `styles.css` are extracted reference copies only — do not edit them expecting changes to take effect. Always edit `index.html`.

Inside `index.html`, the JS module is embedded as `<script type="module">` and mirrors the structure of `app.js` exactly:

| Section (marked with `// =====`) | Responsibility |
|---|---|
| STATE | Global mutable vars: `currentUser`, `currentRoomId`, `state` (members/history/presence), `myMemberId`, `isRoomAdmin` |
| AUTH | `onAuthStateChanged` is the app entry point; routes to lobby, register view, or app view |
| PRESENCE | Heartbeat every 30 s; `onDisconnect` for offline detection; members considered offline after 90 s without timestamp |
| LOBBY / ENTER ROOM | `showLobbyView()` → `listenRooms()` → `renderLobby()`; `showAppView(roomId)` loads a room |
| ROOM LISTENERS | `initRoomListeners()` — subscribes to `members/`, `history/`, `presence/`, `roulette/` paths |
| WRITES | `fbAdd / fbSet / fbUpdate / fbRemove` — thin wrappers over Firebase that toggle sync status |
| GAME MODE & MUSIC | `selectedGameMode` / `cfgGameMode` are separate vars for create-modal vs config-modal context |
| BACKGROUND MUSIC ENGINE | Web Audio API synthesized music (no external audio files); four themes: circus, 8bit, gameshow, hype |
| GAME MODES | `spinCards()`, `spinSlots()`, `spinBomb()` each resolve a winner and delegate to `saveBombWinner` / shared confirm flow |
| CANVAS RULETA | Custom canvas-drawn spinning wheel; `drawWheel(angle)` + `spinRoulette()` |
| RENDERS | `renderTeam()`, `renderMemberStatus()`, `renderHistory()` — full re-renders on every Firebase snapshot |

## Firebase data structure

```
roomsMeta/{roomId}       ← lightweight room info (name, pin, icon, ownerUid)
rooms/{ownerUid}/{roomId} ← full room config (legacy path, still read for backward compat)
roomsIndex/{roomId}      ← ownerUid index for rooms created before roomsMeta existed
members/{roomId}/{memberId}
history/{roomId}/{entryId}
presence/{roomId}/{memberId}  ← {online: bool, ts: epoch ms}
roulette/{roomId}        ← {spinning: bool} real-time spin state
memberLinks/{uid}/{roomId}   ← links Google account to a memberId
```

## Key patterns

**Global functions on `window.*`:** All functions called from HTML `onclick` attributes are explicitly assigned to `window` (e.g. `window.createRoom = createRoom`). This is the only event binding mechanism — there are no `addEventListener` calls from JS for UI actions.

**Member identity is session-based:** `myMemberId` is stored in `localStorage` as `dr_session_{roomId}`. A Google-authed user may have multiple member identities across rooms via `memberLinks/{uid}/{roomId}`.

**Two modal contexts for game/music selection:** The create-room modal and the config modal share the same selector UI but store selections in separate variables (`selectedGameMode` / `cfgGameMode`). Always pass the `ctx` argument ('create' or 'config') to `selectGameMode()` / `selectMusic()`.

**Member status hierarchy:** `getMemberStatus()` checks (in order): facilitating today → assigned tomorrow → unavailable tomorrow → free day 1 → free day 2 → eligible. It additionally applies the `requireOnline` room setting. `getMemberStatusBase()` is the same without the online check.

**Spin eligibility:** `getEligible()` filters `state.members` by status and, if `requireOnline` is set, by `isMemberOnline()`. Minimum participant count is enforced before allowing a spin.

## Room types

| Type | Behavior |
|---|---|
| `ruleta` (default) | Standard — assigns facilitator day-ahead |
| `convocatoria` | Meeting mode — assigns for same day; hides "times selected" count |

## Styling

CSS custom properties are defined on `:root` in `styles.css` (and mirrored in `index.html`). Theme tokens: `--bg`, `--bg2`, `--card`, `--accent`, `--text`, `--text2`, `--text3`, `--border`, `--success`, `--danger`.
