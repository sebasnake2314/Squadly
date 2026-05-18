# Squadly

Herramienta de coordinación de equipos en tiempo real. Los administradores crean salas con dos propósitos distintos:

- **Salas de sorteo** — el admin define una actividad o tarea ("¿Quién presenta el reporte?", "¿Quién modera la reunión?") y la app elige al azar quién la cumple, con mecánicas de juego para hacerlo entretenido.
- **Salas de convocatoria** — el admin crea eventos con fechas y los participantes confirman o rechazan su asistencia.

Los participantes se unen a las salas mediante un link de invitación o código, sin necesidad de crear una cuenta.

**Producción:** https://squadly.pages.dev

---

## Tipos de sala

### 🎰 Sorteo
El admin define el propósito de la sala (qué actividad se sortea) y configura las reglas:

| Configuración | Descripción |
|---------------|-------------|
| Propósito | La actividad que se asigna al sorteado ("¿Quién facilita?", "¿Quién trae la torta?") |
| Presencia | Solo participan quienes estén en línea, o todos los miembros |
| Días de exclusión | Cuántos días descansa alguien después de ser sorteado |
| Cuándo cumplir | Mismo día, día siguiente, o fecha personalizada |
| Modo de juego | Ruleta, Cartas, Tragamonedas, Bomba o Aleatorio |
| Música de fondo | Circo, 8-bit, GameShow, Hype o sin música |

### 📅 Convocatoria
El admin crea eventos con una o varias fechas. Los participantes indican si van a asistir o no a cada fecha.

---

## Modos de juego (sorteo)

| Modo | Descripción |
|------|-------------|
| 🎰 Ruleta | Ruleta animada con canvas |
| 🃏 Cartas | Mazo con barajeo animado y flip del ganador |
| 🎰 Tragamonedas | Carrete animado que detiene en el ganador |
| 💣 Bomba | Cuenta regresiva que explota revelando al seleccionado |
| 🎲 Aleatorio | Elige un modo distinto en cada sorteo |

---

## Stack tecnológico

| Tecnología | Uso |
|------------|-----|
| HTML / CSS / JS vanilla | App principal (`index.html`) |
| React + TypeScript + Vite | App en migración gradual (`src/`) |
| Firebase Realtime Database | Sincronización en tiempo real entre participantes |
| Firebase Auth (Google) | Autenticación de administradores |
| Cloudflare Pages | Hosting estático |
| Web Audio API | Música y efectos de sonido (sin archivos externos) |

---

## Estructura del proyecto

```
squadly/
├── index.html          ← App principal vanilla JS (fuente de verdad)
├── app.html            ← Entry point React
├── styles.css          ← Referencia de estilos extraídos (solo lectura)
├── app.js              ← Referencia del JS extraído (solo lectura)
├── deploy.sh           ← Deploy a Cloudflare Pages
├── vite.config.ts
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

> **Importante:** El archivo que siempre se edita es `index.html`.
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

---

## Desarrollo local

### App principal (index.html)

1. Instalar la extensión **Live Server** en VS Code (`ritwickdey.LiveServer`)
2. Click derecho en `index.html` → **"Open with Live Server"**
3. Abre `http://localhost:8080` — se recarga al guardar

### App React (src/)

```bash
npm run dev        # http://localhost:5173
npm run typecheck  # verificar tipos TypeScript
```

---

## Deploy

```bash
# Git Bash / Mac / Linux
bash deploy.sh

# PowerShell (manual)
npm run build
Copy-Item index.html dist\index.html
Copy-Item styles.css dist\styles.css
wrangler pages deploy dist --project-name=squadly --commit-dirty=true
```

El script compila React, copia la app vanilla y sube todo a Cloudflare Pages.
La primera vez solicita login con `wrangler login`.

---

## Arquitectura Firebase

```
roomsMeta/{roomId}           ← Info de sala (nombre, tipo, propósito, pin)
rooms/{ownerUid}/{roomId}    ← Config completa (legacy, se sigue leyendo)
members/{roomId}/{memberId}  ← Participantes de la sala
history/{roomId}/{entryId}   ← Historial de sorteos
presence/{roomId}/{memberId} ← Estado online en tiempo real
roulette/{roomId}            ← Estado del sorteo en curso (sincronizado entre clientes)
memberLinks/{uid}/{roomId}   ← Vincula cuenta Google con un memberId
events/{roomId}/{eventId}    ← Eventos de salas de convocatoria
```
