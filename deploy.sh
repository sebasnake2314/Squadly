#!/bin/bash
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="squadly"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Squadly — Deploy a Cloudflare Pages"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. Build React app
echo "📦 Construyendo app React..."
cd "$DIR"
npm run build

# 2. Copiar app original (vanilla JS) y assets al dist/
echo "📋 Copiando app original y assets..."
cp "$DIR/index.html"  "$DIR/dist/index.html"
cp "$DIR/styles.css"  "$DIR/dist/styles.css"
# Copiar carpeta public/ (manifest, iconos PWA)
[ -d "$DIR/public" ] && cp -r "$DIR/public/." "$DIR/dist/"
# Copiar favicon legacy si existe en raíz
[ -f "$DIR/favicon.ico" ]  && cp "$DIR/favicon.ico"  "$DIR/dist/favicon.ico"

# 3. Instalar wrangler si falta
if ! command -v wrangler &> /dev/null; then
  echo "📦 Instalando Wrangler..."
  npm install -g wrangler
fi

echo "🔐 Verificando login..."
if ! wrangler whoami &> /dev/null; then
  wrangler login
fi

# 4. Deploy desde dist/
echo "📤 Subiendo a Cloudflare Pages..."
wrangler pages deploy "$DIR/dist" \
  --project-name="$PROJECT" \
  --commit-dirty=true

echo ""
echo "✅ Listo!"
echo "   Original:  https://squadly.pages.dev/"
echo "   React app: https://squadly.pages.dev/app.html"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
