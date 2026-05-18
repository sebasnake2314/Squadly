# Squadly

Herramienta de facilitación de dailys para equipos de desarrollo. Los admins crean salas, los participantes se unen por link de invitación, y la app sortea aleatoriamente al facilitador usando uno de cuatro modos de juego.

**Producción:** https://squadly.pages.dev

---

## Modos de juego

| Modo | Descripción |
|------|-------------|
| 🎰 Ruleta | Ruleta giratoria con canvas |
| 🃏 Cartas | Mazo con animación de barajeo + flip del ganador |
| 🎰 Slots | Tragamonedas con carrete animado |
| 💣 Bomba | Bomba con cuenta regresiva que explota en el ganador |

---

## Stack tecnológico

| Tecnología | Uso |
|------------|-----|
| HTML / CSS / JS vanilla | App principal (`index.html`) |
| React + TypeScript + Vite | App nueva en migración gradual (`src/`) |
| Firebase Realtime Database | Sincronización en tiempo real |
| Firebase Auth (Google) | Autenticación de administradores |
| Cloudflare Pages | Hosting estático |
| Web Audio API | Música y sonidos (sin archivos externos) |

---

## Estructura del proyecto

```
squadly/
├── index.html          ← App vanilla JS (fuente de verdad — editar aquí)
├── app.html            ← Entry point React
├── styles.css          ← Referencia de estilos extraídos (solo lectura)
├── app.js              ← Referencia del JS extraído (solo lectura)
├── deploy.sh           ← Deploy a Cloudflare Pages
├── vite.config.ts      ← Configuración Vite
├── tsconfig.json
├── package.json
├── .env.example        ← Variables de entorno requeridas
├── public/             ← Favicon, iconos PWA, manifest
└── src/                ← App React (migración en curso)
    ├── main.tsx
    ├── app/
    ├── components/
    ├── hooks/
    ├── services/
    ├── types/
    ├── utils/
    └── views/
```

> **Importante:** El archivo que siempre editás es `index.html`.
> `styles.css` y `app.js` son copias de referencia extraídas — no editarlas directamente.

---

## Setup inicial

### 1. Clonar el repositorio

```bash
git clone https://github.com/sebasnake2314/Squadly.git
cd Squadly
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

```bash
cp .env.example .env
```

Completar `.env` con las credenciales de Firebase:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_DATABASE_URL=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

> Las credenciales se obtienen en la consola de Firebase del proyecto `daily-roulette-15d78`.

---

## Desarrollo local

### App vanilla JS (index.html)

1. Instalar la extensión **Live Server** en VS Code (`ritwickdey.LiveServer`)
2. Click derecho en `index.html` → **"Open with Live Server"**
3. Abre `http://localhost:8080` — se recarga automáticamente al guardar

### App React (src/)

```bash
npm run dev
```

Abre `http://localhost:5173`

### Verificar tipos TypeScript

```bash
npm run typecheck
```

---

## Deploy

```bash
# En Git Bash / Mac / Linux
bash deploy.sh

# En PowerShell (manual)
npm run build
Copy-Item index.html dist\index.html
Copy-Item styles.css dist\styles.css
wrangler pages deploy dist --project-name=squadly --commit-dirty=true
```

El script:
1. Compila la app React con Vite (`dist/`)
2. Copia `index.html` y `styles.css` al `dist/`
3. Sube todo a Cloudflare Pages con Wrangler

La primera vez solicita login en Cloudflare (`wrangler login`).

---

## Arquitectura Firebase

```
roomsMeta/{roomId}           ← Info liviana de sala (nombre, pin, icon, ownerUid)
rooms/{ownerUid}/{roomId}    ← Config completa de sala (legacy, se sigue leyendo)
roomsIndex/{roomId}          ← Índice ownerUid
members/{roomId}/{memberId}
history/{roomId}/{entryId}
presence/{roomId}/{memberId} ← {online: bool, ts: epoch ms}
roulette/{roomId}            ← {spinning: bool} estado de giro en tiempo real
memberLinks/{uid}/{roomId}   ← Vincula cuenta Google con memberId
```

---

## Tipos de sala

| Tipo | Comportamiento |
|------|----------------|
| `sorteo` (default) | Asigna facilitador para el día siguiente |
| `convocatoria` | Asigna para el mismo día; oculta contador de veces seleccionado |

---

## Notas de desarrollo

- Todas las funciones llamadas desde `onclick` en el HTML se asignan explícitamente a `window.*`
- La identidad del miembro es por sesión: `localStorage` clave `dr_session_{roomId}`
- El selector de participantes (modo offline) permite al admin elegir manualmente quién participa en el sorteo
- La jerarquía de estados es: `facilitating_today` → `assigned_tomorrow` → `unavailable_tomorrow` → `free_day1/2` → `eligible`
