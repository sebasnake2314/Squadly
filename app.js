import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, push, onValue, update, remove, off, onDisconnect } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut as fbSignOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCudwvc-kFnsCRPwC7pwnRKGfcfnT-pNqk",
  authDomain: "daily-roulette-15d78.firebaseapp.com",
  databaseURL: "https://daily-roulette-15d78-default-rtdb.firebaseio.com",
  projectId: "daily-roulette-15d78",
  storageBucket: "daily-roulette-15d78.firebasestorage.app",
  messagingSenderId: "674155355819",
  appId: "1:674155355819:web:91c48e19b2d85366b0e1ee"
};
const fbApp = initializeApp(firebaseConfig);
const db = getDatabase(fbApp);
const auth = getAuth(fbApp);
const provider = new GoogleAuthProvider();

// ===== STATE =====
let currentUser = null;       // Firebase Auth user
let rooms = [];
let currentRoomId = null, currentRoomData = null;
let state = { members:[], history:[], presence:{} };
let currentWinner = null;
let _listeners = [];
let myMemberId = null;        // ID del miembro en la sala (sesión local)
let isRoomAdmin = false;      // si el user logueado es dueño de la sala
let pinVisible = false;
let regRoomId = null, regRoomData = null, regAvatarData = null, selectedMemberId = null;
let popoverRoomId = null;

// ===== SYNC =====
function setSyncStatus(s){
  const bar=document.getElementById('syncBar'), lbl=document.getElementById('syncStatus');
  bar.className='sync-bar '+(s==='syncing'||s==='live'?s:'');
  if(s==='live'){lbl.className='sync-status live';lbl.textContent='● En vivo';}
  else if(s==='syncing'){lbl.className='sync-status';lbl.textContent='Sincronizando...';}
  else{lbl.className='sync-status error';lbl.textContent='✕ Sin conexión';}
}

// ===== AUTH =====
onAuthStateChanged(auth, user => {
  currentUser = user;
  createStars();

  const p = new URLSearchParams(location.search);
  const roomId = p.get('room');
  const isJoin = p.has('join');

  // Pendientes post-login
  const pendingRoom = localStorage.getItem('dr_pending_room');
  const pendingJoinRoom = localStorage.getItem('dr_pending_join_room');

  if(!user) {
    if(isJoin && roomId) showRegisterView(roomId);
    else showAuthPage();
    return;
  }

  // Usuario logueado con Google
  if(pendingJoinRoom){
    localStorage.removeItem('dr_pending_join_room');
    routeToProfileChoice(pendingJoinRoom);
    return;
  }
  if(pendingRoom){
    localStorage.removeItem('dr_pending_room');
    showAppView(pendingRoom);
    return;
  }
  if(isJoin && roomId){
    routeJoinWithGoogle(user, roomId);
    return;
  }
  if(roomId && !isJoin){
    showAppView(roomId);
    return;
  }
  showLobbyView();
});

// Ruta para unirse a sala con Google
function routeJoinWithGoogle(user, roomId){
  const localSession = localStorage.getItem('dr_session_'+roomId);
  if(localSession){
    // Sesión local — entrar directo
    myMemberId = localSession;
    onValue(ref(db,'roomsMeta/'+roomId), snap=>{
      currentRoomData = snap.val()||null;
      showAppView(roomId);
    },{onlyOnce:true});
    return;
  }
  // Verificar memberLink
  onValue(ref(db,'memberLinks/'+user.uid+'/'+roomId), snap=>{
    const linked = snap.val();
    if(linked){
      myMemberId = linked;
      localStorage.setItem('dr_session_'+roomId, linked);
      onValue(ref(db,'roomsMeta/'+roomId), snap2=>{
        currentRoomData = snap2.val()||null;
        showAppView(roomId);
      },{onlyOnce:true});
    } else {
      // Sin sesión ni vínculo — mostrar modal de elección
      routeToProfileChoice(roomId);
    }
  },{onlyOnce:true});
}

// Mostrar modal de elección de perfil cargando roomsMeta
function routeToProfileChoice(roomId){
  onValue(ref(db,'roomsMeta/'+roomId), snap=>{
    const rd = snap.val();
    if(rd){
      regRoomId = roomId;
      regRoomData = rd;
      _profileChoiceRoomId = roomId;
      _profileChoiceRoomData = rd;
      hideAll();
      createStars();
      openProfileChoiceModal(roomId, rd);
    } else {
      // Sala no encontrada — ir a registro normal
      showRegisterView(roomId);
    }
  },{onlyOnce:true});
}

function showAuthPage(){
  hideAll(); document.getElementById('authPage').style.display='block';
  setSyncStatus('live');
}

async function signInWithGoogle(asParticipant){
  if(asParticipant && regRoomId){
    // Entrar como participante — guardar roomId para mostrar modal de elección
    localStorage.setItem('dr_pending_join_room', regRoomId);
  } else if(regRoomId){
    // Entrar como admin
    localStorage.setItem('dr_pending_room', regRoomId);
  }
  try { await signInWithPopup(auth, provider); }
  catch(e){ showToast('Error al iniciar sesión: '+e.message); }
}
window.signInWithGoogle = signInWithGoogle;

async function signOut(){
  if(currentRoomId && myMemberId) setPresence(currentRoomId, myMemberId, false);
  await fbSignOut(auth);
  window.location.href = getBaseUrl();
}
window.signOut = signOut;

function hideAll(){
  ['authPage','lobbyView','appView','registerView'].forEach(id=>document.getElementById(id).style.display='none');
}

// ===== URL =====
function getBaseUrl(){const u=new URL(location.href);u.search='';u.hash='';return u.toString().replace(/\/+$/,'');}
function getInviteUrl(roomId){return getBaseUrl()+'?room='+roomId+'&join=1';}

// ===== PRESENCE =====
function setPresence(roomId, memberId, online){
  if(!memberId||!roomId) return;
  const presRef=ref(db,'presence/'+roomId+'/'+memberId);
  if(online){
    set(presRef, {online:true, ts:Date.now()});
    // Firebase escribe esto automáticamente al desconectarse (cierre de tab, pérdida de red, etc.)
    onDisconnect(presRef).set({online:false, ts:Date.now()});
    startHeartbeat(roomId, memberId);
  } else {
    onDisconnect(presRef).cancel();
    stopHeartbeat();
    set(presRef, {online:false, ts:Date.now()});
  }
}
// Heartbeat: actualizar timestamp cada 30s para confirmar que el cliente sigue activo
let _heartbeatInterval = null;
function startHeartbeat(roomId, memberId){
  stopHeartbeat();
  _heartbeatInterval = setInterval(()=>{
    if(roomId && memberId){
      set(ref(db,'presence/'+roomId+'/'+memberId), {online:true, ts:Date.now()});
    }
  }, 30000);
}
function stopHeartbeat(){
  if(_heartbeatInterval){ clearInterval(_heartbeatInterval); _heartbeatInterval=null; }
}

function isMemberOnline(memberId){
  const p=state.presence[memberId];
  if(!p) return false;
  if(p.online===false) return false;
  // Considerar offline si el timestamp tiene más de 90 segundos sin actualizar
  // (fallback por si onDisconnect tarda)
  if(p.ts && (Date.now()-p.ts) > 90000) return false;
  return true;
}

// ===== LOBBY =====
function showLobbyView(){
  hideAll(); document.getElementById('lobbyView').style.display='block';
  document.getElementById('lobbyDate').textContent=new Date().toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  if(currentUser){
    document.getElementById('userName').textContent=currentUser.displayName||currentUser.email;
    const av=document.getElementById('userAvatar');
    if(currentUser.photoURL) av.src=currentUser.photoURL; else av.style.display='none';
  }
  listenRooms();
  loadParticipantRooms();
}

function listenRooms(){
  setSyncStatus('syncing');
  if(!currentUser) return;
  onValue(ref(db,'rooms/'+currentUser.uid), snap=>{
    const data=snap.val();
    rooms=data?Object.entries(data).map(([k,v])=>({...v,fbKey:k})):[];
    setSyncStatus('live'); renderLobby();
  }, err=>setSyncStatus('error'));
}

function renderLobby(){
  const grid=document.getElementById('roomsGrid');
  grid.innerHTML=rooms.map(r=>`
    <div class="room-card" onclick="enterRoom('${r.fbKey}')">
      <div class="rc-actions">
        <button class="rc-invite-btn" title="Invitar" onclick="event.stopPropagation();openInvitePopover('${r.fbKey}','${r.name}')">🔗</button>
        <button class="rc-btn" title="Eliminar" onclick="event.stopPropagation();askDeleteRoom('${r.fbKey}','${r.name}')">×</button>
      </div>
      <div class="rc-icon">${r.icon||'🎰'}</div>
      <div class="rc-name">${r.name}</div>
      <div class="rc-meta">
        <span class="rc-admin-badge">${r.type==='convocatoria'?'📅 Convocatoria':'🎰 Sorteo'}</span>
        <span style="font-size:10px;color:var(--accent2);font-weight:600;padding:2px 6px;background:rgba(108,99,255,.15);border-radius:8px;">Admin</span>
      </div>
      ${r.purpose?`<div style="font-size:11px;color:var(--text2);margin-top:5px;line-height:1.4;">${r.purpose}</div>`:''}
    </div>`).join('')+`
    <div class="new-room-card" onclick="openCreateRoom()">
      <span style="font-size:28px">＋</span><span>Nueva sala</span>
    </div>`;
}

// ===== INVITE POPOVER (lobby) =====
function openInvitePopover(roomId, roomName){
  popoverRoomId=roomId;
  document.getElementById('ipRoomName').textContent='Invitar a '+roomName;
  const url=getInviteUrl(roomId);
  document.getElementById('ipUrl').textContent=url;
  const ipQrIn=document.getElementById('ipQrUrlInput'); if(ipQrIn) ipQrIn.value=url;
  document.getElementById('invitePopover').classList.add('show');
  // Reset tabs
  document.querySelectorAll('.iptab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.iptab-content').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.iptab')[0].classList.add('active');
  document.getElementById('iptab-url').classList.add('active');
}
window.openInvitePopover=openInvitePopover;
function closeInvitePopover(){document.getElementById('invitePopover').classList.remove('show');}
window.closeInvitePopover=closeInvitePopover;
function closeInvitePopoverOutside(e){if(e.target===document.getElementById('invitePopover'))closeInvitePopover();}
window.closeInvitePopoverOutside=closeInvitePopoverOutside;
function switchIpTab(tab,el){
  document.querySelectorAll('.iptab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.iptab-content').forEach(t=>t.classList.remove('active'));
  el.classList.add('active'); document.getElementById('iptab-'+tab).classList.add('active');
  if(tab==='qr') generateQROnCanvas(document.getElementById('ipQrCanvas'), getInviteUrl(popoverRoomId));
}
window.switchIpTab=switchIpTab;
function copyIpUrl(){
  const url=getInviteUrl(popoverRoomId);
  if(navigator.clipboard) navigator.clipboard.writeText(url).then(()=>showToast('🔗 Link copiado'));
  else{ const inp=document.getElementById('ipQrUrlInput'); if(inp){inp.select();document.execCommand('copy');showToast('🔗 Link copiado');} else prompt('Copia este link:',url); }
}
window.copyIpUrl=copyIpUrl;
async function shareInvite(){
  const url=getInviteUrl(popoverRoomId);
  const name=document.getElementById('ipRoomName').textContent.replace('Invitar a ','');
  if(navigator.share){ try{ await navigator.share({title:'TurnUp · '+name, text:'Unite a la sala en Squadly 👥', url}); }catch(e){} }
  else{ if(navigator.clipboard) navigator.clipboard.writeText(url).then(()=>showToast('🔗 Link copiado al portapapeles')); else prompt('Copia este link:',url); }
}
window.shareInvite=shareInvite;
async function shareAppInvite(){
  const url=getInviteUrl(currentRoomId);
  const name=currentRoomData?.name||'Squadly';
  if(navigator.share){ try{ await navigator.share({title:'TurnUp · '+name, text:'Unite a la sala en Squadly 👥', url}); }catch(e){} }
  else{ if(navigator.clipboard) navigator.clipboard.writeText(url).then(()=>showToast('🔗 Link copiado al portapapeles')); else prompt('Copia este link:',url); }
}
window.shareAppInvite=shareAppInvite;
function downloadIpQR(){
  const c=document.getElementById('ipQrCanvas');if(!c)return;
  const a=document.createElement('a');a.download='turnup-qr.png';a.href=c.toDataURL();a.click();
}
window.downloadIpQR=downloadIpQR;

// ===== CREATE ROOM =====
const ROOM_EMOJIS=['🎰','🚀','🎯','🧑‍💻','⚡','🌟','🔥','💡','🎲','🏆','🦊','🐉','🌈','🎸','🤖'];
let selectedEmoji='🎰';
let selectedRoomType='sorteo';
let selectedRequireOnline=true; // default: only online members

function selectRequireOnline(val, el){
  selectedRequireOnline=val;
  document.querySelectorAll('#req-online-yes,#req-online-no').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  const hint=document.getElementById('reqOnlineHint');
  if(hint) hint.textContent=val?'Solo participan quienes estén conectados al momento del sorteo':'Todos los miembros participan, estén o no en línea';
}
window.selectRequireOnline=selectRequireOnline;

function selectRoomType(type, el){
  selectedRoomType = type;
  document.querySelectorAll('.room-type-card').forEach(c=>c.classList.remove('sel'));
  el.classList.add('sel');
  document.querySelectorAll('.room-form-section').forEach(s=>s.classList.remove('active'));
  document.getElementById('form-'+type).classList.add('active');
}
window.selectRoomType = selectRoomType;

function generatePin(){return String(Math.floor(1000+Math.random()*9000));}
function generateRoomCode(){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing chars
  let code='';
  for(let i=0;i<6;i++) code+=chars[Math.floor(Math.random()*chars.length)];
  return code;
}
let selectedDueMode='today';
function selectDueMode(mode,el){
  selectedDueMode=mode;
  document.querySelectorAll('.due-opt').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  const picker=document.getElementById('roomDueCustomDate');
  if(mode==='custom'){
    // Mínimo: mañana
    const minDate=new Date(); minDate.setDate(minDate.getDate()+1);
    picker.min=minDate.toISOString().slice(0,10);
    // Default: pasado mañana
    if(!picker.value || picker.value<=today()){
      const def=new Date(); def.setDate(def.getDate()+2);
      picker.value=def.toISOString().slice(0,10);
    }
    picker.style.display='block';
  } else {
    picker.style.display='none';
  }
}
window.selectDueMode=selectDueMode;

function openCreateRoom(){
  selectedEmoji='🎰';
  selectedDueMode='today';
  selectedRoomType='sorteo';
  document.getElementById('emojiGrid').innerHTML=ROOM_EMOJIS.map(e=>`<div class="emoji-opt${e===selectedEmoji?' sel':''}" onclick="selectEmoji('${e}',this)">${e}</div>`).join('');
  document.getElementById('roomNameInput').value='';
  document.getElementById('roomPurposeInput').value='';
  document.getElementById('roomConvDescInput').value='';
  document.getElementById('roomMinInput').value='2';
  document.getElementById('roomFreeDaysInput').value='2';
  document.getElementById('roomDueCustomDate').value='';
  document.getElementById('roomDueCustomDate').style.display='none';
  // Reset type
  document.querySelectorAll('.room-type-card').forEach(c=>c.classList.remove('sel'));
  document.getElementById('rtype-sorteo').classList.add('sel');
  document.querySelectorAll('.room-form-section').forEach(s=>s.classList.remove('active'));
  document.getElementById('form-sorteo').classList.add('active');
  // Reset due buttons
  document.querySelectorAll('.due-opt').forEach(b=>b.classList.remove('active'));
  document.getElementById('due-today').classList.add('active');
  selectedGameMode='ruleta'; selectedMusicType='none';
  resetGameModeSelectors('ruleta','none','createGameModeGrid','createMusicGrid');
  selectedRequireOnline=true;
  document.querySelectorAll('#req-online-yes,#req-online-no').forEach(b=>b.classList.remove('active'));
  document.getElementById('req-online-yes')?.classList.add('active');
  document.getElementById('reqOnlineHint').textContent='Solo participan quienes estén conectados al momento del sorteo';
  document.getElementById('createRoomOverlay').classList.add('show');
}
window.openCreateRoom=openCreateRoom;
function selectEmoji(e,el){selectedEmoji=e;document.querySelectorAll('.emoji-opt').forEach(x=>x.classList.remove('sel'));el.classList.add('sel');}
window.selectEmoji=selectEmoji;
function closeCreateRoom(){document.getElementById('createRoomOverlay').classList.remove('show');}
window.closeCreateRoom=closeCreateRoom;
function closeCreateRoomOutside(e){if(e.target===document.getElementById('createRoomOverlay'))closeCreateRoom();}
window.closeCreateRoomOutside=closeCreateRoomOutside;
async function createRoom(){
  if(!currentUser){showToast('Debes iniciar sesión para crear salas');return;}
  const name=document.getElementById('roomNameInput').value.trim();
  if(!name){showToast('Ingresa un nombre para la sala');return;}
  const roomType=selectedRoomType||'sorteo';
  const pin=generatePin();
  const c_roomCode=generateRoomCode();
  const requireOnline = selectedRequireOnline !== false; // default true

  if(roomType==='convocatoria'){
    const convDesc=document.getElementById('roomConvDescInput').value.trim();
    setSyncStatus('syncing');
    const convCode2=generateRoomCode();
    const r=await push(ref(db,'rooms/'+currentUser.uid),{name,type:'convocatoria',purpose:convDesc||null,icon:selectedEmoji,pin,roomCode:convCode2,createdAt:Date.now(),ownerUid:currentUser.uid});
    await set(ref(db,'roomsMeta/'+r.key),{name,type:'convocatoria',purpose:convDesc||null,icon:selectedEmoji,pin,roomCode:convCode2,ownerUid:currentUser.uid});
    await set(ref(db,'roomsIndex/'+r.key),currentUser.uid);
    await set(ref(db,'roomCodeIndex/'+convCode2), r.key);
    setSyncStatus('live'); closeCreateRoom();
    showToast('✓ Convocatoria "'+name+'" creada · PIN: '+pin);
    enterRoom(r.key);
    return;
  }

  const purpose=document.getElementById('roomPurposeInput').value.trim();
  const minParticipants=Math.max(2,parseInt(document.getElementById('roomMinInput').value)||2);
  const freeDaysRaw=document.getElementById('roomFreeDaysInput').value; const freeDays=freeDaysRaw===''?2:Math.max(0,parseInt(freeDaysRaw)||0);
  const dueMode=selectedDueMode||'today';
  const dueCustomDate=dueMode==='custom'?document.getElementById('roomDueCustomDate').value:null;
  const dueDays=dueMode==='tomorrow'?1:0;
  if(!purpose){showToast('Ingresa el propósito del sorteo');return;}
  if(dueMode==='custom'&&!dueCustomDate){showToast('Selecciona una fecha del calendario');return;}
  if(dueMode==='custom'&&dueCustomDate<=today()){showToast('La fecha debe ser posterior a hoy');return;}
  setSyncStatus('syncing');
  const r=await push(ref(db,'rooms/'+currentUser.uid),{name,type:'sorteo',purpose,icon:selectedEmoji,pin,roomCode:generateRoomCode(),minParticipants,freeDays,dueMode,dueDays,dueCustomDate:dueCustomDate||null,requireOnline,createdAt:Date.now(),ownerUid:currentUser.uid});
  await set(ref(db,'roomsMeta/'+r.key),{name,type:'sorteo',purpose,icon:selectedEmoji,pin,roomCode:c_roomCode,minParticipants,freeDays,dueMode,dueDays,dueCustomDate:dueCustomDate||null,requireOnline,gameMode:selectedGameMode||'ruleta',musicType:selectedMusicType||'none',ownerUid:currentUser.uid});
  await set(ref(db,'roomsIndex/'+r.key),currentUser.uid);
  await set(ref(db,'roomCodeIndex/'+c_roomCode), r.key);
  setSyncStatus('live'); closeCreateRoom();
  showToast('✓ Sala "'+name+'" creada · PIN: '+pin);
  enterRoom(r.key);
}
window.createRoom=createRoom;

// ===== DELETE ROOM =====
let pendingDeleteKey=null;
function askDeleteRoom(fbKey,name){pendingDeleteKey=fbKey;document.getElementById('confirmDeleteMsg').textContent=`¿Eliminar la sala "${name}"? Se borrarán todos los integrantes e historial. No se puede deshacer.`;document.getElementById('confirmDeleteOverlay').classList.add('show');}
window.askDeleteRoom=askDeleteRoom;
function cancelDeleteRoom(){document.getElementById('confirmDeleteOverlay').classList.remove('show');pendingDeleteKey=null;}
window.cancelDeleteRoom=cancelDeleteRoom;
async function confirmDeleteRoom(){
  if(!pendingDeleteKey||!currentUser) return;
  setSyncStatus('syncing');
  await remove(ref(db,'rooms/'+currentUser.uid+'/'+pendingDeleteKey));
  await remove(ref(db,'members/'+pendingDeleteKey));
  await remove(ref(db,'history/'+pendingDeleteKey));
  await remove(ref(db,'presence/'+pendingDeleteKey));
  await remove(ref(db,'roomsMeta/'+pendingDeleteKey));
  await remove(ref(db,'roomsIndex/'+pendingDeleteKey));
  await remove(ref(db,'events/'+pendingDeleteKey));
  await remove(ref(db,'attendance/'+pendingDeleteKey));
  setSyncStatus('live'); document.getElementById('confirmDeleteOverlay').classList.remove('show'); pendingDeleteKey=null; showToast('Sala eliminada');
}
window.confirmDeleteRoom=confirmDeleteRoom;

// ===== ENTER ROOM =====
function enterRoom(roomId){
  const room=rooms.find(r=>r.fbKey===roomId);
  if(room){ currentRoomData=room; }
  showAppView(roomId);
}
window.enterRoom=enterRoom;

