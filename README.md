# Squadly — Guía de desarrollo con VS Code

## Estructura del proyecto
```
squadly-dev/
├── index.html        ← app completa (HTML + CSS + JS integrados)
├── styles.css        ← referencia de estilos extraídos (solo lectura)
├── app.js            ← referencia del JS extraído (solo lectura)
├── deploy.sh         ← sube a Cloudflare Pages
├── README.md         ← esta guía
└── .vscode/
    ├── settings.json ← configuración del editor
    └── extensions.json ← extensiones recomendadas
```

> **Importante:** El archivo que editás siempre es `index.html`.
> `styles.css` y `app.js` son solo referencias para navegar el código más fácil.

---

## Setup inicial (una sola vez)

### 1. Instalar Node.js
→ https://nodejs.org (versión LTS)

### 2. Abrir el proyecto en VS Code
```
File → Open Folder → seleccioná la carpeta squadly-dev
```

### 3. Instalar extensiones recomendadas
VS Code te va a sugerir instalarlas automáticamente.
La más importante: **Live Server** (ritwickdey.LiveServer)

### 4. Permisos de scripts (Mac/Linux solamente)
```bash
chmod +x deploy.sh
```

---

## Desarrollo local

### Iniciar servidor con live-reload
1. Click derecho en `index.html`
2. **"Open with Live Server"**
3. Se abre `http://localhost:8080` en el browser
4. Cada vez que guardás `index.html` con `Ctrl+S` → el browser se recarga solo

---

## Aplicar cambios de Claude

Claude te va a dar cambios en este formato:

```
BUSCAR:
[texto exacto]
REEMPLAZAR:
[texto nuevo]
```

### Cómo aplicarlos en VS Code:
1. `Ctrl+H` → abre Find & Replace
2. Activá **"Match Case"** (botón `Aa`) ← importante
3. Pegá el texto en **Search**
4. Pegá el texto en **Replace**
5. Click **Replace** (no Replace All, para no reemplazar de más)
6. `Ctrl+S` para guardar

### Tips para encontrar código rápido:
- `Ctrl+F` → buscar texto en el archivo
- `Ctrl+G` → ir a línea específica
- `Ctrl+Shift+F` → buscar en todos los archivos

---

## Deploy a Cloudflare Pages

### Desde la terminal integrada de VS Code:
`Terminal → New Terminal`

```bash
./deploy.sh
```

La primera vez te pide login en Cloudflare (abre el browser).
Las siguientes veces es automático.

**URL de producción:** https://squadly.pages.dev

---

## Tecnologías del proyecto

| Tecnología | Uso |
|---|---|
| HTML/CSS/JS vanilla | Frontend completo |
| Firebase Realtime DB | Sincronización en tiempo real |
| Firebase Auth (Google) | Login de admins |
| Cloudflare Pages | Hosting estático |
| Web Audio API | Música y sonidos (sin archivos externos) |

---

## Firebase config
El proyecto usa `daily-roulette-15d78`.
Las credenciales están dentro de `index.html` en la sección `firebaseConfig`.
