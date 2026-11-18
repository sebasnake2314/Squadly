#!/bin/bash
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="squadly"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Squadly — Deploy a Cloudflare Pages"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cd "$DIR"

# 0. Solo se publica código commiteado y pusheado: lo que está en producción tiene que estar en GitHub.
#    Emergencia: SKIP_GIT_CHECK=1 ./deploy.sh
if [ "${SKIP_GIT_CHECK:-}" != "1" ]; then
  echo "🔎 Verificando git..."
  # Archivos sin commitear (los no trackeados solo importan dentro de src/ y public/, que se publican)
  PENDING="$(git status --porcelain --untracked-files=no; git status --porcelain -- src public | grep '^??' || true)"
  if [ -n "$PENDING" ]; then
    echo "❌ Hay cambios sin commitear:"
    echo "$PENDING"
    echo "   Hacé commit y push antes de desplegar."
    exit 1
  fi
  git fetch -q origin
  if ! git rev-parse -q --verify '@{u}' > /dev/null; then
    echo "❌ La rama $(git branch --show-current) no tiene rama remota. Hacé push antes de desplegar."
    exit 1
  fi
  if [ "$(git rev-parse HEAD)" != "$(git rev-parse '@{u}')" ]; then
    echo "❌ Tu rama no coincide con $(git rev-parse --abbrev-ref '@{u}'): $(git rev-list --count '@{u}..HEAD') commit(s) sin push, $(git rev-list --count 'HEAD..@{u}') sin traer."
    echo "   Hacé push (o pull) antes de desplegar."
    exit 1
  fi
  echo "   ✓ $(git rev-parse --short HEAD) commiteado y pusheado"
fi

# 1. Build React app
echo "📦 Construyendo app React..."
npm run build

# 2. Copiar app original (vanilla JS) y assets al dist/
echo "📋 Copiando app original y assets..."
cp "$DIR/index.html"        "$DIR/dist/index.html"
cp "$DIR/styles.css"        "$DIR/dist/styles.css"
cp "$DIR/guide.html"        "$DIR/dist/guide.html"
cp "$DIR/firebase-config.js" "$DIR/dist/firebase-config.js"
cp "$DIR/_headers"           "$DIR/dist/_headers"
# Copiar carpeta public/ (manifest, iconos PWA)
[ -d "$DIR/public" ] && cp -r "$DIR/public/." "$DIR/dist/"
# Copiar favicon legacy si existe en raíz
[ -f "$DIR/favicon.ico" ]  && cp "$DIR/favicon.ico"  "$DIR/dist/favicon.ico"

# Inyectar la versión de package.json en la app original (la React la toma de Vite)
VERSION="$(node -p "require('./package.json').version")"
sed -i "s/__APP_VERSION__/$VERSION/g" "$DIR/dist/index.html"
echo "🏷️  Versión $VERSION"

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
# El commit queda registrado en el panel de Cloudflare: así se sabe qué código está en cada deploy
wrangler pages deploy "$DIR/dist" \
  --project-name="$PROJECT" \
  --branch main \
  --commit-hash="$(git rev-parse HEAD)" \
  --commit-message="v$VERSION $(git log -1 --format=%s)" \
  --commit-dirty="$([ "${SKIP_GIT_CHECK:-}" = "1" ] && echo true || echo false)"

echo ""
echo "✅ Listo!"
echo "   Original:  https://squadly.pages.dev/"
echo "   React app: https://squadly.pages.dev/app.html"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