function showAppView(roomId){
  currentRoomId=roomId;
  hideAll(); document.getElementById('appView').style.display='block';
  document.getElementById('currentDate').textContent=new Date().toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  // Avatar se actualiza en applyRoomHeader según rol
  _listeners.forEach(({r,fn})=>off(r,'value',fn)); _listeners=[];
  state={members:[],history:[],presence:{}}; currentWinner=null;

  // Recuperar sesión de miembro (presencia)
  const savedId=localStorage.getItem('dr_session_'+roomId);
  if(savedId){
    myMemberId=savedId;
    setPresence(roomId,savedId,true);
    // Actualizar botones tras restaurar sesión (con delay para que applyRoomHeader ya corrió)
    setTimeout(updateGuestHeaderBtns, 200);
    setTimeout(updateGuestHeaderBtns, 1000); // segundo intento por si tarda más
  }

  // Cargar roomData si no viene del lobby
  if(!currentRoomData){
    if(currentUser){
      // Intentar primero como admin, luego desde roomsMeta como invitado
      onValue(ref(db,'rooms/'+currentUser.uid+'/'+roomId),snap=>{
        if(snap.val()){
          currentRoomData=snap.val();
          applyRoomHeader();
        } else {
          // No es admin de esta sala — cargar desde roomsMeta
          onValue(ref(db,'roomsMeta/'+roomId),snap2=>{
            if(snap2.val()){
              currentRoomData=snap2.val();
              applyRoomHeader();
            }
          },{onlyOnce:true});
        }
      },{onlyOnce:true});
    } else {
      // Sin Google — cargar desde roomsMeta
      onValue(ref(db,'roomsMeta/'+roomId),snap=>{
        if(snap.val()){ currentRoomData=snap.val(); applyRoomHeader(); }
      },{onlyOnce:true});
    }
  } else { applyRoomHeader(); }

  pinVisible=false; codeVisible=false;
  document.getElementById('pinDisplay').textContent='····';
  document.getElementById('pinToggleBtn').textContent='Mostrar PIN';
  document.getElementById('roomCodeDisplay').textContent='••••••';
  document.getElementById('roomCodeToggleBtn').textContent='Mostrar';

  createStars(); initRoomListeners(roomId); updateInviteUrl();
}


function updateGuestHeaderBtns(){
  if(isRoomAdmin) return;
  const grb=document.getElementById('guestRegBtn');
  const chip=document.getElementById('guestProfileChip');
  if(!myMemberId){
    if(grb) grb.style.display='inline-block';
    if(chip) chip.style.display='none';
    return;
  }
  if(grb) grb.style.display='none';
  if(chip) chip.style.display='flex';
  // Llenar chip con datos del miembro
  const m=state.members.find(m=>m.fbKey===myMemberId);
  if(m){
    const av=document.getElementById('guestChipAvatar');
    const nm=document.getElementById('guestChipName');
    if(av){
      if(m.image){ av.innerHTML=`<img src="${m.image}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`; av.style.background=''; }
      else{ av.textContent=m.emoji||'👤'; av.style.background=m.color||'#6c63ff'; }
    }
    if(nm) nm.textContent=m.name;
  }
}
function applyRoomHeader(){
  if(!currentRoomData) return;
  const _parts=currentRoomData.name.trim().split(/\s+/);
  const _nameHtml=_parts.length===1
    ? `<span style="color:var(--accent2)">${_parts[0]}</span>`
    : _parts.slice(0,-1).join(' ')+` <span style="color:var(--accent2)">${_parts[_parts.length-1]}</span>`;
  document.getElementById('appRoomIcon').textContent=currentRoomData.icon||'🎰';
  document.getElementById('appRoomName').innerHTML=_nameHtml;
  const purposeEl=document.getElementById('appRoomPurpose');
  if(purposeEl){purposeEl.textContent=currentRoomData.purpose||'';purposeEl.title=currentRoomData.purpose||'';}
  // Admin check: el dueño ve el PIN y puede eliminar miembros
  isRoomAdmin = currentUser && currentRoomData.ownerUid === currentUser.uid;
  document.getElementById('pinBox').style.display = isRoomAdmin ? 'flex' : 'none';
  if(isRoomAdmin) document.getElementById('pinDisplay').textContent='····';
  document.getElementById('adminTeamActions').style.display = isRoomAdmin ? 'flex' : 'none';
  document.getElementById('configBtn').style.display = isRoomAdmin ? 'inline-block' : 'none';
  // Auto-register roomCode index for existing rooms (admin only)
  if(isRoomAdmin && currentRoomData.roomCode && currentRoomId){
    set(ref(db,'roomCodeIndex/'+currentRoomData.roomCode.toUpperCase()), currentRoomId).catch(()=>{});
  }
  // Show/hide tabs based on room type
  const isConv = currentRoomData.type === 'convocatoria';
  const tabRoulette = document.getElementById('tab-roulette');
  const tabConv = document.getElementById('tab-convocatoria');
  const tabHistory = document.getElementById('tab-history');
  if(tabRoulette) tabRoulette.style.display = isConv ? 'none' : '';
  if(tabConv) tabConv.style.display = isConv ? '' : 'none';
  if(tabHistory) tabHistory.style.display = isConv ? 'none' : '';
  // For convocatoria: show admin button to add events
  const addEvBtn = document.getElementById('addEventBtn');
  if(addEvBtn) addEvBtn.style.display = (isConv && isRoomAdmin) ? 'block' : 'none';
  // Switch game UI for the current room mode
  if(!isConv) setTimeout(()=>switchGameUI(currentRoomData.gameMode||'ruleta'), 100);
  // Auto-navigate to correct page
  if(isConv){
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    document.getElementById('page-convocatoria')?.classList.add('active');
    tabConv?.classList.add('active');
    setTimeout(renderConvocatoria, 300);
  }
  // Header: admin ve su avatar, invitado ve botones de registro/login
  document.getElementById('headerAdminBar').style.display = isRoomAdmin ? 'flex' : 'none';
  document.getElementById('headerGuestBar').style.display = isRoomAdmin ? 'none' : 'flex';
  // Show edit button for guests who already have a session
  updateGuestHeaderBtns();
  // Actualizar avatar admin
  if(isRoomAdmin && currentUser){
    const av=document.getElementById('appUserAvatar');
    if(currentUser.photoURL){av.src=currentUser.photoURL;av.style.display='block';}
    else av.style.display='none';
  }
  // Si es admin y no tiene usuario en la sala, ofrecer unirse
  if(isRoomAdmin && !myMemberId){
    // Pequeño delay para que carguen los miembros primero
    setTimeout(()=>openAdminJoinModal(), 800);
  }
  if(isRoomAdmin) refreshMyUserIndicator();
}


// ===== ADMIN PARTICIPATION =====
let adminRegAvatarData = null;
let adminSelectedMemberId = null;

function openAdminJoinModal(){
  // Reset state
  adminSelectedMemberId = null;
  adminRegAvatarData = null;
  adminSelectedEmoji = null;

  // Reset new user form
  const nameEl = document.getElementById('adminRegName');
  const prevEl = document.getElementById('adminRegPreview');
  const txtEl = document.getElementById('adminRegUploadTxt');
  if(nameEl) nameEl.value = '';
  if(prevEl) prevEl.innerHTML = '📷';
  if(txtEl) txtEl.textContent = 'Toca para subir tu foto';

  // Show/hide Google option
  const ajGoog = document.getElementById('ajGoogleOption');
  if(ajGoog){
    if(currentUser){
      ajGoog.style.display = 'block';
      const ajAv = document.getElementById('ajGoogleAv');
      if(ajAv && currentUser.photoURL)
        ajAv.innerHTML = `<img src="${currentUser.photoURL}" style="width:100%;height:100%;object-fit:cover;">`;
      const ajNm = document.getElementById('ajGoogleName');
      if(ajNm) ajNm.textContent = currentUser.displayName || currentUser.email;
    } else {
      ajGoog.style.display = 'none';
    }
  }

  // Show the overlay FIRST so DOM is visible
  const overlay = document.getElementById('adminJoinOverlay');
  if(!overlay){ showToast('Error: modal no encontrado'); return; }
  overlay.classList.add('show');

  // Activate existing tab
  document.querySelectorAll('#adminJoinOverlay .ajt').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('#adminJoinOverlay .aj-page').forEach(p=>p.classList.remove('active'));
  const firstTab = document.querySelector('#adminJoinOverlay .ajt');
  if(firstTab) firstTab.classList.add('active');
  const existingPage = document.getElementById('aj-existing');
  if(existingPage) existingPage.classList.add('active');

  // Render members and emoji picker after overlay is visible
  renderAdminMemberList();
  onPhotoRemoved('admin');
  setTimeout(()=>buildEmojiPicker('adminEmojiGrid'), 150);
}
window.openAdminJoinModal = openAdminJoinModal;

function renderAdminMemberList(){
  const list = document.getElementById('adminMemberSelectList');
  if(!list) return;
  // Show all members except the one already linked to admin
  const available = state.members.filter(m => m.fbKey !== myMemberId);
  if(!available.length){
    list.innerHTML = '<p style="font-size:12px;color:var(--text3);text-align:center;padding:12px 0;">No hay otros integrantes en la sala</p>';
    return;
  }
  list.innerHTML = available.map(m => {
    const av = m.image
      ? `<div class="msi-av"><img src="${m.image}" alt="${m.name}"></div>`
      : `<div class="msi-av" style="background:${m.color||'#6c63ff'}">${m.emoji||'👤'}</div>`;
    return `<div class="member-select-item" id="ajm-${m.fbKey}" onclick="selectAdminMember('${m.fbKey}')">
      ${av}<div class="msi-name">${m.name}</div>
      <div class="msi-check" id="ajm-check-${m.fbKey}">✓</div>
    </div>`;
  }).join('');
}

function selectAdminMember(fbKey){
  adminSelectedMemberId = fbKey;
  document.querySelectorAll('.member-select-item').forEach(el => el.classList.remove('sel'));
  document.getElementById('ajm-' + fbKey)?.classList.add('sel');
}
window.selectAdminMember = selectAdminMember;

function switchAjTab(tab, el){
  document.querySelectorAll('.ajt').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.aj-page').forEach(p => p.classList.remove('active'));
  if(el) el.classList.add('active');
  document.getElementById('aj-' + tab).classList.add('active');
  if(tab === 'existing') renderAdminMemberList();
}
window.switchAjTab = switchAjTab;

function previewAdminAvatar(e){
  const f = e.target.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = ev => {
    adminRegAvatarData = ev.target.result;
    document.getElementById('adminRegPreview').innerHTML = `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    document.getElementById('adminRegUploadTxt').textContent = 'Foto seleccionada ✓'; onPhotoLoaded('admin');
  };
  r.readAsDataURL(f);
}
window.previewAdminAvatar = previewAdminAvatar;

async function adminSelectExisting(){
  if(!adminSelectedMemberId){ showToast('Selecciona tu usuario'); return; }
  localStorage.setItem('dr_session_' + currentRoomId, adminSelectedMemberId);
  myMemberId = adminSelectedMemberId;
  setPresence(currentRoomId, adminSelectedMemberId, true);
  document.getElementById('adminJoinOverlay').classList.remove('show');
  refreshMyUserIndicator();
  showToast('✓ Ahora participás en el sorteo');
}
window.adminSelectExisting = adminSelectExisting;

async function adminRegisterNew(){
  const name = document.getElementById('adminRegName').value.trim();
  if(!name){ showToast('Ingresa tu nombre'); return; }
  const dup = state.members.find(m => m.name.trim().toLowerCase() === name.toLowerCase());
  if(dup){ showToast(`⚠ Ya existe "${dup.name}" en esta sala`); return; }
  const COLORS=['#6c63ff','#f59e0b','#10b981','#ef4444','#a78bfa','#06b6d4','#f97316','#ec4899'];
  const idx = state.members.length;
  const finalAdminEmoji = adminSelectedEmoji || null;
  const key = await fbAdd('members/'+currentRoomId, {id:Date.now(),name,emoji:finalAdminEmoji,color:COLORS[idx%COLORS.length],image:adminRegAvatarData||null});
  localStorage.setItem('dr_session_'+currentRoomId, key);
  myMemberId = key;
  setPresence(currentRoomId, key, true);
  document.getElementById('adminJoinOverlay').classList.remove('show');
  refreshMyUserIndicator();
  showToast(`✓ ${name} agregado. Participás en el sorteo.`);
  launchConfetti();
}
window.adminRegisterNew = adminRegisterNew;

function skipAdminJoin(){
  document.getElementById('adminJoinOverlay').classList.remove('show');
  showToast('Modo gestión — no participás en el sorteo');
}
window.skipAdminJoin = skipAdminJoin;

function leaveParticipation(){
  if(myMemberId && currentRoomId) setPresence(currentRoomId, myMemberId, false);
  myMemberId = null;
  localStorage.removeItem('dr_session_' + currentRoomId);
  refreshMyUserIndicator();
  showToast('Saliste del sorteo. Puedes volver a unirte desde Equipo.');
}
window.leaveParticipation = leaveParticipation;

function refreshMyUserIndicator(){
  const indicator = document.getElementById('myUserIndicator');
  if(!indicator) return;
  // Actualizar chip en header para todos
  if(isRoomAdmin){
    // Admin: actualizar chip del header
    const chip=document.getElementById('adminProfileChip');
    if(myMemberId){
      const m = state.members.find(m => m.fbKey === myMemberId);
      if(m && chip){
        chip.style.display='flex';
        const chAv=document.getElementById('adminChipAvatar');
        const chNm=document.getElementById('adminChipName');
        if(chAv){
          if(m.image){ chAv.innerHTML=`<img src="${m.image}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`; chAv.style.background=''; }
          else{ chAv.textContent=m.emoji||'👤'; chAv.style.background=m.color||'#6c63ff'; }
        }
        if(chNm) chNm.textContent=m.name;
      }
    } else if(chip) chip.style.display='none';
  } else {
    updateGuestHeaderBtns();
  }
  // Mostrar banner "Participando como" para TODOS (admin e invitados)
  if(myMemberId){
    const m = state.members.find(m => m.fbKey === myMemberId);
    if(m){
      indicator.classList.add('show');
      const av = document.getElementById('myUserAv');
      av.innerHTML = m.image ? `<img src="${m.image}" alt="${m.name}">` : (m.emoji||'👤');
      if(!m.image) av.style.background = m.color||'#6c63ff';
      else av.style.background = '';
      document.getElementById('myUserName').textContent = `Participando como: ${m.name}`;
      return;
    }
  }
  indicator.classList.remove('show');
}


function openGuestRegister(){
  // Abrir panel de registro directo sin salir de la sala
  // Usar el modal de admin join que ya existe
  openAdminJoinModal();
}
window.openGuestRegister = openGuestRegister;

// ===== ROOM CONFIG =====
let cfgDueMode = 'today';

function openRoomConfig(){
  if(!currentRoomData) return;
  const isConv = currentRoomData.type === 'convocatoria';
  // Adapt modal to room type
  document.getElementById('cfgPurposeLabel').textContent = isConv ? 'Nombre / descripción' : 'Propósito del sorteo';
  document.getElementById('cfgModalSub').textContent = isConv ? 'Configurá los datos de la convocatoria' : 'Los cambios aplican al próximo sorteo';
  document.getElementById('cfgSorteoSection1').style.display = isConv ? 'none' : '';
  document.getElementById('cfgSorteoSection2').style.display = isConv ? 'none' : '';
  // Pre-fill current values
  document.getElementById('cfgPurpose').value = currentRoomData.purpose || '';
  document.getElementById('cfgMin').value = currentRoomData.minParticipants || 2;
  document.getElementById('cfgFreeDays').value = currentRoomData.freeDays ?? 2;
  // Pre-fill requireOnline
  const _curOnline = currentRoomData.requireOnline !== false;
  _cfgOnline = _curOnline; // sincronizar variable de guardado con el valor actual de la sala
  // Prefill game mode & music
  cfgGameMode = currentRoomData.gameMode||'ruleta';
  cfgMusicType = currentRoomData.musicType||'none';
  resetGameModeSelectors(cfgGameMode, cfgMusicType, 'cfgGameModeGrid', 'cfgMusicGrid');
  document.querySelectorAll('#cfg-online-yes,#cfg-online-no').forEach(b=>b.classList.remove('active'));
  document.getElementById(_curOnline?'cfg-online-yes':'cfg-online-no')?.classList.add('active');
  const cfgOnlineHint=document.getElementById('cfgOnlineHint');
  if(cfgOnlineHint) cfgOnlineHint.textContent=_curOnline?'Solo participan quienes estén conectados':'Todos los miembros participan, estén o no en línea';

  // Due mode
  cfgDueMode = currentRoomData.dueMode || 'today';
  document.querySelectorAll('[id^="cfg-due-"]').forEach(b=>b.classList.remove('active'));
  document.getElementById('cfg-due-'+cfgDueMode)?.classList.add('active');

  const picker = document.getElementById('cfgDueCustomDate');
  if(cfgDueMode === 'custom'){
    picker.style.display = 'block';
    picker.value = currentRoomData.dueCustomDate || '';
  } else {
    picker.style.display = 'none';
  }

  // Show current value summary
  updateCfgDueSummary();
  document.getElementById('roomConfigOverlay').classList.add('show');
}
window.openRoomConfig = openRoomConfig;

function updateCfgDueSummary(){
  const el = document.getElementById('cfgDueCurrent');
  if(!el) return;
  const mode = cfgDueMode;
  if(mode==='today') el.textContent = 'Actual: la tarea se cumple el mismo día del sorteo';
  else if(mode==='tomorrow') el.textContent = 'Actual: la tarea se cumple al día siguiente';
  else {
    const d = document.getElementById('cfgDueCustomDate').value;
    el.textContent = d ? `Actual: la tarea se cumple el ${fmtDate(d)}` : 'Selecciona una fecha';
  }
}

function selectCfgDue(mode, el){
  cfgDueMode = mode;
  document.querySelectorAll('[id^="cfg-due-"]').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  const picker = document.getElementById('cfgDueCustomDate');
  if(mode === 'custom'){
    const minDate = new Date(); minDate.setDate(minDate.getDate()+1);
    picker.min = minDate.toISOString().slice(0,10);
    if(!picker.value || picker.value <= today()){
      const def = new Date(); def.setDate(def.getDate()+2);
      picker.value = def.toISOString().slice(0,10);
    }
    picker.style.display = 'block';
  } else {
    picker.style.display = 'none';
  }
  updateCfgDueSummary();
}
window.selectCfgDue = selectCfgDue;

let _cfgOnline = true;
function selectCfgOnline(val, el){
  _cfgOnline = val;
  document.querySelectorAll('#cfg-online-yes,#cfg-online-no').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  const h=document.getElementById('cfgOnlineHint');
  if(h) h.textContent=val?'Solo participan quienes estén conectados':'Todos los miembros participan, estén o no en línea';
}
window.selectCfgOnline=selectCfgOnline;

async function saveRoomConfig(){
  if(!currentUser || !currentRoomId || !currentRoomData) return;
  const purpose = document.getElementById('cfgPurpose').value.trim();
  if(!purpose){ showToast('Ingresa el propósito del sorteo'); return; }
  const minParticipants = Math.max(2, parseInt(document.getElementById('cfgMin').value)||2);
  const freeDaysVal = document.getElementById('cfgFreeDays').value;
  const freeDays = freeDaysVal===''?2:Math.max(0,parseInt(freeDaysVal)||0);
  const dueMode = cfgDueMode;
  const dueCustomDate = dueMode==='custom' ? document.getElementById('cfgDueCustomDate').value : null;
  if(dueMode==='custom' && !dueCustomDate){ showToast('Selecciona una fecha'); return; }
  if(dueMode==='custom' && dueCustomDate <= today()){ showToast('La fecha debe ser posterior a hoy'); return; }
  const dueDays = dueMode==='tomorrow' ? 1 : 0;

  setSyncStatus('syncing');
  const requireOnline = _cfgOnline !== false;
  const updates = {purpose, minParticipants, freeDays, dueMode, dueDays, dueCustomDate: dueCustomDate||null, requireOnline, gameMode: cfgGameMode||'ruleta', musicType: cfgMusicType||'none'};
  // Update in rooms/{uid}/{roomId}
  await update(ref(db,'rooms/'+currentUser.uid+'/'+currentRoomId), updates);
  // Update in roomsMeta/{roomId}
  await update(ref(db,'roomsMeta/'+currentRoomId), updates);
  // Update local state immediately
  currentRoomData = {...currentRoomData, ...updates};
  // Clear random mode cache so new mode resolves fresh
  localStorage.removeItem('sq_gm_'+currentRoomId+'_'+today());
  localStorage.removeItem('sq_mu_'+currentRoomId+'_'+today());
  setSyncStatus('live');
  closeRoomConfig();
  // Apply all UI changes immediately
  const purposeEl = document.getElementById('appRoomPurpose');
  if(purposeEl){ purposeEl.textContent = purpose; purposeEl.title = purpose; }
  applyRoomHeader();
  _manualParticipants = null;
  refreshLockState();
  renderMemberStatus();
  renderTeam();
  // Switch to new game UI
  const newGm = getRoomGameMode();
  const elig = getEligible();
  setTimeout(()=>{
    switchGameUI(newGm);
    if(newGm==='slots') renderSlotsReels(elig);
    else if(newGm==='cartas') initCardsPile(elig);
    else if(newGm==='ruleta'||newGm==='bomba') drawWheel(currentAngle);
  }, 100);
  showToast('✓ Configuración guardada');
}
window.saveRoomConfig = saveRoomConfig;

function closeRoomConfig(){
  document.getElementById('roomConfigOverlay').classList.remove('show');
}
window.closeRoomConfig = closeRoomConfig;
function closeRoomConfigOutside(e){
  if(e.target===document.getElementById('roomConfigOverlay')) closeRoomConfig();
}
window.closeRoomConfigOutside = closeRoomConfigOutside;

// ===== EDIT PROFILE =====
let editAvatarData = 'keep'; // 'keep' = no change, null = remove, string = new data

