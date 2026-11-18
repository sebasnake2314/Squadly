/*
 * Fondos animados de Squadly — compartido por index.html y guide.html (script clásico, sin build).
 * Cada persona elige su fondo (se guarda en su navegador); "aleatorio" elige uno por día
 * sin repetir el del día anterior. Quien no eligió ("Automático") ve el fondo que el admin
 * configuró para la sala (setRoomDefault) o, fuera de una sala, Estrellas fugaces.
 * Uso: SquadlyBg.render() pinta el fondo en #stars, SquadlyBg.openPicker(boton) abre el selector.
 */
(function () {
  const OPTIONS = [
    { id: 'fugaces',   icon: '🌠', name: 'Estrellas fugaces' },
    { id: 'grilla',    icon: '🕹️', name: 'Grilla retro' },
    { id: 'formas',    icon: '🔷', name: 'Formas flotantes' },
    { id: 'degradado', icon: '🎨', name: 'Degradado' },
    { id: 'bokeh',     icon: '🫧', name: 'Bokeh' },
    { id: 'ondas',     icon: '🌊', name: 'Ondas' },
    { id: 'panal',     icon: '🐝', name: 'Panal' },
    { id: 'ruleta',    icon: '🎡', name: 'Ruleta gigante' },
    { id: 'neon',      icon: '💡', name: 'Neón' },
    { id: 'nieve',     icon: '❄️', name: 'Nieve' },
  ];
  const RANDOM = { id: 'aleatorio', icon: '🎲', name: 'Aleatorio', desc: 'Uno distinto cada día' };
  const AUTO = { id: 'auto', icon: '🏠', name: 'Automático' };
  const DEFAULT = 'fugaces';
  let roomDefault = null; // fondo configurado por el admin de la sala actual
  const KEY = 'sq_bg', KEY_DAY = 'sq_bg_day', KEY_LAST = 'sq_bg_last';
  const COLORS = ['#FF6B6B', '#FF9E4F', '#FFD93D', '#6BCB77', '#4D96FF', '#C77DFF', '#FF6BB5', '#4DFFEF']; // RAINBOW de la ruleta
  const rnd = (a, b) => a + Math.random() * (b - a);

  // localStorage puede fallar (modo privado, iframe de Teams con storage bloqueado)
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    remove(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  const isBg = id => OPTIONS.some(o => o.id === id);
  const isChoice = v => v === RANDOM.id || isBg(v);
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  /** Elección propia guardada (un fondo o 'aleatorio'), o null si está en Automático */
  function getChoice() {
    const v = store.get(KEY);
    return isChoice(v) ? v : null;
  }

  /** Lo que aplica: la elección propia; si no hay, el fondo de la sala; si no hay, el por defecto */
  function effectiveChoice() {
    return getChoice() || (isChoice(roomDefault) ? roomDefault : DEFAULT);
  }

  /** Fondo a mostrar hoy: si lo que aplica es aleatorio, uno por día distinto al del día anterior */
  function resolve() {
    const choice = effectiveChoice();
    if (choice !== RANDOM.id) return choice;
    const [day, id] = (store.get(KEY_DAY) || '').split('|');
    if (day === today() && isBg(id)) return id;
    const last = store.get(KEY_LAST);
    const pool = OPTIONS.filter(o => o.id !== last);
    const picked = pool[Math.floor(Math.random() * pool.length)].id;
    store.set(KEY_DAY, today() + '|' + picked);
    store.set(KEY_LAST, picked);
    return picked;
  }

  const CSS = `
#stars{position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;overflow:hidden;}
.star{position:absolute;background:#fff;border-radius:50%;animation:twinkle linear infinite;}
@keyframes twinkle{0%,100%{opacity:.1}50%{opacity:.8}}
.bg-shoot{position:absolute;width:110px;height:1.5px;background:linear-gradient(90deg,rgba(255,255,255,.9),transparent);border-radius:2px;opacity:0;transform:rotate(-25deg);animation:bgShoot 7s linear infinite;}
@keyframes bgShoot{0%{opacity:0;transform:rotate(-25deg) translateX(0)}2%{opacity:1}10%,100%{opacity:0;transform:rotate(-25deg) translateX(-380px)}}
.bg-grid-glow{position:absolute;left:0;right:0;top:52%;height:40%;background:radial-gradient(ellipse 60% 50% at 50% 0%,rgba(108,99,255,.35),transparent 70%);}
.bg-grid-floor{position:absolute;left:-50%;right:-50%;top:55%;height:90%;transform:perspective(300px) rotateX(70deg);transform-origin:50% 0;
  background-image:linear-gradient(rgba(108,99,255,.35) 1px,transparent 1px),linear-gradient(90deg,rgba(108,99,255,.35) 1px,transparent 1px);background-size:60px 60px;
  animation:bgFloor 3s linear infinite;-webkit-mask-image:linear-gradient(transparent,#000 30%);mask-image:linear-gradient(transparent,#000 30%);}
@keyframes bgFloor{to{background-position:0 60px}}
.bg-shape{position:absolute;bottom:-40px;opacity:.22;animation:bgRise linear infinite;}
@keyframes bgRise{to{transform:translateY(-115vh) rotate(360deg)}}
.bg-mesh{position:absolute;inset:0;background:
  radial-gradient(ellipse 70% 50% at 15% 0%,rgba(108,99,255,.22),transparent 60%),
  radial-gradient(ellipse 60% 50% at 100% 30%,rgba(192,38,211,.12),transparent 60%),
  radial-gradient(ellipse 80% 60% at 50% 110%,rgba(14,165,233,.10),transparent 60%);}
.bg-mesh::after{content:"";position:absolute;inset:0;opacity:.05;background-image:radial-gradient(#fff 1px,transparent 1px);background-size:22px 22px;}
.bg-bokeh{position:absolute;border-radius:50%;filter:blur(3px);animation:bgFloat ease-in-out infinite alternate;}
@keyframes bgFloat{to{transform:translate(var(--dx),var(--dy))}}
.bg-wave{position:absolute;left:0;right:0;bottom:0;background-repeat:repeat-x;background-position:0 100%;animation:bgWave linear infinite;}
@keyframes bgWave{to{background-position-x:800px}}
.bg-hex{position:absolute;width:52px;height:60px;clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);background:rgba(108,99,255,.05);}
.bg-hex.on{animation:bgCell ease-in-out infinite;}
@keyframes bgCell{0%,100%{background:rgba(108,99,255,.05)}50%{background:rgba(167,139,250,.2)}}
.bg-wheel{position:absolute;width:760px;height:760px;right:-380px;bottom:-380px;border-radius:50%;opacity:.07;animation:bgTurn 120s linear infinite;
  background:radial-gradient(circle,#fff 0 60px,transparent 62px),repeating-conic-gradient(rgba(255,255,255,.9) 0 .4deg,transparent .4deg 45deg),
  conic-gradient(#FF6B6B 0 45deg,#FF9E4F 0 90deg,#FFD93D 0 135deg,#6BCB77 0 180deg,#4D96FF 0 225deg,#C77DFF 0 270deg,#FF6BB5 0 315deg,#4DFFEF 0 360deg);}
@keyframes bgTurn{to{transform:rotate(360deg)}}
.bg-neon{position:absolute;fill:none;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;opacity:.55;animation:bgFlick infinite;}
@keyframes bgFlick{0%,40%,44%,46%,100%{opacity:.55}42%,45%{opacity:.12}}
.bg-flake{position:absolute;top:-12px;border-radius:50%;background:#fff;animation:bgFall linear infinite;}
@keyframes bgFall{0%{transform:translate(0,0)}25%{transform:translate(12px,27vh)}50%{transform:translate(-8px,54vh)}75%{transform:translate(10px,81vh)}100%{transform:translate(0,110vh)}}
@media (prefers-reduced-motion: reduce){ #stars *{animation:none !important} .bg-shoot{display:none} }

.bg-picker{position:fixed;z-index:1000;width:384px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow-y:auto;background:#1e1e2e;border:1px solid rgba(120,120,200,.3);border-radius:12px;padding:8px;box-shadow:0 12px 32px rgba(0,0,0,.5);font-family:inherit;}
.bg-picker-title{font-size:11px;font-weight:700;letter-spacing:.8px;color:#64748b;text-transform:uppercase;padding:4px 8px 8px;}
.bg-grid{display:grid;grid-template-columns:1fr 1fr;gap:2px;}
.bg-opt{display:flex;align-items:center;gap:8px;width:100%;padding:7px 8px;background:transparent;border:1px solid transparent;border-radius:8px;color:#e2e8f0;font-family:inherit;font-size:13px;font-weight:500;text-align:left;cursor:pointer;}
.bg-opt:hover{background:#252538;}
.bg-opt.active{border-color:#6c63ff;background:rgba(108,99,255,.12);}
.bg-opt-icon{font-size:16px;width:20px;text-align:center;}
.bg-opt-text{flex:1;display:flex;flex-direction:column;}
.bg-opt-desc{font-size:11px;color:#94a3b8;}
.bg-opt-check{color:#a78bfa;font-size:13px;visibility:hidden;}
.bg-opt.active .bg-opt-check{visibility:visible;}
.bg-sep{height:1px;background:rgba(120,120,200,.15);margin:6px 4px;}
@media (max-width:380px){ .bg-grid{grid-template-columns:1fr;} }
`;
  function ensureCss() {
    if (document.getElementById('sq-bg-css')) return;
    const s = document.createElement('style');
    s.id = 'sq-bg-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  const BUILDERS = {
    fugaces(c) {
      for (let i = 0; i < 70; i++) {
        const s = document.createElement('div'), sz = Math.random() * 2 + .5;
        s.className = 'star';
        s.style.cssText = `width:${sz}px;height:${sz}px;left:${Math.random() * 100}%;top:${Math.random() * 100}%;animation-duration:${2 + Math.random() * 4}s;animation-delay:${Math.random() * 4}s;`;
        c.appendChild(s);
      }
      [['12%', '70%', 1, 7], ['30%', '90%', 4.2, 7], ['5%', '45%', 6, 9]].forEach(([top, left, delay, dur]) => {
        const s = document.createElement('i');
        s.className = 'bg-shoot';
        s.style.cssText = `top:${top};left:${left};animation-delay:${delay}s;animation-duration:${dur}s;`;
        c.appendChild(s);
      });
    },
    grilla(c) {
      c.innerHTML = '<div class="bg-grid-glow"></div><div class="bg-grid-floor"></div>';
    },
    formas(c) {
      for (let i = 0; i < 26; i++) {
        const el = document.createElement('i'), sz = 8 + Math.random() * 14, col = COLORS[i % COLORS.length], kind = i % 3;
        el.className = 'bg-shape';
        let css = `left:${Math.random() * 100}%;animation-duration:${18 + Math.random() * 22}s;animation-delay:${-Math.random() * 40}s;`;
        if (kind === 0) css += `width:${sz}px;height:${sz}px;border-radius:50%;background:${col};`;
        if (kind === 1) css += `width:${sz}px;height:${sz}px;border-radius:3px;background:${col};`;
        if (kind === 2) css += `width:0;height:0;border-left:${sz / 2}px solid transparent;border-right:${sz / 2}px solid transparent;border-bottom:${sz}px solid ${col};`;
        el.style.cssText = css;
        c.appendChild(el);
      }
    },
    degradado(c) {
      c.innerHTML = '<div class="bg-mesh"></div>';
    },
    bokeh(c) {
      const tones = ['108,99,255', '192,38,211', '14,165,233', '255,217,61', '167,139,250'];
      for (let i = 0; i < 16; i++) {
        const e = document.createElement('i'), sz = rnd(40, 150), t = tones[i % tones.length];
        e.className = 'bg-bokeh';
        e.style.cssText = `width:${sz}px;height:${sz}px;left:${rnd(-5, 95)}%;top:${rnd(-5, 95)}%;background:radial-gradient(circle,rgba(${t},${rnd(.18, .35)}),rgba(${t},0) 70%);--dx:${rnd(-60, 60)}px;--dy:${rnd(-50, 50)}px;animation-duration:${rnd(9, 18)}s;animation-delay:${-rnd(0, 18)}s;`;
        c.appendChild(e);
      }
    },
    ondas(c) {
      // Ola periódica de 800px de ancho: al desplazar el fondo 800px el ciclo no salta
      const wave = (h, a, col) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='800' height='${h}' viewBox='0 0 800 ${h}'><path d='M0 ${a} Q100 0 200 ${a} T400 ${a} T600 ${a} T800 ${a} V${h} H0Z' fill='${col}'/></svg>`)}")`;
      [[150, 30, 'rgba(108,99,255,.08)', 26], [120, 24, 'rgba(192,38,211,.06)', 18], [90, 18, 'rgba(14,165,233,.06)', 12]].forEach(([h, a, col, sec]) => {
        const d = document.createElement('div');
        d.className = 'bg-wave';
        d.style.cssText = `height:${h}px;background-image:${wave(h, a, col)};background-size:800px ${h}px;animation-duration:${sec}s;`;
        c.appendChild(d);
      });
    },
    panal(c) {
      // Cubre la pantalla completa (no solo la ventana actual) para no dejar huecos al agrandarla
      const w = Math.max(innerWidth, screen.width || 0) + 60, h = Math.max(innerHeight, screen.height || 0) + 60, cw = 54, ch = 47;
      const frag = document.createDocumentFragment();
      for (let r = 0; r * ch < h; r++) for (let q = 0; q * cw < w; q++) {
        const b = document.createElement('b');
        b.className = 'bg-hex';
        b.style.left = (q * cw + (r % 2 ? cw / 2 : 0) - 20) + 'px';
        b.style.top = (r * ch - 20) + 'px';
        if (Math.random() < .12) { b.classList.add('on'); b.style.animationDuration = rnd(3, 7) + 's'; b.style.animationDelay = -rnd(0, 7) + 's'; }
        frag.appendChild(b);
      }
      c.appendChild(frag);
    },
    ruleta(c) {
      c.innerHTML = '<div class="bg-wheel"></div>';
    },
    neon(c) {
      const shapes = [
        ['left:4%;top:18%;width:150px', '#ff4fd8', '0 0 150 80', '<path d="M10 40 Q30 5 50 40 T90 40 T130 40"/>', '6s', '0s'],
        ['right:5%;top:40%;width:130px', '#4dffef', '0 0 130 130', '<circle cx="65" cy="65" r="45"/><circle cx="65" cy="65" r="22"/>', '8s', '2s'],
        ['left:12%;bottom:8%;width:120px', '#a78bfa', '0 0 120 110', '<path d="M60 10 L110 100 L10 100 Z"/>', '7s', '4s'],
        ['right:14%;bottom:10%;width:90px', '#FFD93D', '0 0 90 90', '<path d="M45 8 L56 34 L84 36 L62 54 L70 82 L45 66 L20 82 L28 54 L6 36 L34 34 Z"/>', '9s', '1s'],
      ];
      c.innerHTML = shapes.map(([pos, col, vb, body, dur, delay]) =>
        `<svg class="bg-neon" viewBox="${vb}" style="${pos};stroke:${col};filter:drop-shadow(0 0 6px ${col});animation-duration:${dur};animation-delay:${delay}">${body}</svg>`).join('');
    },
    nieve(c) {
      for (let i = 0; i < 70; i++) {
        const e = document.createElement('i'), sz = rnd(2, 5);
        e.className = 'bg-flake';
        e.style.cssText = `width:${sz}px;height:${sz}px;left:${rnd(0, 100)}%;opacity:${rnd(.35, .85)};animation-duration:${rnd(9, 18)}s;animation-delay:${-rnd(0, 18)}s;`;
        c.appendChild(e);
      }
    },
  };

  /** Pinta el fondo en #stars. Si ya está pintado el mismo, no lo regenera (no reinicia animaciones). */
  function render(force) {
    const c = document.getElementById('stars');
    if (!c) return;
    ensureCss();
    const id = resolve();
    if (!force && c.dataset.bg === id) return;
    c.innerHTML = '';
    c.dataset.bg = id;
    BUILDERS[id](c);
  }

  /** Guarda la elección propia; AUTO la borra para volver a seguir el fondo de la sala */
  function set(choice) {
    if (choice === AUTO.id) store.remove(KEY);
    else store.set(KEY, choice);
    if (choice === RANDOM.id) store.set(KEY_DAY, ''); // elegir de nuevo al activar aleatorio
    render(true);
  }

  /** Fondo que configuró el admin de la sala actual (null fuera de una sala). Solo afecta a quien está en Automático. */
  function setRoomDefault(id) {
    roomDefault = isChoice(id) ? id : null;
    render();
  }

  // ---- Selector ----
  let picker = null;
  function closePicker() {
    if (!picker) return;
    picker.remove();
    picker = null;
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
  }
  function onOutside(e) { if (picker && !picker.contains(e.target) && !e.target.closest('[data-bg-trigger]')) closePicker(); }
  function onKey(e) { if (e.key === 'Escape') closePicker(); }

  function openPicker(anchor) {
    if (picker) { closePicker(); return; }
    ensureCss();
    const choice = getChoice() || AUTO.id, todayBg = OPTIONS.find(o => o.id === resolve());
    const nameOf = id => (id === RANDOM.id ? RANDOM : OPTIONS.find(o => o.id === id)).name;
    const autoDesc = isChoice(roomDefault)
      ? `Fondo de la sala: ${nameOf(roomDefault)}${roomDefault === RANDOM.id && choice === AUTO.id ? ` (hoy: ${todayBg.name})` : ''}`
      : `Por defecto: ${nameOf(DEFAULT)}`;
    const row = (o, desc) => `<button type="button" class="bg-opt${choice === o.id ? ' active' : ''}" data-bg="${o.id}">
      <span class="bg-opt-icon">${o.icon}</span>
      <span class="bg-opt-text">${o.name}${desc ? `<span class="bg-opt-desc">${desc}</span>` : ''}</span>
      <span class="bg-opt-check">✓</span></button>`;
    picker = document.createElement('div');
    picker.className = 'bg-picker';
    picker.setAttribute('role', 'dialog');
    picker.setAttribute('aria-label', 'Elegir fondo');
    picker.innerHTML = '<div class="bg-picker-title">Fondo</div>'
      + row(AUTO, autoDesc)
      + '<div class="bg-sep"></div>'
      + '<div class="bg-grid">' + OPTIONS.map(o => row(o)).join('') + '</div>'
      + '<div class="bg-sep"></div>'
      + row(RANDOM, choice === RANDOM.id ? `Hoy: ${todayBg.name}` : RANDOM.desc);
    picker.addEventListener('click', e => {
      const b = e.target.closest('.bg-opt');
      if (!b) return;
      set(b.dataset.bg);
      closePicker();
    });
    document.body.appendChild(picker);
    const r = anchor.getBoundingClientRect(), w = picker.offsetWidth;
    picker.style.top = Math.min(r.bottom + 6, innerHeight - picker.offsetHeight - 8) + 'px';
    picker.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px';
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
  }

  window.SquadlyBg = { render, set, setRoomDefault, getChoice, resolve, openPicker, closePicker, OPTIONS, RANDOM };
})();