function openEditProfile(){
  if(!myMemberId){
    showToast('Primero selecciona o registrá tu usuario');
    openGuestRegister();
    return;
  }
  const m = state.members.find(m => m.fbKey === myMemberId);
  if(!m){ showToast('No se encontró tu usuario en esta sala'); return; }
  // Pre-fill
  document.getElementById('editProfileName').value = m.name;
  editAvatarData = 'keep';
  const prev = document.getElementById('editAvatarPreview');
  if(m.image){
    prev.innerHTML = `<img src="${m.image}" alt="${m.name}">`;
    document.getElementById('removePhotoBtn').style.display = 'block';
  } else {
    prev.innerHTML = m.emoji||'👤';
    prev.style.background = m.color||'#6c63ff';
    document.getElementById('removePhotoBtn').style.display = 'none';
  }
  // Init emoji section based on current photo state
  editSelectedEmoji = null;
  setTimeout(()=>{
    buildEmojiPicker('editEmojiGrid');
    if(m.image){
      onPhotoLoaded('edit');
    } else {
      onPhotoRemoved('edit');
      // Pre-select current emoji if exists
      if(m.emoji){
        selectPickerEmoji(m.emoji, 'editEmojiGrid');
        editSelectedEmoji = m.emoji;
      }
    }
  }, 100);
  document.getElementById('editProfileOverlay').classList.add('show');
}
window.openEditProfile = openEditProfile;

function previewEditAvatar(e){
  const f = e.target.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = ev => {
    editAvatarData = ev.target.result;
    editSelectedEmoji = null;
    const prev = document.getElementById('editAvatarPreview');
    prev.innerHTML = `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    prev.style.background = '';
    document.getElementById('removePhotoBtn').style.display = 'block';
    onPhotoLoaded('edit');
  };
  r.readAsDataURL(f);
}
window.previewEditAvatar = previewEditAvatar;

function removeEditAvatar(){
  editAvatarData = null;
  editSelectedEmoji = null;
  const m = state.members.find(m => m.fbKey === myMemberId);
  const prev = document.getElementById('editAvatarPreview');
  prev.innerHTML = m?.emoji||'👤';
  prev.style.background = m?.color||'#6c63ff';
  document.getElementById('removePhotoBtn').style.display = 'none';
  onPhotoRemoved('edit');
  setTimeout(()=>buildEmojiPicker('editEmojiGrid'), 100);
}
window.removeEditAvatar = removeEditAvatar;

async function saveEditProfile(){
  const name = document.getElementById('editProfileName').value.trim();
  if(!name){ showToast('Ingresa tu nombre'); return; }
  if(!myMemberId){ showToast('No hay usuario activo'); return; }
  // Check duplicate name (excluding self)
  const dup = state.members.find(m => m.fbKey !== myMemberId && m.name.trim().toLowerCase() === name.toLowerCase());
  if(dup){ showToast(`⚠ Ya existe "${dup.name}" en esta sala`); return; }
  const roomId = currentRoomId || regRoomId;
  if(!roomId){ showToast('Error: sala no encontrada'); return; }
  const updates = { name };
  if(editAvatarData === null){
    updates.image = null;
    if(editSelectedEmoji) updates.emoji = editSelectedEmoji;
  } else if(editAvatarData !== 'keep'){
    updates.image = editAvatarData;
    updates.emoji = null; // photo replaces emoji
  } else if(editSelectedEmoji){
    // No photo change, but emoji changed
    updates.emoji = editSelectedEmoji;
    updates.image = null;
  }
  setSyncStatus('syncing');
  await update(ref(db, 'members/'+roomId+'/'+myMemberId), updates);
  setSyncStatus('live');
  closeEditProfile();
  refreshMyUserIndicator();
  showToast(`✓ Perfil actualizado`);
}
window.saveEditProfile = saveEditProfile;

function closeEditProfile(){
  document.getElementById('editProfileOverlay').classList.remove('show');
  editAvatarData = 'keep';
}
window.closeEditProfile = closeEditProfile;
function closeEditProfileOutside(e){
  if(e.target === document.getElementById('editProfileOverlay')) closeEditProfile();
}
window.closeEditProfileOutside = closeEditProfileOutside;

// ===== CONVOCATORIA =====
let convState = { events: {} }; // {eventId: {title, dates[], createdAt}}
let convAttendance = {}; // {eventId: {dateKey: {memberId: 'confirmed'|'cant'}}}
let _convListeners = [];
let calCurrentDate = new Date();
let calSelectedDates = new Set();

function initConvListeners(roomId){
  _convListeners.forEach(({r,fn})=>off(r,'value',fn)); _convListeners=[];
  const evRef=ref(db,'events/'+roomId);
  const evFn=snap=>{convState.events=snap.val()||{};renderConvocatoria();};
  onValue(evRef,evFn); _convListeners.push({r:evRef,fn:evFn});
  const atRef=ref(db,'attendance/'+roomId);
  const atFn=snap=>{convAttendance=snap.val()||{};renderConvocatoria();};
  onValue(atRef,atFn); _convListeners.push({r:atRef,fn:atFn});
}

function renderConvocatoria(){
  const layout=document.getElementById('convLayout');
  if(!layout) return;
  const events=Object.entries(convState.events||{}).sort((a,b)=>(b[1].createdAt||0)-(a[1].createdAt||0));
  if(!events.length){
    layout.innerHTML=`<div class="empty-state"><div class="big">📅</div>${isRoomAdmin?'Crea la primera convocatoria con el botón de abajo.':'Esperando convocatorias del administrador.'}</div>`;
    return;
  }
  layout.innerHTML = events.map(([eid, ev])=> renderEventCard(eid, ev)).join('');
}

function renderEventCard(eid, ev){
  const dates = ev.dates||[];
  const att = convAttendance[eid]||{};
  const members = state.members;

  const datesHtml = dates.map(d=>{
    const dKey = d.replace(/-/g,'');
    const dateAtt = att[dKey]||{};
    const confirmed = members.filter(m=>dateAtt[m.fbKey]==='confirmed');
    const cant = members.filter(m=>dateAtt[m.fbKey]==='cant');
    const pending = members.filter(m=>!dateAtt[m.fbKey]);
    const myStatus = myMemberId ? (dateAtt[myMemberId]||null) : null;

    // Build attendees section — always visible for everyone
    const mkGroup = (members, color, icon, label) => members.length ? `
      <div class="conv-att-group">
        <div class="conv-att-group-label" style="color:${color}">${icon} ${label} (${members.length})</div>
        <div class="conv-att-chips">${members.map(m=>`<span class="conv-attendee-chip ${color===getComputedStyle(document.documentElement).getPropertyValue('--success').trim()||color==='var(--success)'?'yes':color==='var(--danger)'?'no':'pending'}">${memberAvChip(m)} ${m.name}</span>`).join('')}</div>
      </div>` : '';
    const grpConfirmed = confirmed.length ? `<div class="conv-att-group"><div class="conv-att-group-label" style="color:var(--success)">✓ Confirmados (${confirmed.length})</div><div class="conv-att-chips">${confirmed.map(m=>`<span class="conv-attendee-chip yes">${memberAvChip(m)} ${m.name}</span>`).join('')}</div></div>` : '';
    const grpCant = cant.length ? `<div class="conv-att-group"><div class="conv-att-group-label" style="color:var(--danger)">✗ No pueden (${cant.length})</div><div class="conv-att-chips">${cant.map(m=>`<span class="conv-attendee-chip no">${memberAvChip(m)} ${m.name}</span>`).join('')}</div></div>` : '';
    const grpPending = pending.length ? `<div class="conv-att-group"><div class="conv-att-group-label" style="color:var(--text3)">○ Sin responder (${pending.length})</div><div class="conv-att-chips">${pending.map(m=>`<span class="conv-attendee-chip pending">${memberAvChip(m)} ${m.name}</span>`).join('')}</div></div>` : '';
    const chips = `<div class="conv-attendees">${grpConfirmed}${grpCant}${grpPending}</div>`;

    const actionBtns = myMemberId ? `
      <div class="conv-action-btns">
        <button class="conv-btn confirm${myStatus==='confirmed'?' sel':''}" onclick="setAttendance('${eid}','${dKey}','confirmed')">✓ Voy</button>
        <button class="conv-btn cant${myStatus==='cant'?' sel':''}" onclick="setAttendance('${eid}','${dKey}','cant')">✗ No puedo</button>
      </div>` : `<div style="font-size:11px;color:var(--text3);">Regístrate para responder</div>`;

    const toggleBtn = ''; // Attendees always visible

    return `<div class="conv-date-row">
      <div class="conv-date-info">
        <div class="conv-date-label">${fmtDate(d)}</div>
        <div class="conv-date-sub">${d}</div>
      </div>
      <div class="conv-date-counts">
        <span class="conv-count"><span class="conv-count-dot" style="background:var(--success)"></span>${confirmed.length}</span>
        <span class="conv-count"><span class="conv-count-dot" style="background:var(--danger)"></span>${cant.length}</span>
        <span class="conv-count"><span class="conv-count-dot" style="background:var(--text3)"></span>${pending.length}</span>
        ${toggleBtn}
      </div>
      ${actionBtns}
    </div>${chips}`;
  }).join('');

  const adminBtns = isRoomAdmin ? `
    <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
      <button onclick="openEditEventModal('${eid}','${ev.title.replace(/'/g,"\'")}')" style="padding:4px 10px;background:transparent;border:1px solid var(--border2);border-radius:6px;color:var(--text2);font-size:11px;cursor:pointer;">✏ Editar</button>
      <button class="delete-event-btn" onclick="deleteEvent('${eid}')">🗑 Eliminar</button>
    </div>` : '';

  return `<div class="conv-event-card">
    <div class="conv-event-header">
      <div>
        <div class="conv-event-title" id="event-title-${eid}">${ev.title}</div>
        <div class="conv-event-meta">${dates.length} fecha${dates.length!==1?'s':''} · ${new Date(ev.createdAt).toLocaleDateString('es-AR')}</div>
      </div>
      ${adminBtns}
    </div>
    <div class="conv-dates-grid">${datesHtml}</div>
  </div>`;
}

function memberAvChip(m){
  if(m.image) return `<span class="conv-attendee-av"><img src="${m.image}" alt="${m.name}"></span>`;
  return `<span class="conv-attendee-av" style="background:${m.color||'#6c63ff'}">${m.emoji||'👤'}</span>`;
}

function toggleAttendees(key){
  const el=document.getElementById('att-'+key);
  if(el) el.classList.toggle('open');
}
window.toggleAttendees=toggleAttendees;

async function setAttendance(eid, dKey, status){
  if(!myMemberId){ showToast('Regístrate para poder responder'); return; }
  const path = 'attendance/'+currentRoomId+'/'+eid+'/'+dKey+'/'+myMemberId;
  const current = convAttendance[eid]?.[dKey]?.[myMemberId];
  // Toggle off if same status
  if(current===status){
    await fbRemove(path);
  } else {
    await fbSet(path, status);
  }
}
window.setAttendance=setAttendance;

async function deleteEvent(eid){
  if(!isRoomAdmin) return;
  await fbRemove('events/'+currentRoomId+'/'+eid);
  await fbRemove('attendance/'+currentRoomId+'/'+eid);
  showToast('Evento eliminado');
}
window.deleteEvent=deleteEvent;

// ===== CALENDAR =====
function openAddEventModal(){
  calSelectedDates = new Set();
  document.getElementById('eventTitleInput').value='';
  calCurrentDate = new Date();
  renderCalendar();
  document.getElementById('addEventOverlay').classList.add('show');
}
window.openAddEventModal=openAddEventModal;
function closeAddEvent(){ document.getElementById('addEventOverlay').classList.remove('show'); }
window.closeAddEvent=closeAddEvent;
function closeAddEventOutside(e){ if(e.target===document.getElementById('addEventOverlay')) closeAddEvent(); }
window.closeAddEventOutside=closeAddEventOutside;

function renderCalendar(){
  const yr=calCurrentDate.getFullYear(), mo=calCurrentDate.getMonth();
  const months=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  document.getElementById('calMonthLabel').textContent=`${months[mo]} ${yr}`;
  const firstDay=new Date(yr,mo,1).getDay();
  const offset=(firstDay+6)%7; // Monday=0
  const daysInMonth=new Date(yr,mo+1,0).getDate();
  const grid=document.getElementById('calGrid');
  let html='';
  for(let i=0;i<offset;i++) html+=`<div class="conv-cal-day empty"></div>`;
  for(let d=1;d<=daysInMonth;d++){
    const dateStr=`${yr}-${String(mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const sel=calSelectedDates.has(dateStr);
    html+=`<div class="conv-cal-day${sel?' sel':''}" onclick="toggleCalDay('${dateStr}',this)">${d}</div>`;
  }
  grid.innerHTML=html;
  updateSelectedPreview();
}

function toggleCalDay(dateStr, el){
  if(calSelectedDates.has(dateStr)){ calSelectedDates.delete(dateStr); el.classList.remove('sel'); }
  else{ calSelectedDates.add(dateStr); el.classList.add('sel'); }
  updateSelectedPreview();
}
window.toggleCalDay=toggleCalDay;

function updateSelectedPreview(){
  const prev=document.getElementById('selectedDatesPreview');
  if(!prev) return;
  const sorted=[...calSelectedDates].sort();
  prev.textContent=sorted.length?`${sorted.length} fecha${sorted.length!==1?'s':''} seleccionada${sorted.length!==1?'s':''}`:' ';
}

function calPrev(){ calCurrentDate.setMonth(calCurrentDate.getMonth()-1); renderCalendar(); }
function calNext(){ calCurrentDate.setMonth(calCurrentDate.getMonth()+1); renderCalendar(); }
window.calPrev=calPrev; window.calNext=calNext;

async function saveEvent(){
  const title=document.getElementById('eventTitleInput').value.trim();
  if(!title){ showToast('Ingresa un nombre para el evento'); return; }
  if(calSelectedDates.size===0){ showToast('Selecciona al menos una fecha'); return; }
  const dates=[...calSelectedDates].sort();
  await fbAdd('events/'+currentRoomId,{title,dates,createdAt:Date.now()});
  closeAddEvent();
  showToast(`✓ Evento "${title}" creado con ${dates.length} fecha${dates.length!==1?'s':''}`);
}
window.saveEvent=saveEvent;

// ===== EDIT EVENT =====
let _editingEventId = null;

function openEditEventModal(eid, currentTitle){
  _editingEventId = eid;
  document.getElementById('editEventTitle').value = currentTitle;
  document.getElementById('editEventOverlay').classList.add('show');
  setTimeout(()=>document.getElementById('editEventTitle').focus(), 100);
}
window.openEditEventModal = openEditEventModal;

function closeEditEvent(){
  document.getElementById('editEventOverlay').classList.remove('show');
  _editingEventId = null;
}
window.closeEditEvent = closeEditEvent;
function closeEditEventOutside(e){ if(e.target===document.getElementById('editEventOverlay')) closeEditEvent(); }
window.closeEditEventOutside = closeEditEventOutside;

async function saveEditEvent(){
  const title = document.getElementById('editEventTitle').value.trim();
  if(!title){ showToast('Ingresa un nombre'); return; }
  if(!_editingEventId){ return; }
  await fbUpdate('events/'+currentRoomId+'/'+_editingEventId, {title});
  closeEditEvent();
  showToast('✓ Evento actualizado');
}
window.saveEditEvent = saveEditEvent;

// ===== PARTICIPANT ROOMS (salas donde soy invitado) =====
let participantRooms = []; // [{roomId, roomData, memberId, memberData}]
let _profileChoiceRoomId = null;
let _profileChoiceRoomData = null;

async function loadParticipantRooms(){
  participantRooms = [];
  // Buscar todas las sesiones guardadas en localStorage
  const sessionKeys = Object.keys(localStorage).filter(k=>k.startsWith('dr_session_'));
  // También buscar en memberLinks/{uid} (vinculaciones Google)
  let linkedRooms = {};
  if(currentUser){
    const snap = await new Promise(res=>onValue(ref(db,'memberLinks/'+currentUser.uid), res, {onlyOnce:true}));
    linkedRooms = snap.val()||{};
  }
  // Combinar roomIds de ambas fuentes
  const roomIds = new Set([
    ...sessionKeys.map(k=>k.replace('dr_session_','')),
    ...Object.keys(linkedRooms)
  ]);
  // Filtrar los que ya son salas admin
  const adminRoomIds = new Set(rooms.map(r=>r.fbKey));
  const participantRoomIds = [...roomIds].filter(id=>!adminRoomIds.has(id));
  if(!participantRoomIds.length){
    document.getElementById('participantRoomsSection').style.display='none';
    return;
  }
  // Cargar datos de cada sala desde roomsMeta
  const promises = participantRoomIds.map(async roomId=>{
    const memberId = linkedRooms[roomId] || localStorage.getItem('dr_session_'+roomId);
    if(!memberId) return null;
    const [roomSnap, memberSnap] = await Promise.all([
      new Promise(res=>onValue(ref(db,'roomsMeta/'+roomId), res, {onlyOnce:true})),
      new Promise(res=>onValue(ref(db,'members/'+roomId+'/'+memberId), res, {onlyOnce:true}))
    ]);
    const roomData = roomSnap.val();
    const memberData = memberSnap.val();
    if(!roomData) return null; // sala eliminada — limpiar sesión
    if(!roomData && !memberData) { localStorage.removeItem('dr_session_'+roomId); return null; }
    return {roomId, roomData, memberId, memberData};
  });
  const results = (await Promise.all(promises)).filter(Boolean);
  participantRooms = results;
  renderParticipantRooms();
}

function renderParticipantRooms(){
  const section = document.getElementById('participantRoomsSection');
  const grid = document.getElementById('participantRoomsGrid');
  section.style.display='block'; // always show (has join card)
  const joinCard = `<div class="join-room-card" onclick="openJoinRoom()"><span style="font-size:28px">🔑</span><span>Unirse a una sala</span></div>`;
  if(!participantRooms.length){ grid.innerHTML=joinCard; return; }
  grid.innerHTML = participantRooms.map(({roomId, roomData, memberId, memberData})=>{
    const m = memberData;
    const av = m?.image
      ? `<div class="rc-member-av"><img src="${m.image}" alt="${m.name}"></div>`
      : `<div class="rc-member-av" style="background:${m?.color||'#6c63ff'}">${m?.emoji||'👤'}</div>`;
    const memberChip = m ? `<div class="rc-member-chip">${av}<span class="rc-member-name">Como: ${m.name}</span></div>` : '';
    return `<div class="room-card" onclick="enterParticipantRoom('${roomId}')">
      <div class="rc-actions">
        <button class="rc-leave-btn" title="Salir de esta sala" onclick="event.stopPropagation();leaveParticipantRoom('${roomId}','${roomData.name}')">×</button>
      </div>
      <div class="rc-icon">${roomData.icon||'🎰'}</div>
      <div class="rc-name">${roomData.name}</div>
      <div class="rc-meta">
        <span class="rc-participant-badge">${roomData.type==='convocatoria'?'📅 Participante':'🎲 Participante'}</span>
      </div>
      ${memberChip}
    </div>`;
  }).join('') + joinCard;
}
window.renderParticipantRooms=renderParticipantRooms;

function enterParticipantRoom(roomId){
  const pr = participantRooms.find(r=>r.roomId===roomId);
  if(!pr) return;
  currentRoomData = pr.roomData;
  myMemberId = pr.memberId;
  localStorage.setItem('dr_session_'+roomId, pr.memberId);
  showAppView(roomId);
}
window.enterParticipantRoom=enterParticipantRoom;

async function leaveParticipantRoom(roomId, roomName){
  if(!confirm(`¿Salir de la sala "${roomName}"?\n\nSerás eliminado como participante. El historial de sorteos se conserva.`)) return;
  const pr = participantRooms.find(r=>r.roomId===roomId);
  if(pr?.memberId){
    // Eliminar miembro y presencia de Firebase
    await remove(ref(db,'members/'+roomId+'/'+pr.memberId)).catch(()=>{});
    await remove(ref(db,'presence/'+roomId+'/'+pr.memberId)).catch(()=>{});
  }
  // Limpiar sesión local y vinculación Google
  localStorage.removeItem('dr_session_'+roomId);
  if(currentUser) remove(ref(db,'memberLinks/'+currentUser.uid+'/'+roomId)).catch(()=>{});
  participantRooms = participantRooms.filter(r=>r.roomId!==roomId);
  renderParticipantRooms();
  showToast('Saliste de la sala.');
}
window.leaveParticipantRoom=leaveParticipantRoom;

// ===== PROFILE CHOICE MODAL =====
function openProfileChoiceModal(roomId, roomData){
  _profileChoiceRoomId = roomId;
  _profileChoiceRoomData = roomData;
  // Fill modal info
  document.getElementById('profileChoiceRoomName').textContent = `Elige cómo quieres participar en "${roomData.name}"`;
  // Google option
  if(currentUser){
    const gAv = document.getElementById('pcGoogleAvatar');
    if(currentUser.photoURL){
      gAv.innerHTML=`<img src="${currentUser.photoURL}" style="width:100%;height:100%;object-fit:cover;">`;
      gAv.style.background='';
    }
    document.getElementById('pcGoogleName').textContent = currentUser.displayName || currentUser.email;
    document.getElementById('pcGoogleOption').style.display='flex';
  } else {
    document.getElementById('pcGoogleOption').style.display='none';
  }
  document.getElementById('profileChoiceOverlay').classList.add('show');
}
window.openProfileChoiceModal=openProfileChoiceModal;

function closeProfileChoice(){
  document.getElementById('profileChoiceOverlay').classList.remove('show');
  _profileChoiceRoomId=null; _profileChoiceRoomData=null;
}
window.closeProfileChoice=closeProfileChoice;

async function enterWithGoogle(){
  if(!currentUser||!_profileChoiceRoomId) return;
  // Guardar valores ANTES de cerrar el modal (closeProfileChoice los pone en null)
  const targetRoomId = _profileChoiceRoomId;
  const targetRoomData = _profileChoiceRoomData;
  closeProfileChoice();
  // Limpiar el ?join=1 de la URL
  const cleanUrl = window.location.pathname + '?room=' + targetRoomId;
  window.history.replaceState({}, '', cleanUrl);
  // Create or find member linked to this Google account
  const linkedSnap = await new Promise(res=>onValue(ref(db,'memberLinks/'+currentUser.uid+'/'+targetRoomId), res, {onlyOnce:true}));
  let memberId = linkedSnap.val();
  if(memberId){
    const mSnap = await new Promise(res=>onValue(ref(db,'members/'+targetRoomId+'/'+memberId), res, {onlyOnce:true}));
    if(!mSnap.val()) memberId = null;
  }
  if(!memberId){
    const snap = await new Promise(res=>onValue(ref(db,'members/'+targetRoomId), res, {onlyOnce:true}));
    const existing = snap.val()||{};
    const EMOJIS=['👩‍💻','👨‍💼','👩‍🔬','👨‍🚀','👩‍🎨','🧑‍💻','👩‍🏫','👨‍🎤','🧙','👩‍🔧'];
    const COLORS=['#6c63ff','#f59e0b','#10b981','#ef4444','#a78bfa','#06b6d4','#f97316','#ec4899'];
    const idx = Object.keys(existing).length;
    const name = currentUser.displayName || currentUser.email.split('@')[0];
    memberId = await fbAdd('members/'+targetRoomId,{
      id:Date.now(), name,
      emoji:EMOJIS[idx%EMOJIS.length], color:COLORS[idx%COLORS.length],
      image:currentUser.photoURL||null,
      googleUid:currentUser.uid
    });
    await set(ref(db,'memberLinks/'+currentUser.uid+'/'+targetRoomId), memberId);
  }
  localStorage.setItem('dr_session_'+targetRoomId, memberId);
  myMemberId = memberId;
  setPresence(targetRoomId, memberId, true);

  // Entrar directamente a la sala como invitado
  hideAll();
  currentRoomId = targetRoomId;
  currentRoomData = targetRoomData;
  isRoomAdmin = false;
  document.getElementById('appView').style.display='block';
  document.getElementById('currentDate').textContent=new Date().toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  document.getElementById('pinBox').style.display='none';
  document.getElementById('adminTeamActions').style.display='none';
  document.getElementById('headerAdminBar').style.display='none';
  document.getElementById('headerGuestBar').style.display='flex';
  // Aplicar header (NO recalcula isRoomAdmin porque currentRoomData.ownerUid != currentUser.uid)
  applyRoomHeader();
  updateGuestHeaderBtns();
  _listeners.forEach(({r,fn})=>off(r,'value',fn)); _listeners=[];
  state={members:[],history:[],presence:{}};
  createStars();
  initRoomListeners(targetRoomId);
  updateInviteUrl();
  setTimeout(refreshMyUserIndicator, 500);
  setTimeout(refreshMyUserIndicator, 1500);
  showToast('✓ Entraste con tu perfil de Google');
}
window.enterWithGoogle=enterWithGoogle;

async function enterWithGoogleFromReg(){
  if(!currentUser || !regRoomId) return;
  _profileChoiceRoomId = regRoomId;
  _profileChoiceRoomData = regRoomData;
  await enterWithGoogle();
}
window.enterWithGoogleFromReg = enterWithGoogleFromReg;

// Called when user clicks Google button WITHOUT being logged in yet
async function loginWithGoogleAsParticipant(){
  if(!regRoomId){ showToast('Error: sala no encontrada'); return; }
  // Save room context so after Google login we know where to go
  localStorage.setItem('dr_pending_join_room', regRoomId);
  try {
    await signInWithPopup(auth, provider);
    // signInWithPopup triggers onAuthStateChanged which reads dr_pending_join_room
    // and calls routeToProfileChoice → opens profileChoiceModal
  } catch(e){
    localStorage.removeItem('dr_pending_join_room');
    if(e.code !== 'auth/popup-closed-by-user'){
      showToast('Error al iniciar sesión: ' + e.message);
    }
  }
}
window.loginWithGoogleAsParticipant = loginWithGoogleAsParticipant;


function enterWithCustomProfile(){
  if(!_profileChoiceRoomId) return;
  const roomId = _profileChoiceRoomId;
  const roomData = _profileChoiceRoomData;
  closeProfileChoice();
  // Go to register view with PIN step skipped (already verified)
  regRoomId = roomId;
  regRoomData = roomData;
  regAvatarData = null;
  selectedMemberId = null;
  hideAll();
  document.getElementById('registerView').style.display='block';
  document.getElementById('pinStep').style.display='none';
  document.getElementById('regSuccess').style.display='none';
  document.getElementById('actionStep').style.display='block';
  // Show only "new user" tab
  switchRegTab('new', document.querySelectorAll('.reg-tab')[0]);
  loadMembersForSelect();
  createStars();
}
window.enterWithCustomProfile=enterWithCustomProfile;

async function enterWithExistingProfile(){
  if(!_profileChoiceRoomId) return;
  const roomId = _profileChoiceRoomId;
  const roomData = _profileChoiceRoomData;
  closeProfileChoice();
  regRoomId = roomId;
  regRoomData = roomData;
  regAvatarData = null;
  selectedMemberId = null;
  hideAll();
  document.getElementById('registerView').style.display='block';
  document.getElementById('pinStep').style.display='none';
  document.getElementById('regSuccess').style.display='none';
  document.getElementById('actionStep').style.display='block';
  // Show only "existing" tab
  switchRegTab('existing', document.querySelectorAll('.reg-tab')[1]);
  loadMembersForSelect();
  createStars();
}
window.enterWithExistingProfile=enterWithExistingProfile;

// ===== JOIN ROOM BY CODE =====
let _joinFoundRoomId = null;
let _joinFoundRoomData = null;

function openJoinRoom(){
  _joinFoundRoomId = null;
  _joinFoundRoomData = null;
  document.getElementById('joinCodeInput').value = '';
  document.getElementById('joinCodeError').style.display = 'none';
  document.getElementById('joinCodeError').textContent = '';
  document.getElementById('joinRoomPreview').style.display = 'none';
  document.getElementById('joinCodeBtn').textContent = 'Buscar sala →';
  document.getElementById('joinRoomOverlay').classList.add('show');
  setTimeout(()=>document.getElementById('joinCodeInput').focus(), 200);
}
window.openJoinRoom = openJoinRoom;

function closeJoinRoom(){
  document.getElementById('joinRoomOverlay').classList.remove('show');
}
window.closeJoinRoom = closeJoinRoom;
function closeJoinRoomOutside(e){ if(e.target===document.getElementById('joinRoomOverlay')) closeJoinRoom(); }
window.closeJoinRoomOutside = closeJoinRoomOutside;

async function lookupRoomCode(){
  const code = document.getElementById('joinCodeInput').value.trim().toUpperCase();
  const errEl = document.getElementById('joinCodeError');
  const preview = document.getElementById('joinRoomPreview');

  if(code.length < 6){ errEl.textContent='El código tiene 6 caracteres.'; errEl.style.display='block'; return; }

  // If we already found the room, proceed to PIN step
  if(_joinFoundRoomId){
    closeJoinRoom();
    showRegisterView(_joinFoundRoomId);
    return;
  }

  errEl.style.display='none';
  document.getElementById('joinCodeBtn').textContent = 'Buscando...';

  // Search via roomCodeIndex first (fast), fallback to full scan
  let foundId = null, foundData = null;
  const idxSnap = await new Promise(res=>onValue(ref(db,'roomCodeIndex/'+code), res, {onlyOnce:true}));
  if(idxSnap.val()){
    foundId = idxSnap.val();
    const rdSnap = await new Promise(res=>onValue(ref(db,'roomsMeta/'+foundId), res, {onlyOnce:true}));
    foundData = rdSnap.val();
    if(!foundData) foundId = null; // stale index
  }
  if(!foundId){
    // Fallback: full scan of roomsMeta
    try {
      const snap = await new Promise((res,rej)=>{
        const t=setTimeout(()=>rej(new Error('timeout')),8000);
        onValue(ref(db,'roomsMeta'), s=>{ clearTimeout(t); res(s); }, {onlyOnce:true});
      });
      const allRooms = snap.val()||{};
      for(const [rid, rdata] of Object.entries(allRooms)){
        if(rdata.roomCode && rdata.roomCode.toUpperCase() === code.toUpperCase()){
          foundId = rid; foundData = rdata;
          // Save to index for future lookups
          set(ref(db,'roomCodeIndex/'+code.toUpperCase()), rid).catch(()=>{});
          break;
        }
      }
    } catch(e){ console.warn('roomsMeta scan failed:', e); }
  }

  if(!foundId){
    errEl.textContent = 'No se encontró ninguna sala con ese código. Verifica con el administrador.';
    errEl.style.display = 'block';
    document.getElementById('joinCodeBtn').textContent = 'Buscar sala →';
    return;
  }

  // Check if already a participant
  const alreadySession = localStorage.getItem('dr_session_'+foundId);
  if(alreadySession){
    closeJoinRoom();
    showToast('Ya eres participante de esta sala.');
    return;
  }

  // Show preview and ask for PIN
  _joinFoundRoomId = foundId;
  _joinFoundRoomData = foundData;
  document.getElementById('joinPreviewIcon').textContent = foundData.icon||'🎰';
  document.getElementById('joinPreviewName').textContent = foundData.name;
  document.getElementById('joinPreviewType').textContent = foundData.type==='convocatoria'?'📅 Convocatoria':'🎰 Sorteo';
  preview.style.display = 'flex';
  document.getElementById('joinCodeBtn').textContent = 'Continuar con el PIN →';
}
window.lookupRoomCode = lookupRoomCode;

async function adminJoinWithGoogle(){
  if(!currentUser||!currentRoomId) return;
  // Save values before closing modal
  const targetRoomId = currentRoomId;
  const targetRoomData = currentRoomData;
  document.getElementById('adminJoinOverlay').classList.remove('show');
  // Reuse enterWithGoogle logic
  _profileChoiceRoomId = targetRoomId;
  _profileChoiceRoomData = targetRoomData;
  await enterWithGoogle();
}
window.adminJoinWithGoogle = adminJoinWithGoogle;

const PICKER_EMOJIS = ['😀', '😎', '🤩', '🥳', '🤓', '👻', '🦊', '🐼', '🐸', '🦁', '🐯', '🦄', '🤖', '👽', '🧙', '🦸', '🎃', '🧑\u200d💻', '👩\u200d🔬', '👨\u200d🚀', '🧑\u200d🎨', '🏄', '🧗', '🎯', '🎮'];
let regSelectedEmoji = null;
let adminSelectedEmoji = null;

function buildEmojiPicker(gridId, onSelect){
  const grid = document.getElementById(gridId);
  if(!grid) return;
  grid.innerHTML = PICKER_EMOJIS.map(e=>
    `<div onclick="selectPickerEmoji('${e}','${gridId}')" style="width:34px;height:34px;border-radius:8px;border:1.5px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:18px;cursor:pointer;transition:all .15s;" title="${e}">${e}</div>`
  ).join('');
}

function selectPickerEmoji(emoji, gridId){
  const grid = document.getElementById(gridId);
  if(grid) grid.querySelectorAll('div').forEach(d=>{
    d.style.borderColor = d.textContent===emoji ? 'var(--accent)' : 'var(--border)';
    d.style.background = d.textContent===emoji ? 'rgba(108,99,255,.15)' : '';
  });
  if(gridId==='regEmojiGrid') regSelectedEmoji=emoji;
  if(gridId==='adminEmojiGrid') adminSelectedEmoji=emoji;
  if(gridId==='modalEmojiGrid') modalSelectedEmoji=emoji;
  if(gridId==='editEmojiGrid'){
    editSelectedEmoji=emoji;
    // Preview emoji in avatar
    const prev=document.getElementById('editAvatarPreview');
    if(prev){ prev.innerHTML=emoji; prev.style.background='var(--surface2)'; }
  }
}
window.selectPickerEmoji = selectPickerEmoji;

// ===== PHOTO ↔ EMOJI MUTUAL EXCLUSION =====
// Called after a photo is loaded — disables emoji picker
function onPhotoLoaded(context){
  // context: 'reg' | 'admin' | 'edit'
  const emojiSection = document.getElementById(context+'EmojiSection');
  const removeWrap = document.getElementById(context+'RemovePhotoWrap');
  if(emojiSection) emojiSection.classList.add('emoji-section-disabled');
  if(removeWrap) removeWrap.style.display='block';
  // Clear any selected emoji
  if(context==='reg') regSelectedEmoji=null;
  if(context==='admin') adminSelectedEmoji=null;
  if(context==='edit') editSelectedEmoji=null;
}

// Called after photo is removed — enables emoji picker
function onPhotoRemoved(context){
  const emojiSection = document.getElementById(context+'EmojiSection');
  const removeWrap = document.getElementById(context+'RemovePhotoWrap');
  if(emojiSection) emojiSection.classList.remove('emoji-section-disabled');
  if(removeWrap) removeWrap.style.display='none';
}

// Called when emoji is selected — if photo exists, ignore
function onEmojiSelected(context){
  // If photo loaded, emoji can't be selected (section is disabled via CSS)
  // Just ensure the picker highlights correctly
}

// Remove photo — reg
function removeRegPhoto(){
  regAvatarData = null;
  document.getElementById('regPreview').innerHTML='📷';
  document.getElementById('regPreview').style.background='';
  document.getElementById('regFile').value='';
  onPhotoRemoved('reg');
}
window.removeRegPhoto = removeRegPhoto;

// Remove photo — admin
function removeAdminPhoto(){
  adminRegAvatarData = null;
  document.getElementById('adminRegPreview').innerHTML='📷';
  document.getElementById('adminRegPreview').style.background='';
  document.getElementById('adminRegFile').value='';
  onPhotoRemoved('admin');
}
window.removeAdminPhoto = removeAdminPhoto;

let editSelectedEmoji = null;

// ===== PARTICIPANT SELECTOR =====
// Stores manual override of who participates: null=auto(all eligible), Set of fbKeys
let _manualParticipants = null; // null = use automatic eligible logic

function canShowParticipantSelector(){
  if(getRoomRequireOnline()) return false;
  if(getTodayConfirmed()) return false; // locked after assignment
  if(isRoomAdmin) return true;
  const fac = getTodayFacilitator();
  if(fac && myMemberId && fac.fbKey === myMemberId) return true;
  if(!fac){
    const adminOnline = state.members.some(m => m.googleUid && isMemberOnline(m.fbKey) && currentRoomData?.ownerUid === m.googleUid);
    if(!adminOnline) return !!myMemberId;
  }
  return false;
}

function refreshParticipantSelector(){
  const sel = document.getElementById('participantSelector');
  const list = document.getElementById('participantList');
  if(!sel || !list) return;
  if(!canShowParticipantSelector()){ sel.classList.remove('show'); return; }
  sel.classList.add('show');
  // Show ALL members — admin decides manually who participates
  const allMembers = state.members;
  const eligibleBase = getEligibleBase();
  if(_manualParticipants === null){
    // Init: check all members that are eligible by default
    _manualParticipants = new Set(eligibleBase.map(m=>m.fbKey));
  }
  list.innerHTML = allMembers.map(m=>{
    const online = isMemberOnline(m.fbKey);
    const checked = _manualParticipants.has(m.fbKey) ? 'checked' : '';
    const st = getMemberStatusBase(m.id, m.fbKey);
    const isFreDay = st.startsWith('free_day');
    const isFacToday = st==='facilitating_today';
    const av = m.image
      ? `<div class="participant-row-av"><img src="${m.image}" alt="${m.name}"></div>`
      : `<div class="participant-row-av" style="background:${m.color||'#6c63ff'}">${m.emoji||'👤'}</div>`;
    const statusTxt = isFacToday ? '✓ Asignado hoy'
      : isFreDay ? '○ Día libre'
      : online ? '● En línea' : '○ Desconectado';
    const statusColor = isFacToday ? 'var(--success)'
      : isFreDay ? 'var(--warning)'
      : online ? 'var(--success)' : 'var(--text3)';
    // Disable if assigned today OR not available
    const isUnavailable = st==='unavailable_tomorrow' || st==='assigned_tomorrow';
    const disabledRow = isFacToday || isUnavailable;
    const disabled = disabledRow ? 'disabled' : '';
    return `<label class="participant-row" style="${disabledRow?'opacity:.4;cursor:default;pointer-events:none;':''}">
      <input type="checkbox" ${checked} ${disabled} onchange="toggleParticipant('${m.fbKey}',this.checked)">
      ${av}
      <span class="participant-row-name">${m.name}</span>
      <span class="participant-row-status" style="color:${statusColor}">${statusTxt}</span>
    </label>`;
  }).join('');
}
window.refreshParticipantSelector = refreshParticipantSelector;

function toggleParticipant(fbKey, checked){
  if(_manualParticipants === null) _manualParticipants = new Set();
  if(checked) _manualParticipants.add(fbKey);
  else _manualParticipants.delete(fbKey);
  drawWheel(currentAngle); // re-render wheel with updated selection
}
window.toggleParticipant = toggleParticipant;

function selectAllParticipants(){
  // Select all members except those already assigned today
  _manualParticipants = new Set(
    state.members
      .filter(m=>getMemberStatusBase(m.id,m.fbKey)!=='facilitating_today')
      .map(m=>m.fbKey)
  );
  refreshParticipantSelector();
  drawWheel(currentAngle);
}
window.selectAllParticipants = selectAllParticipants;

function selectNoneParticipants(){
  _manualParticipants = new Set();
  refreshParticipantSelector();
  drawWheel(currentAngle);
}
window.selectNoneParticipants = selectNoneParticipants;

// Base eligible = all non-excluded members (ignoring online status)
function getEligibleBase(){
  return state.members.filter(m=>{
    const st = getMemberStatusBase(m.id, m.fbKey);
    return st === 'eligible';
  });
}

// getMemberStatus ignoring online requirement
function getMemberStatusBase(id, fbKey){
  const tmrw=tomorrow(), tod=today();
  if(state.history.find(h=>h.memberId===id&&h.facilitationDate===tod&&h.type==='assigned'&&!h.reverted)) return 'facilitating_today';
  if(state.history.find(h=>h.memberId===id&&h.facilitationDate===tmrw&&h.type==='assigned'&&!h.reverted)) return 'assigned_tomorrow';
  if(state.history.find(h=>h.memberId===id&&h.facilitationDate===tmrw&&h.type==='unavailable'&&!h.reverted)) return 'unavailable_tomorrow';
  const fd=getRoomFreeDays();
  for(let i=1;i<=fd;i++){
    const dayStr=dateOffset(-i);
    if(state.history.find(h=>h.memberId===id&&h.facilitationDate===dayStr&&h.type==='assigned'&&!h.reverted))
      return 'free_day'+i;
  }
  return 'eligible';
}

// ===== GAME MODE & MUSIC =====
let selectedGameMode = 'ruleta'; // create modal
let selectedMusicType = 'none';  // create modal
let cfgGameMode = 'ruleta';      // config modal
let cfgMusicType = 'none';       // config modal

// -- Selector helpers --
function selectGameMode(mode, el, ctx){
  if(ctx==='create'){
    selectedGameMode=mode;
    document.querySelectorAll('#createGameModeGrid .game-mode-card').forEach(c=>c.classList.remove('sel'));
  } else {
    cfgGameMode=mode;
    document.querySelectorAll('#cfgGameModeGrid .game-mode-card').forEach(c=>c.classList.remove('sel'));
  }
  el.classList.add('sel');
}
window.selectGameMode=selectGameMode;

let _previewTimeout=null;
function selectMusic(music, el, ctx){
  if(ctx==='create'){
    selectedMusicType=music;
    document.querySelectorAll('#createMusicGrid .music-card').forEach(c=>c.classList.remove('sel'));
  } else {
    cfgMusicType=music;
    document.querySelectorAll('#cfgMusicGrid .music-card').forEach(c=>c.classList.remove('sel'));
  }
  el.classList.add('sel');
  // Preview music for 3 seconds
  if(_previewTimeout) clearTimeout(_previewTimeout);
  stopBgMusic();
  if(music!=='none'){
    startBgMusic(music);
    _previewTimeout=setTimeout(()=>stopBgMusic(), 3000);
  }
}
window.selectMusic=selectMusic;

// Reset selectors on open
function resetGameModeSelectors(mode, music, gridGame, gridMusic){
  document.querySelectorAll('#'+gridGame+' .game-mode-card').forEach(c=>{
    c.classList.toggle('sel', c.dataset.mode===mode);
  });
  document.querySelectorAll('#'+gridMusic+' .music-card').forEach(c=>{
    c.classList.toggle('sel', c.dataset.music===music);
  });
}

// ===== BACKGROUND MUSIC ENGINE =====
let bgMusicCtx=null, bgMusicSource=null, bgMusicGain=null, bgMusicPlaying=false;

function startBgMusic(type){
  stopBgMusic();
  if(!type||type==='none') return;
  bgMusicCtx=new(window.AudioContext||window.webkitAudioContext)();
  bgMusicGain=bgMusicCtx.createGain();
  bgMusicGain.gain.value=0.25;
  bgMusicGain.connect(bgMusicCtx.destination);
  bgMusicPlaying=true;
  const fn={circus:bgCircus,'8bit':bg8bit,gameshow:bgGameshow,hype:bgHype}[type];
  if(fn) fn();
}

function stopBgMusic(){
  bgMusicPlaying=false;
  if(bgMusicCtx){ try{bgMusicCtx.close();}catch(e){} bgMusicCtx=null; bgMusicSource=null; }
}

function bgCircus(){
  const c=bgMusicCtx, g=bgMusicGain;
  const melody=[523,659,784,1047,784,659,523,659,784,659,523,784,1047,784,659,523];
  const bass  =[130,130,196,196,130,130,196,196,130,130,196,196,130,130,196,196];
  const dur=0.22;
  const loop=()=>{
    if(!bgMusicPlaying) return;
    const t=c.currentTime;
    melody.forEach((f,i)=>{
      const o=c.createOscillator(),og=c.createGain();
      o.connect(og);og.connect(g); o.type='triangle'; o.frequency.value=f;
      const tt=t+i*dur;
      og.gain.setValueAtTime(0,tt);og.gain.linearRampToValueAtTime(0.18,tt+0.03);og.gain.exponentialRampToValueAtTime(0.001,tt+dur*0.85);
      o.start(tt);o.stop(tt+dur);
    });
    bass.forEach((f,i)=>{
      const o=c.createOscillator(),og=c.createGain();
      o.connect(og);og.connect(g); o.type='sine'; o.frequency.value=f;
      const tt=t+i*dur;
      og.gain.setValueAtTime(0.08,tt);og.gain.exponentialRampToValueAtTime(0.001,tt+dur*0.7);
      o.start(tt);o.stop(tt+dur);
    });
    const id=setTimeout(loop, melody.length*dur*1000-50);
    bgMusicSource={stop:()=>clearTimeout(id)};
  };
  loop();
}

function bg8bit(){
  const c=bgMusicCtx, g=bgMusicGain;
  const mel=[330,330,330,262,330,392,196,262,196,165,220,247,233,220,196,330,392,440,349,392,330,262,294,247];
  const dur=0.14;
  const loop=()=>{
    if(!bgMusicPlaying) return;
    const t=c.currentTime;
    mel.forEach((f,i)=>{
      const o=c.createOscillator(),og=c.createGain();
      o.connect(og);og.connect(g); o.type='square'; o.frequency.value=f;
      const tt=t+i*dur;
      og.gain.setValueAtTime(0.1,tt);og.gain.setValueAtTime(0.1,tt+dur*0.7);og.gain.setValueAtTime(0,tt+dur*0.71);
      o.start(tt);o.stop(tt+dur);
    });
    const id=setTimeout(loop, mel.length*dur*1000-50);
    bgMusicSource={stop:()=>clearTimeout(id)};
  };
  loop();
}

function bgGameshow(){
  const c=bgMusicCtx, g=bgMusicGain;
  const pat=[{f:440,d:.15},{f:0,d:.05},{f:440,d:.15},{f:0,d:.05},{f:392,d:.15},{f:0,d:.05},{f:440,d:.3},{f:0,d:.1},{f:523,d:.15},{f:0,d:.05},{f:494,d:.15},{f:0,d:.05},{f:466,d:.15},{f:0,d:.05},{f:440,d:.5},{f:0,d:.2}];
  const loop=()=>{
    if(!bgMusicPlaying) return;
    let t=c.currentTime, total=0;
    pat.forEach(({f,d})=>{
      if(f){
        const o=c.createOscillator(),og=c.createGain();
        o.connect(og);og.connect(g); o.type='triangle'; o.frequency.value=f;
        og.gain.setValueAtTime(0.15,t+total);og.gain.exponentialRampToValueAtTime(0.001,t+total+d*.85);
        o.start(t+total);o.stop(t+total+d);
        const ob=c.createOscillator(),ogb=c.createGain();
        ob.connect(ogb);ogb.connect(g); ob.type='sine'; ob.frequency.value=f/2;
        ogb.gain.setValueAtTime(0.06,t+total);ogb.gain.exponentialRampToValueAtTime(0.001,t+total+d);
        ob.start(t+total);ob.stop(t+total+d);
      }
      total+=d;
    });
    const id=setTimeout(loop, total*1000-50);
    bgMusicSource={stop:()=>clearTimeout(id)};
  };
  loop();
}

function bgHype(){
  const c=bgMusicCtx, g=bgMusicGain;
  const stabs=[392,0,0,392,0,523,0,587,659,0,587,0,523,392,0,0];
  const dur=0.1;
  const loop=()=>{
    if(!bgMusicPlaying) return;
    const t=c.currentTime;
    stabs.forEach((f,i)=>{
      if(!f) return;
      [f,f*.5].forEach(freq=>{
        const o=c.createOscillator(),og=c.createGain();
        o.connect(og);og.connect(g); o.type='sawtooth'; o.frequency.value=freq;
        const tt=t+i*dur;
        og.gain.setValueAtTime(0.1,tt);og.gain.exponentialRampToValueAtTime(0.001,tt+dur*.6);
        o.start(tt);o.stop(tt+dur);
      });
    });
    [0,4,8,12].forEach(i=>{
      const o=c.createOscillator(),og=c.createGain();
      o.connect(og);og.connect(g); o.type='sine';
      o.frequency.setValueAtTime(180,t+i*dur);o.frequency.exponentialRampToValueAtTime(40,t+i*dur+.12);
      og.gain.setValueAtTime(0.25,t+i*dur);og.gain.exponentialRampToValueAtTime(0.001,t+i*dur+.18);
      o.start(t+i*dur);o.stop(t+i*dur+.2);
    });
    const id=setTimeout(loop, stabs.length*dur*1000-40);
    bgMusicSource={stop:()=>clearTimeout(id)};
  };
  loop();
}

// ===== SPIN SOUND EFFECTS =====
let sfxCtx=null;
function getSfx(){ if(!sfxCtx) sfxCtx=new(window.AudioContext||window.webkitAudioContext)(); return sfxCtx; }
function stopSfx(){ if(sfxCtx){ try{sfxCtx.close();}catch(e){} sfxCtx=null; } }

function playWinnerFanfare(){
  stopSfx(); const c=getSfx();
  const notes=[523,659,784,1047]; 
  notes.forEach((f,i)=>{
    const o=c.createOscillator(),g=c.createGain();
    o.connect(g);g.connect(c.destination); o.type='triangle'; o.frequency.value=f;
    const t=c.currentTime+i*.12;
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.3,t+.05);g.gain.exponentialRampToValueAtTime(.001,t+.4);
    o.start(t);o.stop(t+.5);
  });
  for(let i=0;i<6;i++){
    const o=c.createOscillator(),g=c.createGain();
    o.connect(g);g.connect(c.destination); o.type='sine'; o.frequency.value=1200+Math.random()*600;
    const t=c.currentTime+.5+i*.06;
    g.gain.setValueAtTime(.08,t);g.gain.exponentialRampToValueAtTime(.001,t+.15);
    o.start(t);o.stop(t+.2);
  }
}

// ===== SWITCH GAME UI =====
function switchGameUI(mode){
  if(!mode||mode==='random') return; // will be resolved by getRoomGameMode()
  ['gameRuleta','gameCartas','gameSlots','gameBomba'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.style.display='none';
  });
  const gameId='game'+mode.charAt(0).toUpperCase()+mode.slice(1);
  const el=document.getElementById(gameId);
  if(el) el.style.display='';
  // Update spin button text per mode
  const btn=document.getElementById('spinBtn');
  if(btn){
    const labels={ruleta:'🚀 GIRAR',cartas:'🃏 REPARTIR',slots:'🎰 GIRAR',bomba:'💣 ENCENDER'};
    btn.textContent=labels[mode]||'🚀 GIRAR';
  }
  // Pre-init game UI — static placeholder only (no deal animation)
  const eligible=getEligible();
  if(mode==='slots' && eligible.length) setTimeout(()=>renderSlotsReels(eligible),50);
  if(mode==='cartas') setTimeout(()=>initCardsPile(eligible),50);
}
window.switchGameUI=switchGameUI;

// ===== GET ROOM GAME MODE & MUSIC =====

// ===== RANDOM MODE RESOLVER =====
const GAME_MODES_LIST=['ruleta','cartas','slots','bomba'];
const MUSIC_LIST=['circus','8bit','gameshow','hype'];

function resolveGameMode(){
  const stored=currentRoomData?.gameMode||'ruleta';
  if(stored!=='random') return stored;
  if(!currentRoomId) return 'ruleta'; // safety guard
  const key='sq_gm_'+currentRoomId+'_'+today();
  const cached=localStorage.getItem(key);
  if(cached) return cached;
  // First call today — pick avoiding yesterday's
  const lastMode=localStorage.getItem('sq_last_gamemode_'+currentRoomId)||'';
  const available=GAME_MODES_LIST.filter(m=>m!==lastMode);
  const picked=available[Math.floor(Math.random()*available.length)];
  localStorage.setItem(key, picked);
  localStorage.setItem('sq_last_gamemode_'+currentRoomId, picked);
  return picked;
}

function resolveMusicType(){
  const stored=currentRoomData?.musicType||'none';
  if(stored!=='random') return stored;
  if(!currentRoomId) return 'none'; // safety guard
  const key='sq_mu_'+currentRoomId+'_'+today();
  const cached=localStorage.getItem(key);
  if(cached) return cached;
  const lastMusic=localStorage.getItem('sq_last_music_'+currentRoomId)||'';
  const available=MUSIC_LIST.filter(m=>m!==lastMusic);
  const picked=available[Math.floor(Math.random()*available.length)];
  localStorage.setItem(key, picked);
  localStorage.setItem('sq_last_music_'+currentRoomId, picked);
  return picked;
}
function getRoomGameMode(){ return resolveGameMode(); }
function getRoomMusicType(){ return resolveMusicType(); }

// ===== CARDS GAME =====
// Show static card pile (no deal animation) — used on game switch and after revert
function initCardsPile(eligible){
  const deck=document.getElementById('cardsDeck');
  if(!deck) return;
  deck._selected=null; deck._eligible=null;
  // Use all members for pile display (not just eligible)
  const allMembers=state.members||eligible||[];
  const n=Math.min(Math.max(allMembers.length,eligible?eligible.length:0,1),6);
  deck.innerHTML='';
  for(let i=0;i<n;i++){
    const card=document.createElement('div');
    card.className='card-item face-down';
    card.style.cssText=`left:calc(50% + ${(i-Math.floor(n/2))*4}px);top:calc(50% - ${i*2}px);transform:translate(-50%,-50%) rotate(${(i-Math.floor(n/2))*1.5}deg);z-index:${i};opacity:1;`;
    card.innerHTML='<span class="card-question">?</span>';
    deck.appendChild(card);
  }
}
window.initCardsPile=initCardsPile;

function getFanPositions(n){
  const pos=[];
  for(let i=0;i<n;i++){
    const t=n===1?0:(i/(n-1)-0.5);
    pos.push({x:t*(n<=3?105:125), y:Math.abs(t)*Math.abs(t)*22, r:t*(n<=3?14:11)});
  }
  return pos;
}

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function renderCardsDeck(eligible, winnerFbKey){
  // Force gameCartas visible and wait for browser paint before animating
  ['gameRuleta','gameCartas','gameSlots','gameBomba'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.style.display= id==='gameCartas' ? '' : 'none';
  });
  // Wait for TWO animation frames so browser has actually painted
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const deck=document.getElementById('cardsDeck');
  if(!deck||!eligible.length) return;

  // Pick 3-5 cards, always include winner
  const maxPossible=Math.min(eligible.length,5);
  const minCards=Math.min(3,eligible.length);
  const count=minCards+Math.floor(Math.random()*(maxPossible-minCards+1));
  const winner=eligible.find(m=>m.fbKey===winnerFbKey);
  const others=[...eligible].filter(m=>m.fbKey!==winnerFbKey).sort(()=>Math.random()-.5);
  const selected=[...others.slice(0,Math.min(count-1,others.length))];
  if(winner) selected.push(winner);
  selected.sort(()=>Math.random()-.5);
  deck._selected=selected; deck._eligible=eligible;

  const n=selected.length;
  const positions=getFanPositions(n);

  // ── PHASE 1: Build pile at center ──
  deck.innerHTML='';
  const pile=[];
  for(let i=0;i<n;i++){
    const card=document.createElement('div');
    card.className='card-item face-down';
    card.id='card-'+selected[i].fbKey;
    card.dataset.px=String(positions[i].x);
    card.dataset.py=String(positions[i].y);
    card.style.cssText=`left:50%;top:50%;transform:translate(-50%,-50%) rotate(0deg);opacity:1;transition:none;z-index:${i};`;
    card.innerHTML='<span class="card-question">?</span>';
    deck.appendChild(card);
    pile.push(card);
  }
  await sleep(250);

  // ── PHASE 2: RIFFLE SHUFFLE (4 rounds) ──
  const half=Math.floor(n/2);
  for(let r=0;r<4;r++){
    // Split left/right
    pile.forEach((card,i)=>{
      const side=i<half?-1:1;
      const spread=28+Math.random()*20;
      const lift=-18-Math.random()*16;
      const rot=(Math.random()-0.5)*16*side;
      card.style.transition='transform 0.11s ease-out';
      card.style.transform=`translate(calc(-50% + ${side*spread}px), calc(-50% + ${lift}px)) rotate(${rot}deg) scale(1.04)`;
    });
    await sleep(125);
    // Riffle back
    pile.forEach(card=>{
      const yJ=(Math.random()-0.5)*4;
      card.style.transition='transform 0.1s ease-in';
      card.style.transform=`translate(-50%, calc(-50% + ${yJ}px)) rotate(${(Math.random()-0.5)*3}deg)`;
    });
    await sleep(115);
  }
  // Settle
  pile.forEach(card=>{
    card.style.transition='transform 0.15s ease';
    card.style.transform='translate(-50%,-50%) rotate(0deg)';
  });
  await sleep(200);

  // ── PHASE 3: FAN out one by one ──
  for(let i=0;i<n;i++){
    const pos=positions[i];
    pile[i].style.transition='transform 0.35s cubic-bezier(0.34,1.4,0.64,1)';
    pile[i].style.transform=`translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px)) rotate(${pos.r}deg)`;
    pile[i].style.zIndex=String(i+1);
    // Deal sound
    try{
      const ac=new(window.AudioContext||window.webkitAudioContext)();
      const o=ac.createOscillator(),g=ac.createGain();
      o.connect(g);g.connect(ac.destination);
      o.type='triangle'; o.frequency.value=820+i*35;
      g.gain.setValueAtTime(0.07,ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001,ac.currentTime+0.09);
      o.start();o.stop(ac.currentTime+0.12);
    }catch(e){}
    await sleep(220);
  }
  await sleep(380);

  // ── PHASE 4: Flip winner ──
  await flipCardAsync(winnerFbKey, winner||selected[0], deck);
}

function flipCard(fbKey, eligible){ /* handled by renderCardsDeck */ }

async function flipCardAsync(fbKey, wm, deck){
  if(!deck||!wm) return;
  let card=document.getElementById('card-'+fbKey);
  if(!card){
    const dealt=deck.querySelectorAll('.card-item:not(.pile-placeholder)');
    if(dealt.length) card=dealt[dealt.length-1];
  }
  if(!card) return;
  const px=parseFloat(card.dataset.px||'0');
  const py=parseFloat(card.dataset.py||'0');
  // Lift
  card.style.transition='transform 0.18s ease';
  card.style.transform=`translate(calc(-50% + ${px}px), calc(-68% + ${py}px)) scale(1.08)`;
  await sleep(200);
  // Fold
  card.style.transition='transform 0.14s ease-in';
  card.style.transform=`translate(calc(-50% + ${px}px), calc(-68% + ${py}px)) scaleX(0)`;
  await sleep(160);
  // Reveal
  card.classList.remove('face-down'); card.classList.add('winner-card');
  const av=wm.image
    ?`<div class="card-member-av" style="width:52px;height:52px;"><img src="${wm.image}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"></div>`
    :`<div class="card-member-av" style="width:52px;height:52px;font-size:24px;background:${wm.color||'#6c63ff'}">${wm.emoji||'👤'}</div>`;
  card.innerHTML=`<div class="winner-crown">👑</div>${av}<div class="card-member-name">${wm.name}</div>`;
  // Unfold
  card.style.transition='transform 0.18s ease-out';
  card.style.transform=`translate(calc(-50% + ${px}px), calc(-68% + ${py}px)) scaleX(1)`;
  await sleep(200);
  // Rise
  card.style.transition='all 0.5s cubic-bezier(0.34,1.56,0.64,1)';
  card.style.transform=`translate(calc(-50% + ${px}px), calc(-108% + ${py}px)) scale(1.38)`;
  card.style.zIndex='20';
  await sleep(550);
}



// ===== SLOTS GAME =====
function slotShuffled(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}

function buildSlotReel(members, winnerIdx){
  const items=[];
  for(let r=0;r<5;r++) items.push(...slotShuffled(members));
  const insertAt=3*members.length+Math.floor(members.length/2);
  items[insertAt]=members[winnerIdx];
  for(let i=0;i<2;i++) items.push(members[(winnerIdx+i+1)%members.length]);
  return {items,winnerAt:insertAt};
}

function slotItemHtml(m){
  const av=m.image?`<div class="slot-reel-av"><img src="${m.image}"></div>`:`<div class="slot-reel-av" style="background:${m.color||'#6c63ff'}">${m.emoji||'👤'}</div>`;
  return `<div class="slot-reel-item">${av}<div class="slot-reel-name">${m.name}</div></div>`;
}

function renderSlotsReels(eligible){
  const track=document.getElementById('slotReelTrack');
  if(!track) return;
  track.innerHTML=slotShuffled(eligible).map(m=>slotItemHtml(m)).join('');
  track.style.transition='none';
  track.style.top='0px';
  const result=document.getElementById('slotMachineResult');
  if(result) result.textContent='● ● ●';
  const flash=document.getElementById('slotWinFlash');
  if(flash) flash.style.opacity='0';
}

function stopSlotsOnWinner(winnerFbKey, eligible){
  const track=document.getElementById('slotReelTrack');
  const result=document.getElementById('slotMachineResult');
  const flash=document.getElementById('slotWinFlash');
  if(!track) return;
  const winnerIdx=eligible.findIndex(m=>m.fbKey===winnerFbKey);
  const winner=eligible[winnerIdx]||eligible[0];
  const {items,winnerAt}=buildSlotReel(eligible,winnerIdx>=0?winnerIdx:0);
  const ITEM_H=40;
  track.innerHTML=items.map(m=>slotItemHtml(m)).join('');
  track.style.transition='none';
  track.style.top='0px';
  const targetTop=-(winnerAt*ITEM_H-40);
  // Phase 1: fast
  requestAnimationFrame(()=>{
    track.style.transition='top 0.8s linear';
    track.style.top=`${-eligible.length*ITEM_H}px`;
    setTimeout(()=>{
      // Phase 2: medium
      track.style.transition='top 0.8s ease-in';
      track.style.top=`${-eligible.length*2*ITEM_H}px`;
      setTimeout(()=>{
        // Phase 3: ease-out to winner
        track.style.transition='top 2.2s cubic-bezier(0.22,1,0.36,1)';
        track.style.top=`${targetTop}px`;
        setTimeout(()=>{
          if(result){ result.textContent='🏆 ¡'+winner.name+'!'; result.style.color='#FFD93D'; }
          if(flash){
            flash.style.opacity='1';
            setTimeout(()=>flash.style.opacity='0',500);
            setTimeout(()=>flash.style.opacity='1',700);
            setTimeout(()=>flash.style.opacity='0',900);
          }
          playSlotsStopSfx();
          // Stop music + show winner in result panel
          stopBgMusic();
          launchConfetti();
          playWinnerFanfare();
          if(_currentSpinData){
            showRemoteWinner(_currentSpinData, eligible);
            if(!getRoomRequireOnline()) autoConfirmWinner(winner);
          }
        },2300);
      },800);
    },800);
  });
}

function playSlotsStopSfx(){
  const c=getSfx();
  const o=c.createOscillator(),g=c.createGain();
  o.connect(g);g.connect(c.destination); o.type='sine';
  o.frequency.setValueAtTime(200,c.currentTime);o.frequency.exponentialRampToValueAtTime(80,c.currentTime+.12);
  g.gain.setValueAtTime(.3,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.2);
  o.start();o.stop(c.currentTime+.25);
}

// ===== BOMB GAME =====
let bombInterval=null;
function startBombGame(eligible, winnerFbKey, duration){
  const circle=document.getElementById('bombCircle');
  const timerEl=document.getElementById('bombTimer');
  const partsEl=document.getElementById('bombParticipants');
  if(!circle||!timerEl||!partsEl) return;
  circle.classList.remove('danger');
  circle.style.background='';
  // Render participant avatars
  partsEl.innerHTML=eligible.map(m=>{
    const av=m.image?`<img src="${m.image}">`:(m.emoji||'👤');
    const bg=m.image?'':`background:${m.color||'#6c63ff'}`;
    return `<div class="bomb-av" id="bombav-${m.fbKey}" style="${bg}">${av}</div>`;
  }).join('');
  let seconds=8; // always 8 seconds for dramatic effect
  timerEl.textContent=seconds;
  // Animate highlighting through participants
  let currentIdx=0;
  const highlight=()=>{
    document.querySelectorAll('.bomb-av').forEach(a=>a.classList.remove('highlighted'));
    const av=document.getElementById('bombav-'+eligible[currentIdx%eligible.length]?.fbKey);
    if(av) av.classList.add('highlighted');
    currentIdx++;
  };
  highlight();
  const speed=Math.max(80, 300-seconds*20);
  bombInterval=setInterval(highlight, speed);
  // Countdown
  const countdown=setInterval(()=>{
    seconds--;
    timerEl.textContent=seconds;
    if(seconds<=3) circle.classList.add('danger');
    playBombBeep(seconds);
    if(seconds<=0){ clearInterval(countdown); clearInterval(bombInterval); bombExplode(winnerFbKey, eligible); }
  },1000);
}

function playBombBeep(s){
  const c=getSfx();
  const o=c.createOscillator(),g=c.createGain();
  o.connect(g);g.connect(c.destination); o.type='square'; o.frequency.value=s<=3?880:440;
  g.gain.setValueAtTime(.2,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.06);
  o.start();o.stop(c.currentTime+.08);
}

function bombExplode(winnerFbKey, eligible){
  stopBgMusic();
  const circle=document.getElementById('bombCircle');
  const timerEl=document.getElementById('bombTimer');
  if(circle) circle.style.background='rgba(239,68,68,.15)';
  if(timerEl) timerEl.textContent='💥';
  document.querySelectorAll('.bomb-av').forEach(a=>a.classList.remove('highlighted'));
  const winAv=document.getElementById('bombav-'+winnerFbKey);
  if(winAv){ winAv.classList.add('highlighted'); winAv.style.borderColor='var(--danger)'; }
  // Explosion sound
  stopSfx(); const ac=getSfx();
  const buf=ac.createBuffer(1,ac.sampleRate*.8,ac.sampleRate);
  const d=buf.getChannelData(0);
  for(let j=0;j<d.length;j++) d[j]=(Math.random()*2-1)*Math.exp(-j/(ac.sampleRate*.2));
  const src=ac.createBufferSource(),g=ac.createGain();
  const f=ac.createBiquadFilter(); f.type='lowpass'; f.frequency.value=400;
  src.buffer=buf; src.connect(f); f.connect(g); g.connect(ac.destination);
  g.gain.setValueAtTime(1,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.7);
  src.start();src.stop(ac.currentTime+.8);
  // Show winner in result panel + assign to history
  const winner=eligible.find(m=>m.fbKey===winnerFbKey)||eligible[0];
  if(winner && _currentSpinData){
    setTimeout(()=>{
      showRemoteWinner(_currentSpinData, eligible);
      launchConfetti();
      playWinnerFanfare();
      const sb=document.getElementById('spinBtn');
      if(sb){sb.disabled=true;sb.style.opacity='0.5';}
      // Always save to history for bomb (bomb = auto-confirm always)
      saveBombWinner(winner);
    },800);
  }
}

// ===== OVERRIDE spinRoulette to handle all modes =====
// Store original spin for ruleta fallback

async function saveBombWinner(winner){
  if(!winner || !currentRoomId || !_currentSpinData) return;
  const tmrw = getTaskDueDate();
  // Check not already written
  const exists = state.history.find(h=>!h.reverted && h.facilitationDate===tmrw && h.memberId===winner.id);
  if(exists) return;
  await fbAdd('history/'+currentRoomId, {
    memberId: winner.id,
    memberName: winner.name,
    memberEmoji: winner.emoji||null,
    memberImage: winner.image||null,
    memberColor: winner.color||null,
    sortDate: today(),
    facilitationDate: tmrw,
    purpose: currentRoomData?.purpose||null,
    type: 'assigned',
    reverted: false,
    dateLabel: fmtDate(tmrw),
    autoAssigned: true,
    gameMode: 'bomba'
  });
  currentWinner=null;
  const _fd=getRoomFreeDays();
  const availDate=availableAgainDate(tmrw);
  const msg=document.getElementById('confirmedMsg');
  if(msg){
    msg.style.cssText='display:block;text-align:center;padding:10px 12px;background:rgba(16,185,129,.1);border-radius:8px;font-size:12px;color:var(--success);margin-top:10px;line-height:1.6;';
    msg.innerHTML='✓ <strong style="color:white">'+winner.name+'</strong> fue asignado para el '+fmtDate(tmrw)+'.'
      +(_fd>0?'<br>No participará los próximos <strong style="color:white">'+_fd+' día'+(_fd!==1?'s':'')+'</strong>. Volverá el <strong style="color:white">'+fmtDate(availDate)+'</strong>.':'');
  }
  showToast('🔒 '+winner.name+' fue asignado automáticamente.');
  _manualParticipants=null;
  refreshLockState();
}
function goToLobby(){
  if(currentRoomId && myMemberId) setPresence(currentRoomId, myMemberId, false);
  _listeners.forEach(({r,fn})=>off(r,'value',fn)); _listeners=[];
  if(currentRoomId) set(ref(db,'roulette/'+currentRoomId),{spinning:false}).catch(()=>{});
  _convListeners.forEach(({r,fn})=>off(r,'value',fn)); _convListeners=[];
  currentRoomId=null; currentRoomData=null; myMemberId=null; isRoomAdmin=false;
  document.getElementById('appView').style.display='none';
  if(currentUser) showLobbyView(); else showAuthPage();
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-roulette').classList.add('active');
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.querySelector('.tab').classList.add('active');
}
window.goToLobby=goToLobby;

// ===== PIN TOGGLE =====
function togglePin(){
  pinVisible=!pinVisible;
  document.getElementById('pinDisplay').textContent=pinVisible&&currentRoomData?currentRoomData.pin:'····';
  document.getElementById('pinToggleBtn').textContent=pinVisible?'Ocultar PIN':'Mostrar PIN';
}
window.togglePin=togglePin;
let codeVisible=false;
function toggleRoomCode(){
  codeVisible=!codeVisible;
  document.getElementById('roomCodeDisplay').textContent=codeVisible&&currentRoomData?.roomCode?currentRoomData.roomCode:'••••••';
  document.getElementById('roomCodeToggleBtn').textContent=codeVisible?'Ocultar':'Mostrar';
}
window.toggleRoomCode=toggleRoomCode;

// ===== ROOM LISTENERS =====
function initRoomListeners(roomId){
  setSyncStatus('syncing');
  const mRef=ref(db,'members/'+roomId);
  const mFn=snap=>{const d=snap.val();state.members=d?Object.entries(d).map(([k,v])=>({...v,fbKey:k})):[];setSyncStatus('live');renderTeam();renderMemberStatus();drawWheel(currentAngle);refreshMyUserIndicator();};
  onValue(mRef,mFn,err=>setSyncStatus('error')); _listeners.push({r:mRef,fn:mFn});
  const hRef=ref(db,'history/'+roomId);
  const hFn=snap=>{const d=snap.val();state.history=d?Object.entries(d).map(([k,v])=>({...v,fbKey:k})).sort((a,b)=>(b.createdAt||b.ts||0)-(a.createdAt||a.ts||0)):[];setSyncStatus('live');renderMemberStatus();drawWheel(currentAngle);refreshLockState();renderHistory();renderTeam();};
  onValue(hRef,hFn,err=>setSyncStatus('error')); _listeners.push({r:hRef,fn:hFn});
  const pRef=ref(db,'presence/'+roomId);
  const pFn=snap=>{
    state.presence=snap.val()||{};
    renderMemberStatus();renderTeam();drawWheel(currentAngle);refreshLockState();
    // Actualizar botón editar para invitados cuando la presencia cargue
    updateGuestHeaderBtns();
  };
  // Polling local cada 15s para detectar timestamps vencidos sin esperar Firebase
  setInterval(()=>{ if(Object.keys(state.presence).length>0){ renderMemberStatus();renderTeam();drawWheel(currentAngle);refreshLockState(); } }, 15000);
  onValue(pRef,pFn); _listeners.push({r:pRef,fn:pFn});
  // Forzar redibujado después de que cargue la presencia (fix para admin)
  setTimeout(()=>{ drawWheel(currentAngle); refreshLockState(); renderMemberStatus(); }, 1000);
  setTimeout(()=>{ drawWheel(currentAngle); refreshLockState(); renderMemberStatus(); }, 3000);
  // Listener de configuración en tiempo real — cambios reflejados al instante
  const cfgRef = isRoomAdmin
    ? ref(db,'rooms/'+currentUser.uid+'/'+roomId)
    : ref(db,'roomsMeta/'+roomId);
  const cfgFn = snap => {
    const d = snap.val();
    if(!d) return;
    currentRoomData = {...(currentRoomData||{}), ...d};
    applyRoomHeader();
    renderMemberStatus();
    drawWheel(currentAngle);
    _manualParticipants = null;
    refreshLockState();
    refreshParticipantSelector();
    renderTeam(); // refresh team tab too
    if(!spinning){
      const gm=getRoomGameMode();
      const elig=getEligible();
      // Re-init game UI with slight delay for DOM to settle
      setTimeout(()=>{
        if(gm==='slots') renderSlotsReels(elig);
        else if(gm==='cartas') initCardsPile(elig);
        else if(gm==='ruleta') drawWheel(currentAngle);
        switchGameUI(gm);
      },150);
    }
  };
  onValue(cfgRef, cfgFn); _listeners.push({r:cfgRef, fn:cfgFn});

  // Listener de ruleta en tiempo real — todos ven la animación sincronizada
  const rRef=ref(db,'roulette/'+roomId);
  let _lastSpinTs = 0;
  const _roomInitTs = Date.now(); // time we subscribed
  const rFn=snap=>{
    const data=snap.val();
    const spinBtn=document.getElementById('spinBtn');
    if(!data||!data.spinning){
      if(spinning) return;
      if(spinBtn) refreshLockState();
      return;
    }
    // Deduplicate: ignore same spin
    if(data.startTs && data.startTs === _lastSpinTs) return;
    // Ignore stale spins from before we joined (already ended)
    const elapsed=Date.now()-data.startTs;
    if(elapsed >= data.duration) return; // spin already over
    _lastSpinTs = data.startTs || 0;
    if(spinBtn) spinBtn.disabled=true;
    playRemoteSpin(data);
  };
  onValue(rRef,rFn); _listeners.push({r:rRef,fn:rFn});
  // If convocatoria room, init event listeners
  if(currentRoomData?.type==='convocatoria') initConvListeners(roomId);
}

// ===== WRITES =====
function clean(obj){Object.keys(obj).forEach(k=>{if(obj[k]===undefined)obj[k]=null;});return obj;}
async function fbAdd(path,data){setSyncStatus('syncing');const r=await push(ref(db,path),clean(data));setSyncStatus('live');return r.key;}
async function fbSet(path,data){setSyncStatus('syncing');await set(ref(db,path),typeof data==='object'&&data!==null?clean(data):data);setSyncStatus('live');}
async function fbUpdate(path,data){setSyncStatus('syncing');await update(ref(db,path),clean(data));setSyncStatus('live');}
async function fbRemove(path){setSyncStatus('syncing');await remove(ref(db,path));setSyncStatus('live');}

// ===== REGISTER VIEW =====
function showRegisterView(roomId){
  regRoomId=roomId; regAvatarData=null; selectedMemberId=null;
  createStars(); hideAll(); document.getElementById('registerView').style.display='block';
  document.getElementById('pinStep').style.display='block';
  document.getElementById('actionStep').style.display='none';
  document.getElementById('regSuccess').style.display='none';
  document.getElementById('pinInput').value='';
  document.getElementById('pinError').style.display='none';
  document.getElementById('regRoomSubtitle').textContent='Cargando sala...';
  regRoomData = null; // reset
  fetchRoomMeta(roomId);
  setSyncStatus('live');
}

function fetchRoomMeta(roomId){
  onValue(ref(db,'roomsMeta/'+roomId),snap=>{
    if(snap.val()){
      regRoomData=snap.val();
      applyRegRoomHeader();
    } else {
      // roomsMeta vacío: la sala fue creada antes de esta versión.
      // Intentar recuperar escaneando rooms de todos los owners conocidos
      // via índice roomsIndex/{roomId} = ownerUid
      onValue(ref(db,'roomsIndex/'+roomId),snap2=>{
        const ownerUid=snap2.val();
        if(ownerUid){
          onValue(ref(db,'rooms/'+ownerUid+'/'+roomId),snap3=>{
            if(snap3.val()){
              regRoomData=snap3.val();
              // Escribir en roomsMeta para la próxima vez
              set(ref(db,'roomsMeta/'+roomId),{
                name:regRoomData.name,
                purpose:regRoomData.purpose||null,
                icon:regRoomData.icon||'🎰',
                pin:regRoomData.pin,
                ownerUid:regRoomData.ownerUid||ownerUid
              });
              applyRegRoomHeader();
            } else {
              document.getElementById('regRoomSubtitle').textContent='Sala no encontrada. Pedí un link actualizado al admin.';
            }
          },{onlyOnce:true});
        } else {
          document.getElementById('regRoomSubtitle').textContent='Sala no encontrada. Pedí un link actualizado al admin.';
        }
      },{onlyOnce:true});
    }
  },{onlyOnce:true});
}

function applyRegRoomHeader(){
  if(!regRoomData) return;
  document.getElementById('regRoomIcon').textContent=regRoomData.icon||'🎰';
  document.getElementById('regRoomTitle').innerHTML='Bienvenido a <span style="color:var(--accent2)">'+regRoomData.name+'</span>';
  document.getElementById('regRoomSubtitle').textContent='Solicitá el PIN de seguridad al Admin para acceder';
}

function verifyPin(){
  const inputPin=document.getElementById('pinInput').value.trim();
  if(!regRoomData){
    // Sala aún cargando — reintentar en 1.5s
    document.getElementById('regRoomSubtitle').textContent='Cargando sala, un momento...';
    setTimeout(verifyPin, 1500);
    return;
  }
  if(!inputPin){ showToast('Ingresa el PIN'); return; }
  if(inputPin===String(regRoomData.pin)){
    document.getElementById('pinStep').style.display='none';
    document.getElementById('pinError').style.display='none';
    // Si tiene Google, ofrecer elección de perfil
    if(currentUser){
      _profileChoiceRoomId = regRoomId;
      _profileChoiceRoomData = regRoomData;
      // NO llamar hideAll() — dejar registerView visible como fondo
      // Solo mostrar el modal encima
      openProfileChoiceModal(regRoomId, regRoomData);
      return;
    }
    document.getElementById('actionStep').style.display='block';
    // Mostrar siempre el botón de Google
    const gOpt = document.getElementById('regGoogleOption');
    if(gOpt){
      gOpt.style.display='block';
      if(currentUser){ document.getElementById('regGoogleName').textContent = currentUser.displayName || currentUser.email; }
    }
    // Build emoji picker
    regSelectedEmoji = null;
    regAvatarData = null;
    onPhotoRemoved('reg');
    document.getElementById('regPreview').innerHTML='📷';
    setTimeout(()=>buildEmojiPicker('regEmojiGrid'), 100);
    loadMembersForSelect();
  } else {
    const errEl=document.getElementById('pinError');
    errEl.textContent='PIN incorrecto. Verifica el código con el administrador de la sala.';
    errEl.style.display='block';
    document.getElementById('pinInput').value='';
    document.getElementById('pinInput').focus();
  }
}
window.verifyPin=verifyPin;
document.getElementById('pinInput').addEventListener('keydown',e=>{if(e.key==='Enter')verifyPin();});

function loadMembersForSelect(){
  // Cargar presencia y miembros juntos para filtrar correctamente
  onValue(ref(db,'presence/'+regRoomId),presSnap=>{
    const presence=presSnap.val()||{};
    onValue(ref(db,'members/'+regRoomId),snap=>{
      const data=snap.val();
      const members=data?Object.entries(data).map(([k,v])=>({...v,fbKey:k})):[];
      // Filtrar: solo mostrar los que están desconectados (no online)
      const offline=members.filter(m=>{
        const p=presence[m.fbKey];
        const online=p&&p.online===true&&p.ts&&(Date.now()-p.ts)<90000;
        return !online;
      });
      renderMemberSelectList(offline, members.length);
    },{onlyOnce:true});
  },{onlyOnce:true});
}

function renderMemberSelectList(members, totalCount){
  const list=document.getElementById('memberSelectList');
  const hidden=(totalCount||0)-members.length;
  if(!members.length){
    const msg=totalCount>0
      ? '<p style="font-size:13px;color:var(--text3);text-align:center;padding:16px 0;">Todos los usuarios ya están en línea.<br><span style="font-size:11px;">Si eres nuevo, regístrate en la otra pestaña.</span></p>'
      : '<p style="font-size:13px;color:var(--text3);text-align:center;padding:16px 0;">Aún no hay integrantes registrados</p>';
    list.innerHTML=msg; return;
  }
  list.innerHTML=members.map(m=>{
    const av=m.image?`<div class="msi-av"><img src="${m.image}" alt="${m.name}"></div>`:`<div class="msi-av" style="background:${m.color||'#6c63ff'}">${m.emoji||'👤'}</div>`;
    return `<div class="member-select-item" id="msi-${m.fbKey}" onclick="selectMember('${m.fbKey}')">${av}<div class="msi-name">${m.name}</div><div class="msi-check" id="msi-check-${m.fbKey}">✓</div></div>`;
  }).join('');
  if(hidden>0){
    list.innerHTML+=`<p style="font-size:11px;color:var(--text3);text-align:center;padding:6px 0;">${hidden} usuario${hidden!==1?'s':''} ya está${hidden!==1?'n':''} en línea y no se puede${hidden!==1?'n':''} seleccionar</p>`;
  }
}

function selectMember(fbKey){ selectedMemberId=fbKey; document.querySelectorAll('.member-select-item').forEach(el=>el.classList.remove('sel')); document.getElementById('msi-'+fbKey)?.classList.add('sel'); }
window.selectMember=selectMember;
function switchRegTab(tab,el){ document.querySelectorAll('.reg-tab').forEach(t=>t.classList.remove('active')); document.querySelectorAll('.reg-page').forEach(p=>p.classList.remove('active')); el.classList.add('active'); document.getElementById('reg-'+tab).classList.add('active'); }
window.switchRegTab=switchRegTab;
function previewRegAvatar(e){ const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{regAvatarData=ev.target.result;document.getElementById('regPreview').innerHTML=`<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`; onPhotoLoaded('reg');document.getElementById('regUploadTxt').textContent='Foto seleccionada ✓';};r.readAsDataURL(f); }
window.previewRegAvatar=previewRegAvatar;

async function submitRegister(){
  const name=document.getElementById('regName').value.trim();
  if(!name){showToast('Ingresa tu nombre');return;}
  const snap=await new Promise(res=>onValue(ref(db,'members/'+regRoomId),res,{onlyOnce:true}));
  const existing=snap.val();
  if(existing&&Object.values(existing).find(m=>m.name.trim().toLowerCase()===name.toLowerCase())){ showToast('⚠ Ya existe ese nombre en la sala'); return; }
  const EMOJIS=['👩‍💻','👨‍💼','👩‍🔬','👨‍🚀','👩‍🎨','🧑‍💻','👩‍🏫','👨‍🎤','🧙','👩‍🔧'];
  const COLORS=['#6c63ff','#f59e0b','#10b981','#ef4444','#a78bfa','#06b6d4','#f97316','#ec4899'];
  const idx=existing?Object.keys(existing).length:0;
  const key=await fbAdd('members/'+regRoomId,{id:Date.now(),name,emoji:EMOJIS[idx%EMOJIS.length],color:COLORS[idx%COLORS.length],image:regAvatarData||null});
  localStorage.setItem('dr_session_'+regRoomId,key);
  // Vincular con Google si está logueado
  if(currentUser) set(ref(db,'memberLinks/'+currentUser.uid+'/'+regRoomId), key).catch(()=>{});
  setPresence(regRoomId,key,true);
  myMemberId=key;
  showRegSuccess(name,'¡Registrado! Ya estás en línea en la sala.');
}
window.submitRegister=submitRegister;

async function loginExisting(){
  if(!selectedMemberId){showToast('Selecciona tu usuario');return;}
  localStorage.setItem('dr_session_'+regRoomId,selectedMemberId);
  if(currentUser) set(ref(db,'memberLinks/'+currentUser.uid+'/'+regRoomId), selectedMemberId).catch(()=>{});
  setPresence(regRoomId,selectedMemberId,true);
  myMemberId=selectedMemberId;
  const snap=await new Promise(res=>onValue(ref(db,'members/'+regRoomId+'/'+selectedMemberId),res,{onlyOnce:true}));
  const member=snap.val();
  showRegSuccess(member?.name||'','¡Bienvenido de vuelta! Ya estás en línea en la sala.');
}
window.loginExisting=loginExisting;

function showRegSuccess(name,msg){
  document.getElementById('actionStep').style.display='none';
  document.getElementById('regSuccess').style.display='block';
  document.getElementById('regSuccessName').textContent=name;
  document.getElementById('regSuccessMsg').textContent=msg;
  launchConfetti();
  // Ir a la sala automáticamente después de 1.5s (tiempo del confetti)
  setTimeout(()=>goToRoomFromReg(), 1500);
}

function goToRoomFromReg(){
  // No recargar — ir directo a la sala sin pasar por onAuthStateChanged
  hideAll();
  currentRoomId = regRoomId;
  // Cargar roomData desde regRoomData que ya está cargado
  if(regRoomData){ currentRoomData = regRoomData; }
  document.getElementById('appView').style.display='block';
  document.getElementById('currentDate').textContent=new Date().toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  // Ocultar elementos de admin para usuarios no logueados
  isRoomAdmin = false;
  document.getElementById('pinBox').style.display='none';
  document.getElementById('adminTeamActions').style.display='none';
  document.getElementById('headerAdminBar').style.display='none';
  document.getElementById('headerGuestBar').style.display='flex';
  // Aplicar header de sala
  if(currentRoomData) applyRoomHeader();
  // Forzar botón editar DESPUÉS de applyRoomHeader (puede haberlo ocultado)
  updateGuestHeaderBtns();
  _listeners.forEach(({r,fn})=>off(r,'value',fn)); _listeners=[];
  state={members:[],history:[],presence:{}};
  createStars(); initRoomListeners(regRoomId); updateInviteUrl();
  // Mostrar banner participando una vez carguen los miembros
  setTimeout(refreshMyUserIndicator, 500);
  setTimeout(refreshMyUserIndicator, 1500);
  // Presencia ya fue marcada en submitRegister/loginExisting
}
window.goToRoomFromReg=goToRoomFromReg;

// ===== DATES =====
function today(){return new Date().toISOString().slice(0,10);}
function tomorrow(){const d=new Date();d.setDate(d.getDate()+1);return d.toISOString().slice(0,10);}
function dateOffset(n){const d=new Date();d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);}
function fmtDate(str){return new Date(str+'T12:00:00').toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'});}
function getRoomRequireOnline(){ return currentRoomData?.requireOnline !== false; } // default: true
function getRoomFreeDays(){ const v=currentRoomData?.freeDays; return (v==null)?2:Math.max(0,parseInt(v)||0); }
function getRoomMinParticipants(){ const v=currentRoomData?.minParticipants; return Math.max(2, (v==null)?2:parseInt(v)||2); }
function getRoomDueDays(){ const v=currentRoomData?.dueDays; return (v==null)?0:Math.max(0,parseInt(v)||0); }
function getTaskDueDate(){
  const mode=currentRoomData?.dueMode||'today';
  if(mode==='today') return today();
  if(mode==='tomorrow'){ const d=new Date(); d.setDate(d.getDate()+1); return d.toISOString().slice(0,10); }
  if(mode==='custom' && currentRoomData?.dueCustomDate) return currentRoomData.dueCustomDate;
  // fallback
  return today();
}
function availableAgainDate(fd){
  const d=new Date(fd+'T12:00:00');
  d.setDate(d.getDate() + getRoomFreeDays() + 1);
  return d.toISOString().slice(0,10);
}

// ===== STATUS =====
function getTodayConfirmed(){
  // Buscar sorteo realizado hoy (independientemente de la fecha de tarea)
  return state.history.find(h=>h.type==='assigned'&&!h.reverted&&h.sortDate===today()&&!h.reverted);
}
function getMemberStatus(id, fbKey){
  const tmrw=tomorrow(),tod=today();
  // If room doesn't require online, treat everyone as online for status purposes
  if(getRoomRequireOnline() && !isMemberOnline(fbKey||id)) return 'offline';
  if(state.history.find(h=>h.memberId===id&&h.facilitationDate===tod&&h.type==='assigned'&&!h.reverted)) return 'facilitating_today';
  if(state.history.find(h=>h.memberId===id&&h.facilitationDate===tmrw&&h.type==='assigned'&&!h.reverted)) return 'assigned_tomorrow';
  if(state.history.find(h=>h.memberId===id&&h.facilitationDate===tmrw&&h.type==='unavailable'&&!h.reverted)) return 'unavailable_tomorrow';
  // Días libres dinámicos según configuración de la sala
  const fd=getRoomFreeDays();
  for(let i=1;i<=fd;i++){
    const dayStr=dateOffset(-i);
    if(state.history.find(h=>h.memberId===id&&h.facilitationDate===dayStr&&h.type==='assigned'&&!h.reverted))
      return 'free_day'+i;
  }
  return 'eligible';
}
function getEligible(){
  if(!getRoomRequireOnline() && _manualParticipants !== null){
    // Use manual selection — include free_day members if admin manually checked them
    return state.members.filter(m=>
      _manualParticipants.has(m.fbKey) &&
      getMemberStatusBase(m.id,m.fbKey)!=='facilitating_today' &&
      getMemberStatusBase(m.id,m.fbKey)!=='assigned_tomorrow'
    );
  }
  return state.members.filter(m=>getMemberStatus(m.id,m.fbKey)==='eligible');
}
function getTodayFacilitator(){
  // Miembro que tiene facilitationDate === today (fue sorteado ayer para facilitar hoy)
  const h=state.history.find(h=>h.type==='assigned'&&!h.reverted&&h.facilitationDate===today());
  if(!h) return null;
  return state.members.find(m=>m.id===h.memberId)||null;
}
function canCurrentUserSpin(){
  // Admin siempre puede girar
  if(isRoomAdmin) return true;
  const facilitator=getTodayFacilitator();
  if(!facilitator) return true; // nadie asignado para hoy → cualquiera puede
  // Solo el facilitador de hoy puede girar
  return myMemberId && facilitator.fbKey === myMemberId;
}

// ===== INVITE =====
function updateInviteUrl(){const url=getInviteUrl(currentRoomId);const box=document.getElementById('inviteUrlBox');if(box)box.textContent=url;const qrIn=document.getElementById('appQrUrlInput');if(qrIn)qrIn.value=url;}
window.updateInviteUrl=updateInviteUrl;

// ===== QR HELPER =====
let _qrLib=false;
function loadQRLib(cb){if(_qrLib){cb();return;}const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';s.onload=()=>{_qrLib=true;cb();};document.head.appendChild(s);}
function generateQROnCanvas(canvas,url){
  if(!canvas||!url) return;
  loadQRLib(()=>{
    canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
    // Approach: render QRCode to a fresh canvas element directly
    const tmp=document.createElement('div');
    tmp.style.cssText='position:fixed;left:-9999px;top:-9999px;';
    document.body.appendChild(tmp);
    try{
      const qr=new QRCode(tmp,{
        text:url,
        width:canvas.width,
        height:canvas.height,
        colorDark:'#000000',
        colorLight:'#ffffff',
        correctLevel:QRCode.CorrectLevel.M
      });
      // Try canvas first (more reliable), then img fallback
      function tryDraw(){
        const qrCanvas=tmp.querySelector('canvas');
        if(qrCanvas){
          canvas.getContext('2d').drawImage(qrCanvas,0,0,canvas.width,canvas.height);
          document.body.removeChild(tmp);
          return;
        }
        const img=tmp.querySelector('img');
        if(img&&img.complete&&img.naturalWidth>0){
          canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
          document.body.removeChild(tmp);
          return;
        }
        if(img){
          img.onload=()=>{
            canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
            document.body.removeChild(tmp);
          };
          img.onerror=()=>{ document.body.removeChild(tmp); };
        } else {
          // Retry after short delay
          setTimeout(tryDraw,150);
        }
      }
      setTimeout(tryDraw,80);
    }catch(e){
      if(document.body.contains(tmp)) document.body.removeChild(tmp);
      console.error('QR generation error:',e);
    }
  });
}

// ===== CANVAS RULETA =====
let spinning=false, currentAngle=0;

let _wheelWinnerFbKey = null; // set after spin to highlight winner
let _wheelLastEligible = null; // snapshot of eligible list at spin time

function drawWheel(angle){
  // After spin: use the stored eligible snapshot so segments stay visible
  const eligible = _wheelWinnerFbKey && _wheelLastEligible
    ? _wheelLastEligible
    : getEligible();
  drawWheelWithEligible(angle, eligible, _wheelWinnerFbKey);
}

function drawWheelWithEligible(angle, eligible, winnerFbKey){
  const canvas=document.getElementById('rouletteCanvas');if(!canvas)return;
  const ctx=canvas.getContext('2d');const W=canvas.width,cx=W/2;
  ctx.clearRect(0,0,W,W);

  if(eligible.length===0){
    // Empty state — dark bg circle
    ctx.beginPath();ctx.arc(cx,cx,cx-10,0,Math.PI*2);
    ctx.fillStyle='#111827';ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,0.08)';ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,0.35)';ctx.font='500 13px Segoe UI';ctx.textAlign='center';
    const conf=getTodayConfirmed();
    if(conf){ctx.fillText('Sorteo cerrado',cx,cx-8);ctx.fillText('para hoy ✓',cx,cx+14);}
    else if(state.members.length===0){ctx.fillText('Cargando...',cx,cx+6);}
    else{ctx.fillText('Esperando',cx,cx-8);ctx.fillText('participantes en línea',cx,cx+14);}
    return;
  }

  const n=eligible.length,arc=(Math.PI*2)/n,R=cx-10;
  const RAINBOW=['#FF6B6B','#FF9E4F','#FFD93D','#6BCB77','#4D96FF','#C77DFF','#FF6BB5','#4DFFEF','#FF6B6B','#6BCB77'];

  for(let i=0;i<n;i++){
    const sa=angle+i*arc,ea=sa+arc;
    // Radial gradient per segment
    const isWon = winnerFbKey && eligible[i].fbKey === winnerFbKey;
    const isGrey = winnerFbKey && eligible[i].fbKey !== winnerFbKey;
    const segColor = isGrey ? '#555566' : RAINBOW[i%RAINBOW.length];
    const grd=ctx.createRadialGradient(cx,cx,0,cx,cx,R);
    grd.addColorStop(0, isGrey ? 'rgba(100,100,120,0.2)' : 'rgba(255,255,255,0.25)');
    grd.addColorStop(1, segColor);
    ctx.beginPath();ctx.moveTo(cx,cx);ctx.arc(cx,cx,R,sa,ea);ctx.closePath();
    ctx.fillStyle=grd;ctx.fill();
    ctx.strokeStyle=isGrey?'rgba(255,255,255,0.2)':'rgba(255,255,255,0.7)';ctx.lineWidth=1.5;ctx.stroke();

    // Name label
    ctx.save();
    ctx.translate(cx,cx);ctx.rotate(sa+arc/2);
    ctx.textAlign='right';
    const fontSize = n<=4?15:n<=6?13:11;
    ctx.font=`700 ${fontSize}px Segoe UI`;
    ctx.shadowColor='rgba(0,0,0,0.8)';ctx.shadowBlur=6;
    ctx.fillStyle = isGrey ? 'rgba(255,255,255,0.35)' : '#fff';
    const maxLen = n<=4?14:n<=6?12:10;
    const nm=eligible[i].name.length>maxLen?eligible[i].name.slice(0,maxLen)+'…':eligible[i].name;
    ctx.fillText(nm,R-8,5);
    ctx.restore();
  }

  // Outer glow ring
  ctx.beginPath();ctx.arc(cx,cx,R,0,Math.PI*2);
  ctx.strokeStyle='rgba(255,255,255,0.65)';ctx.lineWidth=3;
  ctx.shadowColor='rgba(255,255,255,0.5)';ctx.shadowBlur=10;
  ctx.stroke();ctx.shadowBlur=0;

  // Dot accents at segment dividers
  for(let i=0;i<n;i++){
    const a=angle+i*arc;
    const dx=cx+(R)*Math.cos(a),dy=cx+(R)*Math.sin(a);
    ctx.beginPath();ctx.arc(dx,dy,3.5,0,Math.PI*2);
    ctx.fillStyle='rgba(255,255,255,0.9)';ctx.fill();
  }

  // Center circle — white with subtle gradient
  const cg=ctx.createRadialGradient(cx,cx,0,cx,cx,28);
  cg.addColorStop(0,'#ffffff');cg.addColorStop(1,'#f0f0f0');
  ctx.beginPath();ctx.arc(cx,cx,28,0,Math.PI*2);
  ctx.fillStyle=cg;ctx.fill();
  ctx.strokeStyle='rgba(0,0,0,0.12)';ctx.lineWidth=1.5;ctx.stroke();
  // NO text in center — cleaner look, spinner button is below the canvas

  // Pointer triangle — vivid red like rainbow segment
  const px=cx,py=4;
  ctx.beginPath();ctx.moveTo(px,py+16);ctx.lineTo(px-9,py);ctx.lineTo(px+9,py);ctx.closePath();
  ctx.fillStyle='#FF6B6B';
  ctx.shadowColor='rgba(255,107,107,0.7)';ctx.shadowBlur=8;
  ctx.fill();ctx.shadowBlur=0;
}

function refreshLockState(){
  const conf=getTodayConfirmed(),spinBtn=document.getElementById('spinBtn');
  const tB=document.getElementById('tomorrowBanner'),lB=document.getElementById('lockedBanner'),mB=document.getElementById('minMembersBanner');
  // Always refresh participant selector first (has own visibility logic)
  refreshParticipantSelector();
  const onlineEligible=getEligible();
  const requireOnlineMode=getRoomRequireOnline();
  const onlineCount=requireOnlineMode
    ? state.members.filter(m=>isMemberOnline(m.fbKey)).length
    : state.members.length;
  const minP=getRoomMinParticipants();
  if(conf){
    spinBtn.disabled=true;tB.style.display='none';lB.classList.add('show');mB.classList.remove('show');
    document.getElementById('lbName').textContent='✓ '+conf.memberName+' fue seleccionado';
    document.getElementById('lbDate').textContent=fmtDate(conf.facilitationDate);return;
  }
  lB.classList.remove('show');
  const mmTitle=document.getElementById('minMembersTitle');
  if(!requireOnlineMode){
    // Mode "todos los miembros": check selected participants
    const selectedCount = onlineEligible.length; // getEligible() already uses manual selection
    if(selectedCount < minP){
      spinBtn.disabled=true; tB.style.display='none'; mB.classList.add('show');
      if(mmTitle) mmTitle.textContent=`⚠ Mínimo ${minP} participante${minP!==1?'s':''} seleccionado${minP!==1?'s':''}`;
      document.getElementById('minMembersSub').textContent=`${selectedCount} seleccionado${selectedCount!==1?'s':''} — mínimo ${minP} para sortear`;
      return;
    }
  } else {
    if(onlineCount<minP){
      spinBtn.disabled=true;tB.style.display='none';mB.classList.add('show');
      if(mmTitle) mmTitle.textContent=`⚠ Mínimo ${minP} participante${minP!==1?'s':''} en línea`;
      document.getElementById('minMembersSub').textContent=`${onlineCount} en línea — necesitás ${minP-onlineCount} más`;return;
    }
    if(onlineEligible.length<minP){
      spinBtn.disabled=true;tB.style.display='none';mB.classList.add('show');
      if(mmTitle) mmTitle.textContent=`⚠ Mínimo ${minP} participante${minP!==1?'s':''} en línea`;
      document.getElementById('minMembersSub').textContent=`${onlineEligible.length} elegible${onlineEligible.length!==1?'s':''} — mínimo ${minP} para sortear`;return;
    }
  }
  // Verificar si el usuario actual puede girar
  if(!canCurrentUserSpin()){
    spinBtn.disabled=true;
    const fac=getTodayFacilitator();
    if(fac){
      tB.innerHTML=`Solo <strong>${fac.name}</strong> puede girar hoy`;
    } else {
      tB.innerHTML='El ganador será asignado para la próxima sesión';
    }
    tB.style.display='block';
    mB.classList.remove('show');
    return;
  }
  spinBtn.disabled=false;
  const _resolvedMode=getRoomGameMode(); // resolves 'random' to actual mode
  tB.innerHTML='El ganador será asignado para la próxima sesión';
  tB.style.display='block';mB.classList.remove('show');
  if(_resolvedMode && _resolvedMode!=='random') switchGameUI(_resolvedMode);
  refreshParticipantSelector();
}

function spinRoulette(){
  if(!canCurrentUserSpin()){
    const fac=getTodayFacilitator();
    showToast(fac?`Solo ${fac.name} puede girar hoy`:'No tienes permiso para girar');
    return;
  }
  if(getTodayConfirmed()){showToast('🔒 Ya hay un seleccionado para este turno.');return;}
  const eligible=getEligible();
  const minP2=getRoomMinParticipants();
  if(eligible.length<minP2){showToast(`⚠ Necesitás al menos ${minP2} participantes en línea.`);return;}
  if(spinning)return;
  // Block button immediately
  const _sb=document.getElementById('spinBtn');
  if(_sb){_sb.disabled=true;_sb.style.opacity='0.5';}
  spinning=true;
  _wheelWinnerFbKey = null;
  _wheelLastEligible = null;
  document.getElementById('winnerCard').classList.remove('show');
  // Pre-render game UI immediately (before Firebase round-trip)
  const _gmNow=getRoomGameMode();
  const _eligNow=getEligible();
  if(_gmNow==='slots' && _eligNow.length) renderSlotsReels(_eligNow);
  if(_gmNow==='cartas') initCardsPile(_eligNow);
  if(_gmNow==='bomba') {
    const bc=document.getElementById('bombCircle');
    const bt=document.getElementById('bombTimer');
    if(bc){bc.classList.remove('danger');bc.style.background='';}
    if(bt) bt.textContent='8';
  }
  // Start background music
  startBgMusic(getRoomMusicType());
  document.getElementById('availSection').style.display='none';
  document.getElementById('confirmedMsg').style.display='none';
  currentWinner=null;

  _wheelLastEligible = [...eligible]; // store snapshot before Firebase write
  const n=eligible.length, arc=(Math.PI*2)/n;
  // 1. Elegir ganador al azar
  const wi = Math.floor(Math.random()*n);
  // 2. Ángulo de inicio limpio (normalizado entre 0 y 2π)
  const startA = ((currentAngle % (Math.PI*2)) + Math.PI*2) % (Math.PI*2);
  currentAngle = startA;
  // 3. Calcular cuánto hay que girar para que el segmento wi quede bajo el puntero (arriba = -π/2)
  //    El segmento wi empieza en startA + wi*arc.
  //    Queremos que el CENTRO del segmento wi quede en la posición del puntero (-π/2 = 3π/2 en [0,2π)).
  //    Centro del segmento wi relativo al ángulo actual:
  //    posActual = (startA + wi*arc + arc/2) mod 2π
  //    Queremos que posActual llegue a 3π/2 (puntero arriba)
  const pointerPos = (3*Math.PI/2); // puntero en [0,2π) = -π/2 normalizado
  const segMidPos = ((startA + wi*arc + arc/2) % (Math.PI*2) + Math.PI*2) % (Math.PI*2);
  let delta = pointerPos - segMidPos;
  if(delta <= 0) delta += Math.PI*2; // siempre girar hacia adelante al menos una vuelta
  // 4. Agregar vueltas completas para que el giro sea vistoso
  const totalA = Math.PI*2*(5+Math.floor(Math.random()*4)) + delta;
  const dur=4200, startTs=Date.now();

  // Solo escribir a Firebase — la animación la maneja playRemoteSpin para TODOS
  // incluyendo quien giró. Así admin y participantes ven lo mismo.
  const winnerMember = eligible[wi];
  const finalAngle = startA + totalA;
  const spinData = {
    spinning:true, startAngle:startA, totalAngle:totalA, finalAngle:finalAngle,
    duration:dur, startTs:startTs, winnerIdx:wi,
    winnerFbKey: winnerMember.fbKey || null,
    winnerName: winnerMember.name || null,
    winnerMemberId: winnerMember.id || null,
    eligibleSnapshot:eligible.map(m=>({fbKey:m.fbKey,id:m.id,name:m.name,emoji:m.emoji,color:m.color,image:m.image||null}))
  };
  // Guardar globalmente ANTES de escribir en Firebase
  _currentSpinData = spinData;
  set(ref(db,'roulette/'+currentRoomId), spinData);
}
window.spinRoulette=spinRoulette;

let _currentSpinData = null; // Store spin data for winner verification

function playRemoteSpin(data){
  _currentSpinData = data; // Save for isCurrentUserWinner
  const alreadyElapsed=Date.now()-data.startTs;

  if(alreadyElapsed>=data.duration){
    // Llegamos tarde — saltar al ángulo final exacto
    currentAngle = data.finalAngle || (data.startAngle+data.totalAngle);
    drawWheel(currentAngle);
    showRemoteWinner(data);
    return;
  }

  spinning=true;
  document.getElementById('spinBtn').disabled=true;
  document.getElementById('winnerCard').classList.remove('show');
  document.getElementById('availSection').style.display='none';
  document.getElementById('confirmedMsg').style.display='none';

  const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
  const startA=data.startAngle, totalA=data.totalAngle, dur=data.duration, startTs=data.startTs;
  const gameMode=getRoomGameMode();
  // Initialize non-roulette game UIs
  const remoteElig2=data.eligibleSnapshot||getEligible();
  if(gameMode==='cartas'){
    // Only re-render if not already done (local spinner pre-rendered)
    const deck=document.getElementById('cardsDeck');
    if(!deck||deck.children.length===0) renderCardsDeck(remoteElig2);
  }
  if(gameMode==='slots'){
    // Only re-render if track is empty (local spinner already rendered)
    const track=document.getElementById('slotReelTrack');
    if(!track||track.children.length===0) renderSlotsReels(remoteElig2);
    else {
      // Track already rendered — start animation immediately
      stopSlotsOnWinner(data.winnerFbKey, remoteElig2);
      return;
    }
  }
  if(gameMode==='bomba'){ startBombGame(remoteElig2, data.winnerFbKey, dur); return; }
  // Sincronizar ángulo local con el del servidor para que todos vean lo mismo
  currentAngle = startA;

  // Usar snapshot de elegibles guardado en Firebase para renderizar igual en todos
  const remoteEligible = data.eligibleSnapshot || getEligible();
  _wheelLastEligible = [...remoteEligible]; // store for display after spin

  function anim(){
    const el=Date.now()-startTs, p=Math.min(el/dur,1);
    currentAngle=startA+totalA*ease(p);
    drawWheelWithEligible(currentAngle, remoteEligible);
    if(p<1){ requestAnimationFrame(anim); }
    else{
      // Asegurar que el ángulo final sea exacto (no acumulación de float errors)
      currentAngle = data.finalAngle || (startA + totalA);
      _wheelWinnerFbKey = data.winnerFbKey || null; // highlight winner
      drawWheel(currentAngle);
      spinning=false;
      document.getElementById('spinBtn').disabled=false;
      _currentSpinData = data;
      const gm=getRoomGameMode();
      const winnerMember=remoteEligible.find(m=>m.fbKey===data.winnerFbKey)||remoteEligible[0];
      if(gm==='cartas'){
        // renderCardsDeck deals cards + flips winner, then .then() fires
        renderCardsDeck(remoteEligible, data.winnerFbKey).then(()=>{
          stopBgMusic(); launchConfetti(); playWinnerFanfare();
          showRemoteWinner(data, remoteEligible);
          if(!getRoomRequireOnline()&&winnerMember) autoConfirmWinner(winnerMember);
        });
      } else if(gm==='slots'){
        // Slots animation runs; winner panel shown inside stopSlotsOnWinner
        stopSlotsOnWinner(data.winnerFbKey, remoteEligible);
      } else if(gm==='bomba'){
        // Bomb: handled in bombExplode callback
      } else {
        // Ruleta: show immediately after wheel stops
        stopBgMusic(); launchConfetti(); playWinnerFanfare();
        showRemoteWinner(data, remoteEligible);
      }
      // Limpiar estado en Firebase (solo el spinner lo hace para evitar race)
      set(ref(db,'roulette/'+currentRoomId),{spinning:false});
    }
  }
  requestAnimationFrame(anim);
}

function isCurrentUserWinner(winner, spinData){
  if(!winner) return false;
  if(!myMemberId) return false;
  // Usar spinData pasado como arg, o el global _currentSpinData como fallback
  const sd = spinData || _currentSpinData;
  // Verificación primaria: winnerFbKey explícito — el más confiable
  if(sd && sd.winnerFbKey) {
    return sd.winnerFbKey === myMemberId;
  }
  // Fallback: comparar por fbKey del objeto winner
  if(winner.fbKey && winner.fbKey === myMemberId) return true;
  // Fallback 2: comparar por id numérico
  const myMember = state.members.find(m => m.fbKey === myMemberId);
  if(myMember && winner.id && String(winner.id) === String(myMember.id)) return true;
  return false;
}
function showRemoteWinner(data, remoteEligible){
  const eligible=remoteEligible||data.eligibleSnapshot||getEligible();
  // Usar winnerFbKey para encontrar al ganador directamente — NO depender del índice
  // El índice puede ser inconsistente entre diferentes clientes
  let winner = null;
  if(data.winnerFbKey){
    winner = eligible.find(m=>m.fbKey===data.winnerFbKey) || 
             state.members.find(m=>m.fbKey===data.winnerFbKey) ||
             eligible[data.winnerIdx] || null;
  } else {
    winner = eligible[data.winnerIdx] || null;
  }
  if(!winner) return;
  // Solo mostrar el card — sin botones de confirm/decline para quien no puede girar
  document.getElementById('winnerCard').classList.add('show');
  const av=document.getElementById('winnerAvatar');
  av.innerHTML=winner.image?`<img src="${winner.image}" alt="${winner.name}">`:(winner.emoji||'👤');
  if(!winner.image) av.style.background=winner.color||'#6c63ff'; else av.style.background='';
  document.getElementById('winnerName').textContent=winner.name;
  // Mostrar mensaje personalizado al ganador — usar spinData para verificación exacta
  const _amIWinner=isCurrentUserWinner(winner, data);
  document.getElementById('winnerSub').textContent=_amIWinner?'🎯 ¡Te tocó a ti!':(currentRoomData?.purpose||'Fue seleccionado');
  document.getElementById('winnerDate').textContent=_amIWinner?'Confirma si puedes cumplir con la tarea':'Esperando confirmación del seleccionado...';
  // Guardar winner para confirmación
  currentWinner=winner;
  // Si requireOnline=false → auto-aceptar sin pedir confirmación
  if(!getRoomRequireOnline()){
    document.getElementById('availSection').style.display='none';
    document.getElementById('winnerSub').textContent='🎯 ¡Fue seleccionado!';
    document.getElementById('winnerDate').textContent='Asignado automáticamente ✓';
    // Auto-confirmar desde quien giró (admin o facilitador)
    if(isRoomAdmin || canCurrentUserSpin()){
      setTimeout(()=>autoConfirmWinner(winner), 800);
    }
    return;
  }
  // Solo el ganador puede aceptar o denegar
  const isWinner=isCurrentUserWinner(winner, data);
  document.getElementById('availSection').style.display=isWinner?'block':'none';
  if(isWinner){
    const q=document.querySelector('#availSection p');
    if(q) q.textContent=currentRoomData?.purpose?`¿Puedes cumplir con "${currentRoomData.purpose}"?`:'¿Puedes cumplir con la tarea asignada?';
  }
}

function showWinner(m){
  document.getElementById('winnerCard').classList.add('show');
  const av=document.getElementById('winnerAvatar');
  av.innerHTML=m.image?`<img src="${m.image}" alt="${m.name}">`:(m.emoji||'👤');
  if(!m.image)av.style.background=m.color||'#6c63ff';else av.style.background='';
  document.getElementById('winnerName').textContent=m.name;
  const _iW=isCurrentUserWinner(m, _currentSpinData);
  document.getElementById('winnerSub').textContent=_iW?'🎯 ¡Te tocó a ti!':(currentRoomData?.purpose||'Fue seleccionado');
  document.getElementById('winnerDate').textContent=_iW?'Confirma si puedes cumplir con la tarea':`Tarea para: ${fmtDate(getTaskDueDate())}`;
  if(!getRoomRequireOnline()){
    document.getElementById('availSection').style.display='none';
    document.getElementById('winnerSub').textContent='🎯 ¡Fue seleccionado!';
    document.getElementById('winnerDate').textContent='Asignado automáticamente ✓';
    if(isRoomAdmin || canCurrentUserSpin()){
      setTimeout(()=>autoConfirmWinner(m), 800);
    }
    return;
  }
  document.getElementById('availSection').style.display=_iW?'block':'none';
  if(_iW){
    const q=document.querySelector('#availSection p');
    if(q) q.textContent=currentRoomData?.purpose?`¿Puedes cumplir con "${currentRoomData.purpose}"?`:'¿Puedes cumplir con la tarea asignada?';
  }
}


async function autoConfirmWinner(winner){
  stopBgMusic();
  if(!winner || !currentRoomId) return;
  // Guard: only the person who triggered the spin should write to history
  // Use _currentSpinData — only set for the spinner before Firebase write
  if(!_currentSpinData) return;
  // Extra guard: check if already written for today's facilitation date
  const tmrw = getTaskDueDate();
  const alreadyWritten = state.history.find(h =>
    !h.reverted &&
    h.facilitationDate === tmrw &&
    h.memberId === winner.id
  );
  if(alreadyWritten) return;
  const availDate = availableAgainDate(tmrw);
  await fbAdd('history/'+currentRoomId, {
    memberId: winner.id,
    memberName: winner.name,
    memberEmoji: winner.emoji,
    memberImage: winner.image,
    memberColor: winner.color,
    sortDate: today(),
    facilitationDate: tmrw,
    purpose: currentRoomData?.purpose||null,
    type: 'assigned',
    reverted: false,
    dateLabel: fmtDate(tmrw),
    autoAssigned: true,
    createdAt: Date.now()
  });
  currentWinner = null;
  const msg = document.getElementById('confirmedMsg');
  const _fd = getRoomFreeDays();
  msg.style.cssText='display:block;text-align:center;padding:10px 12px;background:rgba(16,185,129,.1);border-radius:8px;font-size:12px;color:var(--success);margin-top:10px;line-height:1.6;';
  msg.innerHTML=`✓ <strong style="color:white">${winner.name}</strong> fue asignado para el ${fmtDate(tmrw)}.${currentRoomData?.purpose?' Para: <em>'+currentRoomData.purpose+'</em>':''}<br>${_fd>0?`No participará los próximos <strong style="color:white">${_fd} día${_fd!==1?'s':''}</strong>. Volverá el <strong style="color:white">${fmtDate(availDate)}</strong>.`:'Puede participar en el próximo sorteo.'}`;
  showToast(`🔒 ${winner.name} fue asignado automáticamente.`);
  // Reset participant selector for next spin
  _manualParticipants = null;
  refreshLockState();
}
window.autoConfirmWinner = autoConfirmWinner;
async function confirmFacilitator(){
  if(!currentWinner)return;
  const m=currentWinner,tmrw=getTaskDueDate(),availDate=availableAgainDate(tmrw);
  await fbAdd('history/'+currentRoomId,{memberId:m.id,memberName:m.name,memberEmoji:m.emoji,memberImage:m.image,memberColor:m.color,sortDate:today(),facilitationDate:tmrw,purpose:currentRoomData?.purpose||null,type:'assigned',reverted:false,dateLabel:fmtDate(tmrw)});
  currentWinner=null;document.getElementById('availSection').style.display='none';
  const msg=document.getElementById('confirmedMsg');
  msg.style.cssText='display:block;text-align:center;padding:10px 12px;background:rgba(16,185,129,.1);border-radius:8px;font-size:12px;color:var(--success);margin-top:10px;line-height:1.6;';
  const _fd=getRoomFreeDays();
  msg.innerHTML=`✓ <strong style="color:white">${m.name}</strong> fue seleccionado el ${fmtDate(tmrw)}.${currentRoomData?.purpose?' Para: <em>'+currentRoomData.purpose+'</em>':''}<br>${_fd>0?`No participará los próximos <strong style="color:white">${_fd} día${_fd!==1?'s':''}</strong>. Volverá al sorteo el <strong style="color:white">${fmtDate(availDate)}</strong>.`:'Puede participar en el próximo sorteo.'}`;
  showToast(`🔒 Sorteo cerrado. ${m.name} fue seleccionado.`);
}
window.confirmFacilitator=confirmFacilitator;

async function declineFacilitator(){
  if(!currentWinner)return;
  const m=currentWinner;
  await fbAdd('history/'+currentRoomId,{memberId:m.id,memberName:m.name,memberEmoji:m.emoji,memberImage:m.image,memberColor:m.color,sortDate:today(),facilitationDate:getTaskDueDate(),type:'unavailable',reverted:false,dateLabel:fmtDate(tomorrow())});
  currentWinner=null;document.getElementById('availSection').style.display='none';document.getElementById('winnerCard').classList.remove('show');
  const msg=document.getElementById('confirmedMsg');
  msg.style.cssText='display:block;text-align:center;padding:10px;background:rgba(239,68,68,.1);border-radius:8px;font-size:12px;color:var(--danger);margin-top:10px;';
  msg.textContent=`${m.name} no puede mañana. Girando de nuevo...`;
  setTimeout(()=>{msg.style.display='none';if(getEligible().length>=getRoomMinParticipants())spinRoulette();else showToast('🤖 Sin suficientes elegibles en línea.');},1600);
}
window.declineFacilitator=declineFacilitator;

async function revertAssignment(fbKey){
  const entry=state.history.find(h=>h.fbKey===fbKey);if(!entry)return;
  await fbUpdate('history/'+currentRoomId+'/'+fbKey,{reverted:true});
  // Reset ALL spin state
  spinning=false;
  _currentSpinData=null;
  _manualParticipants=null;
  _wheelWinnerFbKey=null;
  _wheelLastEligible=null;
  currentWinner=null;
  document.getElementById('winnerCard').classList.remove('show');
  document.getElementById('confirmedMsg').style.display='none';
  document.getElementById('availSection').style.display='none';
  // Re-enable spin button immediately
  const sb=document.getElementById('spinBtn');
  if(sb){sb.disabled=false;sb.style.opacity='1';}
  drawWheel(currentAngle);
  // Reset game UI for current mode
  const gm=getRoomGameMode();
  const eligible=getEligible();
  setTimeout(()=>{
    switchGameUI(gm);
    if(gm==='cartas') initCardsPile(eligible);
    else if(gm==='slots') renderSlotsReels(eligible);
    else if(gm==='bomba'){
      const bc=document.getElementById('bombCircle');
      const bt=document.getElementById('bombTimer');
      if(bc){bc.classList.remove('danger');bc.style.background='';}
      if(bt) bt.textContent='8';
      const bp=document.getElementById('bombParticipants');
      if(bp) bp.innerHTML='';
    }
    refreshLockState();
  },100);
  showToast(`↩ Selección de ${entry.memberName} revertida. Sorteo disponible nuevamente.`);
}
window.revertAssignment=revertAssignment;

// ===== RENDERS =====
function renderMemberStatus(){
  const list=document.getElementById('memberStatusList');if(!list)return;
  if(!state.members.length){list.innerHTML='<div style="font-size:12px;color:var(--text3);padding:6px 0">Agrega integrantes primero</div>';return;}
  const _rfd=getRoomFreeDays();
  const SL={facilitating_today:{label:'Asignado hoy',cls:'badge-today'},assigned_tomorrow:{label:'Asignado próximo',cls:'badge-tmrw'},eligible:{label:'Elegible',cls:'badge-eligible'},unavailable_tomorrow:{label:'No disponible',cls:'badge-unavail'},offline:{label:'Desconectado',cls:'badge-offline'}};
  for(let i=1;i<=_rfd;i++) SL['free_day'+i]={label:_rfd===1?'Día libre':('Día libre '+i+' de '+_rfd),cls:'badge-free1'};
  list.innerHTML=state.members.map(m=>{
    const st=getMemberStatus(m.id,m.fbKey),sl=SL[st]||SL.eligible;
    const stBase=getMemberStatusBase(m.id,m.fbKey); // status ignoring online
    const online=isMemberOnline(m.fbKey);
    const av=m.image?`<div class="member-avatar-sm"><img src="${m.image}" alt="${m.name}">${online?'<div class="online-dot"></div>':'<div class="offline-dot"></div>'}</div>`:`<div class="member-avatar-sm" style="background:${m.color||'#6c63ff'}">${m.emoji||'👤'}${online?'<div class="online-dot"></div>':'<div class="offline-dot"></div>'}</div>`;
    // Build badge(s): assignment badge + connection badge if offline
    let badges = '';
    if(!online && stBase !== 'eligible' && stBase !== 'offline'){
      // Has assignment AND is offline → show both
      const slBase = SL[stBase]||SL.eligible;
      badges = `<span class="status-badge ${slBase.cls}">${slBase.label}</span><span class="status-badge badge-offline" style="margin-left:3px;">Desconectado</span>`;
    } else {
      badges = `<span class="status-badge ${sl.cls}">${sl.label}</span>`;
    }
    return `<div class="member-row">${av}<div class="member-name-sm">${m.name}</div>${badges}</div>`;
  }).join('');
  const el=getEligible(),conf=getTodayConfirmed(),onlineCount=state.members.filter(m=>isMemberOnline(m.fbKey)).length;
  const _minP=getRoomMinParticipants();
  const _reqOnline=getRoomRequireOnline();
  if(conf) document.getElementById('spinCountTxt').textContent='Sorteo de hoy cerrado ✓';
  else if(onlineCount<_minP) document.getElementById('spinCountTxt').textContent=_reqOnline?`${onlineCount} en línea — necesitás ${_minP-onlineCount} más`:`${onlineCount} de ${state.members.length} — necesitás ${_minP-onlineCount} más`;
  else if(el.length<_minP) document.getElementById('spinCountTxt').textContent=`${el.length} elegibles — mínimo ${_minP}`;
  else document.getElementById('spinCountTxt').textContent=_reqOnline?`${el.length} de ${state.members.length} elegibles en línea`:`${el.length} de ${state.members.length} elegibles`;
  refreshLockState();
}

function renderTeam(){
  const grid=document.getElementById('teamGrid');if(!grid)return;
  if(!state.members.length){grid.innerHTML='<div class="empty-state" style="grid-column:1/-1"><div class="big">👥</div>Sin integrantes aún</div>';return;}
  const tc={};state.history.filter(h=>h.type==='assigned'&&!h.reverted).forEach(h=>{tc[h.memberId]=(tc[h.memberId]||0)+1;});
  grid.innerHTML=state.members.map(m=>{
    const times=tc[m.id]||0,online=isMemberOnline(m.fbKey);
    const av=m.image?`<div class="team-avatar"><img src="${m.image}" alt="${m.name}"><div class="${online?'team-online-dot':'team-offline-dot'}"></div></div>`:`<div class="team-avatar" style="background:${m.color||'#6c63ff'};font-size:20px">${m.emoji||'👤'}<div class="${online?'team-online-dot':'team-offline-dot'}"></div></div>`;
    // Solo admin puede eliminar
    const delBtn=isRoomAdmin?`<button class="remove-btn" onclick="removeMember('${m.fbKey}')">×</button>`:'';
    return `<div class="team-card${online?'':' offline-card'}">${delBtn}${av}<div class="team-name">${m.name}</div><div class="team-status-lbl${online?'':' off'}">${online?'● En línea':'○ Desconectado'}</div>${currentRoomData?.type!=='convocatoria'?`<div class="team-times">${times} vez${times!==1?'es':''} seleccionado</div>`:''}</div>`;
  }).join('');
  updateInviteUrl();
}

let _histShown=5;
function renderHistory(){ _histShown=5; renderHistoryPage(); }

function renderHistoryPage(){
  const list=document.getElementById('historyList'),empty=document.getElementById('historyEmpty');
  // state.history already sorted by createdAt DESC from hFn
  const hist=state.history.filter(h=>h.type==='assigned');
  if(!hist.length){list.innerHTML='';empty.style.display='block';return;}
  empty.style.display='none';
  const tmrw=tomorrow(),tod=today();
  const shown=hist.slice(0,_histShown);
  const remaining=hist.length-_histShown;
  list.innerHTML=shown.map(h=>{
    const av=h.memberImage?`<div class="hist-avatar"><img src="${h.memberImage}" alt="${h.memberName}"></div>`:`<div class="hist-avatar" style="background:${h.memberColor||'#6c63ff'}">${h.memberEmoji||'👤'}</div>`;
    let badgeCls,badgeTxt;
    if(h.reverted){badgeCls='hist-rev';badgeTxt='Revertido';}
    else if(h.facilitationDate===tod){badgeCls='hist-today';badgeTxt='Hoy';}
    else if(h.facilitationDate===tmrw){badgeCls='hist-tmrw';badgeTxt='Próximo';}
    else if(h.facilitationDate<tod){badgeCls='hist-done';badgeTxt='Completado';}
    else{badgeCls='hist-tmrw';badgeTxt='Próximo';}
    const canRevert=isRoomAdmin&&!h.reverted&&h.sortDate===today();
    const revertBtn=canRevert?`<button class="revert-btn" onclick="revertAssignment('${h.fbKey}')">↩ Revertir</button>`:'';
    return `<div class="history-item${h.reverted?' reverted':''}">
      ${av}<div class="hist-info"><div class="hist-name">${h.memberName}${h.reverted?' <span style="font-size:10px;color:var(--text3)">(revertido)</span>':''}</div>
      <div class="hist-date">Fecha: ${h.dateLabel||h.facilitationDate} · Sorteado: ${fmtDate(h.sortDate)}</div></div>
      <div class="hist-right"><span class="hist-badge ${badgeCls}">${badgeTxt}</span>${revertBtn}</div>
    </div>`;
  }).join('')+(remaining>0?`<div style="text-align:center;padding:14px 0;"><button onclick="loadMoreHistory()" style="padding:8px 24px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--text2);font-size:12px;cursor:pointer;transition:all .2s;">Mostrar más (${remaining} restante${remaining!==1?'s':''})</button></div>`:'');
}
window.renderHistoryPage=renderHistoryPage;
function loadMoreHistory(){ _histShown+=5; renderHistoryPage(); }
window.loadMoreHistory=loadMoreHistory;

// ===== TABS / INVITE =====
function switchItab(tab,el){
  document.querySelectorAll('.itab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.itab-content').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');document.getElementById('itab-'+tab).classList.add('active');
  if(tab==='qr'){
    const url=getInviteUrl(currentRoomId);
    generateQROnCanvas(document.getElementById('qrCanvas'),url);
    const qrIn=document.getElementById('appQrUrlInput');if(qrIn)qrIn.value=url;
  }
}
window.switchItab=switchItab;
function copyInvite(){const url=getInviteUrl(currentRoomId);if(navigator.clipboard)navigator.clipboard.writeText(url).then(()=>showToast('🔗 Link copiado'));else prompt('Copia este link:',url);}
window.copyInvite=copyInvite;
function downloadQR(){const c=document.getElementById('qrCanvas');if(!c)return;const a=document.createElement('a');a.download='turnup-qr.png';a.href=c.toDataURL();a.click();}
window.downloadQR=downloadQR;

// ===== MODAL MIEMBRO =====
let pendingAvatarData=null;
let modalSelectedEmoji=null;
function openModal(){
  pendingAvatarData=null;
  modalSelectedEmoji=null;
  document.getElementById('memberName').value='';
  document.getElementById('avatarPreview').innerHTML='📷';
  document.getElementById('modalRemovePhoto').style.display='none';
  onPhotoRemoved('modal');
  setTimeout(()=>buildEmojiPicker('modalEmojiGrid'), 100);
  document.getElementById('modalOverlay').classList.add('show');
}
function closeModal(){
  document.getElementById('modalOverlay').classList.remove('show');
  document.getElementById('memberName').value='';
  document.getElementById('avatarPreview').innerHTML='📷';
  pendingAvatarData=null; modalSelectedEmoji=null;
}
function closeModalOutside(e){if(e.target===document.getElementById('modalOverlay'))closeModal();}
function previewAvatar(e){
  const f=e.target.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=ev=>{
    pendingAvatarData=ev.target.result;
    modalSelectedEmoji=null;
    document.getElementById('avatarPreview').innerHTML=`<img src="${pendingAvatarData}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    document.getElementById('modalRemovePhoto').style.display='inline';
    onPhotoLoaded('modal');
  };
  r.readAsDataURL(f);
}
window.openModal=openModal;

function removeModalPhoto(){
  pendingAvatarData=null;
  document.getElementById('avatarPreview').innerHTML='📷';
  document.getElementById('avatarFile').value='';
  document.getElementById('modalRemovePhoto').style.display='none';
  onPhotoRemoved('modal');
}
window.removeModalPhoto=removeModalPhoto;
window.closeModal=closeModal;window.closeModalOutside=closeModalOutside;window.previewAvatar=previewAvatar;
const EMOJIS=['👩‍💻','👨‍💼','👩‍🔬','👨‍🚀','👩‍🎨','🧑‍💻','👩‍🏫','👨‍🎤','🧙','👩‍🔧'];
const COLORS=['#6c63ff','#f59e0b','#10b981','#ef4444','#a78bfa','#06b6d4','#f97316','#ec4899'];
async function saveMember(){
  const name=document.getElementById('memberName').value.trim();if(!name){showToast('Ingresa un nombre');return;}
  const dup=state.members.find(m=>m.name.trim().toLowerCase()===name.toLowerCase());
  if(dup){showToast(`⚠ Ya existe "${dup.name}" en esta sala`);return;}
  const idx=state.members.length;
  const finalEmoji = pendingAvatarData ? null : (modalSelectedEmoji || null);
  await fbAdd('members/'+currentRoomId,{id:Date.now(),name,emoji:finalEmoji,color:COLORS[idx%COLORS.length],image:pendingAvatarData||null});
  closeModal();showToast(`✓ ${name} agregado.`);
}
async function removeMember(fbKey){
  if(!isRoomAdmin){showToast('Solo el admin puede eliminar integrantes');return;}
  await fbRemove('members/'+currentRoomId+'/'+fbKey);
  await fbRemove('presence/'+currentRoomId+'/'+fbKey);
  showToast('Integrante removido.');
}
window.saveMember=saveMember;window.removeMember=removeMember;

// ===== NAV =====
function showPage(page,el){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('page-'+page).classList.add('active');if(el)el.classList.add('active');
  if(page==='team')renderTeam();if(page==='history')renderHistory();
  if(page==='roulette'){renderMemberStatus();drawWheel(currentAngle);refreshLockState();}
  if(page==='convocatoria')renderConvocatoria();
}
window.showPage=showPage;

// ===== STARS / TOAST / CONFETTI =====
function createStars(){const c=document.getElementById('stars');c.innerHTML='';for(let i=0;i<70;i++){const s=document.createElement('div');s.className='star';const sz=Math.random()*2+.5;s.style.cssText=`width:${sz}px;height:${sz}px;left:${Math.random()*100}%;top:${Math.random()*100}%;animation-duration:${2+Math.random()*4}s;animation-delay:${Math.random()*4}s;`;c.appendChild(s);}}
function showToast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3200);}
function launchConfetti(){const cols=['#6c63ff','#f59e0b','#10b981','#a78bfa','#ffd700','#ef4444'];for(let i=0;i<50;i++)setTimeout(()=>{const p=document.createElement('div');p.className='confetti-piece';p.style.cssText=`left:${Math.random()*100}%;top:-10px;background:${cols[Math.floor(Math.random()*cols.length)]};transform:rotate(${Math.random()*360}deg);animation:fall ${1.5+Math.random()}s ease-in forwards;`;document.body.appendChild(p);setTimeout(()=>p.remove(),3000);},i*40);}
window.showToast=showToast;window.launchConfetti=launchConfetti;

// ===== DESCONEXIÓN =====
window.addEventListener('beforeunload',()=>{if(currentRoomId&&myMemberId)setPresence(currentRoomId,myMemberId,false);});