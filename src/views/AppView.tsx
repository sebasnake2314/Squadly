/**
 * AppView -- vista principal de una sala.
 * Header, PIN (admin), tabs Sorteo/Equipo/Historial, modal de config.
 */
import { useState, useEffect } from 'react'
import type { User } from 'firebase/auth'
import { signOut } from '../services/auth'
import { useRoom } from '../hooks/useRoom'
import { getLocalSession, resolveMemberId } from '../services/auth'
import { getMemberStatus, getMemberFreeDayIndex } from '../services/status'
import { isMemberOnline } from '../services/presence'
import { revertWinner, saveUnavailable, revertUnavailable } from '../services/game'
import { removeMember, createMember } from '../services/rooms'
import { setPresence } from '../services/presence'
import { fmtDate, getRoomFreeDays } from '../utils/dates'
import { GameTab } from '../components/game/GameTab'
import { RoomConfigModal } from '../components/room/RoomConfigModal'
import { EditProfileModal } from '../components/room/EditProfileModal'
import type { Member, HistoryEntry, MemberStatus, RoomMeta } from '../types'
import type { RoomContext } from '../services/status'

type Tab = 'ruleta' | 'equipo' | 'historial'

interface Props {
  roomId: string
  user: User
  isAdmin: boolean
  onBack: () => void
}

export function AppView({ roomId, user, isAdmin, onBack }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('equipo')
  const [showConfig, setShowConfig] = useState(false)
  const { members, history, presence, roomData, loading } = useRoom(roomId, user, isAdmin)
  const [myMemberId, setMyMemberId] = useState<string | null>(() => getLocalSession(roomId))

  // Resolver memberId desde memberLinks si no hay sesion local
  useEffect(() => {
    if (myMemberId) return
    resolveMemberId(roomId, user.uid).then(id => { if (id) setMyMemberId(id) })
  }, [roomId, user.uid, myMemberId])

  // Presencia propia: online al montar, offline al desmontar
  useEffect(() => {
    if (!myMemberId) return
    setPresence(roomId, myMemberId, true)
    return () => {
      setPresence(roomId, myMemberId, false)
    }
  }, [roomId, myMemberId])

  const ctx: RoomContext | null = roomData
    ? { room: roomData, members, history, presence, myMemberId, isRoomAdmin: isAdmin }
    : null

  if (loading || !roomData) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>Cargando sala…</div>
      </div>
    )
  }

  return (
    <div className="app-view">
      <AppHeader
        room={roomData}
        user={user}
        isAdmin={isAdmin}
        onBack={onBack}
        onOpenConfig={isAdmin ? () => setShowConfig(true) : undefined}
      />

      {isAdmin && roomData.pin && <PinBox pin={roomData.pin} />}

      <div className="app-tabs">
        {(['ruleta', 'equipo', 'historial'] as Tab[]).map(tab => (
          <button
            key={tab}
            className={`app-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'ruleta' ? (roomData.type === 'convocatoria' ? 'Convocatoria' : 'Sorteo') : tab === 'equipo' ? 'Equipo' : 'Historial'}
          </button>
        ))}
      </div>

      <div className="app-tab-content">
        {activeTab === 'ruleta' && ctx && <GameTab ctx={ctx} roomId={roomId} isAdmin={isAdmin} />}
        {activeTab === 'equipo' && ctx && <TeamTab ctx={ctx} presence={presence} roomId={roomId} isAdmin={isAdmin} />}
        {activeTab === 'historial' && ctx && (
          <HistoryTab ctx={ctx} roomId={roomId} isAdmin={isAdmin} />
        )}
      </div>

      {showConfig && isAdmin && (
        <RoomConfigModal
          ownerUid={user.uid}
          roomId={roomId}
          roomData={roomData}
          onSaved={() => setShowConfig(false)}
          onClose={() => setShowConfig(false)}
        />
      )}
    </div>
  )
}

// ----------------------------------------------------------------
// Header
// ----------------------------------------------------------------

function AppHeader({
  room, user, isAdmin, onBack, onOpenConfig,
}: {
  room: RoomMeta
  user: User
  isAdmin: boolean
  onBack: () => void
  onOpenConfig?: () => void
}) {
  return (
    <div className="app-header">
      <div className="app-header-left">
        <button className="back-btn" onClick={onBack}>Volver</button>
        <div className="app-room-info">
          <span className="app-room-icon">{room.icon ?? '🎰'}</span>
          <div>
            <div className="app-room-name">{room.name}</div>
            {room.purpose && <div className="app-room-purpose">{room.purpose}</div>}
          </div>
          {isAdmin && <span className="admin-badge-sm">Admin</span>}
        </div>
      </div>
      <div className="user-bar">
        {onOpenConfig && (
          <button className="config-btn" onClick={onOpenConfig} title="Configurar sala">
            Ajustes
          </button>
        )}
        {user.photoURL && (
          <div className="user-avatar">
            <img src={user.photoURL} alt={user.displayName ?? ''} />
          </div>
        )}
        <button className="logout-btn" onClick={() => signOut()}>Salir</button>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------
// PIN Box
// ----------------------------------------------------------------

function PinBox({ pin }: { pin: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(pin).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <div className="pin-box" onClick={copy} title="Copiar PIN">
      <span className="pin-label">PIN:</span>
      <span className="pin-value">{pin}</span>
      <span className="pin-copy">{copied ? 'Copiado' : 'Copiar'}</span>
    </div>
  )
}


// ----------------------------------------------------------------
// TeamTab
// ----------------------------------------------------------------

const TEAM_EMOJIS = ['\u{1F469}\u200D\u{1F4BB}','\u{1F468}\u200D\u{1F4BC}','\u{1F469}\u200D\u{1F52C}','\u{1F468}\u200D\u{1F680}','\u{1F469}\u200D\u{1F3A8}','\u{1F9D1}\u200D\u{1F4BB}','\u{1F469}\u200D\u{1F3EB}','\u{1F468}\u200D\u{1F3A4}','\u{1F9D9}','\u{1F469}\u200D\u{1F527}']

function TeamTab({ ctx, presence, roomId, isAdmin }: { ctx: RoomContext; presence: Record<string, { online: boolean; ts: number }>; roomId: string; isAdmin: boolean }) {
  const { members } = ctx
  const freeDays = getRoomFreeDays(ctx.room.freeDays)
  const isConvocatoria = ctx.room.type === 'convocatoria'

  // Conteo de veces seleccionado por member.id (solo assigned no revertidos)
  const timesSelected: Record<string, number> = {}
  ctx.history.filter(h => h.type === 'assigned' && !h.reverted).forEach(h => {
    timesSelected[h.memberId] = (timesSelected[h.memberId] ?? 0) + 1
  })

  const [addName, setAddName] = useState('')
  const [addEmoji, setAddEmoji] = useState('\u{1F469}\u200D\u{1F4BB}')
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingMember, setEditingMember] = useState<Member | null>(null)

  const handleAdd = async () => {
    if (!addName.trim()) { setAddError('Ingresa un nombre'); return }
    const nameTaken = members.some(m => m.name.trim().toLowerCase() === addName.trim().toLowerCase())
    if (nameTaken) { setAddError('Ya existe ese nombre'); return }
    setAddLoading(true)
    setAddError(null)
    try {
      await createMember(roomId, addName.trim(), members.length, addEmoji)
      setAddName('')
      setShowAddForm(false)
    } catch {
      setAddError('No se pudo agregar el miembro.')
    } finally {
      setAddLoading(false)
    }
  }

  const handleRemove = async (member: Member) => {
    if (!confirm(`Eliminar a ${member.name} de la sala?`)) return
    try {
      await removeMember(roomId, member.fbKey)
    } catch {
      alert('No se pudo eliminar el miembro.')
    }
  }

  return (
    <>
    <div className="team-tab">
      <div className="section-title">
        Equipo -- {members.length} {members.length === 1 ? 'miembro' : 'miembros'}
        {isAdmin && (
          <button
            className="add-member-btn"
            onClick={() => { setShowAddForm(v => !v); setAddError(null) }}
          >
            {showAddForm ? '−' : '+ Agregar'}
          </button>
        )}
      </div>

      {isAdmin && showAddForm && (
        <div className="add-member-form">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              className="form-input"
              style={{ width: 56, fontSize: 20, padding: '4px 2px', textAlign: 'center' }}
              value={addEmoji}
              onChange={e => setAddEmoji(e.target.value)}
              disabled={addLoading}
            >
              {TEAM_EMOJIS.map(em => <option key={em} value={em}>{em}</option>)}
            </select>
            <input
              className="form-input"
              style={{ flex: 1, minWidth: 120 }}
              type="text"
              placeholder="Nombre del miembro"
              value={addName}
              onChange={e => { setAddName(e.target.value); setAddError(null) }}
              maxLength={30}
              disabled={addLoading}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
            <button className="btn-primary" style={{ whiteSpace: 'nowrap' }} onClick={handleAdd} disabled={addLoading || !addName.trim()}>
              {addLoading ? '...' : 'Agregar'}
            </button>
          </div>
          {addError && <div className="form-error" style={{ marginTop: 6 }}>{addError}</div>}
        </div>
      )}

      <div className="team-list">
        {members.map(m => (
          <MemberRow
            key={m.fbKey}
            member={m}
            ctx={ctx}
            freeDays={freeDays}
            online={isMemberOnline(presence, m.fbKey)}
            isAdmin={isAdmin}
            isMyRow={m.fbKey === ctx.myMemberId}
            roomId={roomId}
            timesSelected={timesSelected[m.id] ?? 0}
            isConvocatoria={isConvocatoria}
            onRemove={() => handleRemove(m)}
            onEdit={() => setEditingMember(m)}
          />
        ))}
        {members.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--text3)', padding: '16px 0' }}>
            No hay miembros en esta sala todavia.
          </div>
        )}
      </div>
    </div>

    {editingMember && (
      <EditProfileModal
        roomId={roomId}
        member={editingMember}
        onSaved={() => setEditingMember(null)}
        onClose={() => setEditingMember(null)}
      />
    )}
    </>
  )
}

function MemberRow({ member, ctx, freeDays, online, isAdmin, isMyRow, roomId, timesSelected, isConvocatoria, onRemove, onEdit }: { member: Member; ctx: RoomContext; freeDays: number; online: boolean; isAdmin: boolean; isMyRow: boolean; roomId: string; timesSelected: number; isConvocatoria: boolean; onRemove: () => void; onEdit: () => void }) {
  const status = getMemberStatus(member.id, member.fbKey, ctx)
  const freeDayIdx = status.startsWith('free_day') ? getMemberFreeDayIndex(member.id, ctx) : null
  const isUnavailableTmr = status === 'unavailable_tomorrow'
  const canToggleUnavailable = (isMyRow || isAdmin) && !['facilitating_today','assigned_tomorrow','free_day1','free_day2'].some(s => status.startsWith(s))

  const handleToggleUnavailable = async () => {
    if (isUnavailableTmr) {
      // Revertir la entrada de no disponible
      const entry = ctx.history.find(
        h => !h.reverted && h.memberId === member.id && h.type === 'unavailable'
      )
      if (entry) await revertUnavailable(roomId, entry.fbKey)
    } else {
      await saveUnavailable({ roomId, room: ctx.room, member, history: ctx.history })
    }
  }

  return (
    <div className="member-row">
      <div className="member-avatar-wrap">
        <MemberAvatarSm member={member} />
        <span className={`presence-dot ${online ? 'online' : 'offline'}`} />
      </div>
      <div className="member-info">
        <div className="member-row-name">{member.name}</div>
        <StatusBadge status={status} freeDayIdx={freeDayIdx} freeDays={freeDays} />
        {!isConvocatoria && timesSelected > 0 && (
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>
            {timesSelected} {timesSelected === 1 ? 'vez seleccionado' : 'veces seleccionado'}
          </span>
        )}
      </div>
      {isMyRow && (
        <button className="member-edit-btn" onClick={onEdit} title="Editar mi perfil">✏</button>
      )}
      {canToggleUnavailable && (
        <button
          className={`member-unavail-btn${isUnavailableTmr ? ' active' : ''}`}
          onClick={handleToggleUnavailable}
          title={isUnavailableTmr ? 'Quitar no disponible' : 'Marcar no disponible mañana'}
        >
          {isUnavailableTmr ? '✓ Libre' : '— No disponible'}
        </button>
      )}
      {isAdmin && (
        <button className="member-remove-btn" onClick={onRemove} title="Eliminar miembro">×</button>
      )}
    </div>
  )
}

function MemberAvatarSm({ member }: { member: { name: string; emoji?: string | null; image?: string | null; color?: string | null } }) {
  if (member.image) {
    return (
      <div className="member-avatar-sm">
        <img src={member.image} alt={member.name} />
      </div>
    )
  }
  return (
    <div className="member-avatar-sm" style={{ background: member.color ?? '#6c63ff' }}>
      {member.emoji ?? '👤'}
    </div>
  )
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  facilitating_today:   { label: 'Facilita hoy',        cls: 'badge-facilitating' },
  assigned_tomorrow:    { label: 'Asignado manana',      cls: 'badge-assigned'     },
  unavailable_tomorrow: { label: 'No disponible manana', cls: 'badge-unavailable'  },
  eligible:             { label: 'Disponible',           cls: 'badge-eligible'     },
  offline:              { label: 'Sin conexion',         cls: 'badge-offline'      },
}

function StatusBadge({ status, freeDayIdx, freeDays }: { status: MemberStatus; freeDayIdx: number | null; freeDays: number }) {
  if (status.startsWith('free_day')) {
    const label = freeDayIdx != null
      ? (freeDays === 1 ? 'Dia libre' : `Dia libre ${freeDayIdx} de ${freeDays}`)
      : 'Dia libre'
    return <span className="status-badge badge-free">{label}</span>
  }
  const cfg = STATUS_MAP[status]
  if (!cfg) return null
  return <span className={`status-badge ${cfg.cls}`}>{cfg.label}</span>
}

// ----------------------------------------------------------------
// HistoryTab
// ----------------------------------------------------------------

function HistoryTab({ ctx, roomId, isAdmin }: { ctx: RoomContext; roomId: string; isAdmin: boolean }) {
  const { history } = ctx
  const [reverting, setReverting] = useState<string | null>(null)
  const [shown, setShown] = useState(5)

  // Solo entradas de tipo assigned (las unavailable son internas del sistema)
  const assigned = history.filter(h => h.type === 'assigned')
  const active   = assigned.filter(h => !h.reverted).length
  const visible  = assigned.slice(0, shown)
  const remaining = assigned.length - shown

  const handleRevert = async (entry: HistoryEntry) => {
    if (!isAdmin) return
    if (!confirm(`Revertir la asignacion de ${entry.memberName}?`)) return
    setReverting(entry.fbKey)
    try {
      await revertWinner(roomId, entry.fbKey)
    } finally {
      setReverting(null)
    }
  }

  return (
    <div className="history-tab">
      <div className="section-title">
        Historial -- {active} {active === 1 ? 'entrada activa' : 'entradas activas'}
      </div>
      {assigned.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--text3)', padding: '16px 0' }}>
          Todavia no hay historial en esta sala.
        </div>
      )}
      <div className="history-list">
        {visible.map(entry => (
          <HistoryEntryRow
            key={entry.fbKey}
            entry={entry}
            isAdmin={isAdmin}
            reverting={reverting === entry.fbKey}
            onRevert={() => handleRevert(entry)}
          />
        ))}
      </div>
      {remaining > 0 && (
        <button
          className="history-load-more"
          onClick={() => setShown(s => s + 5)}
        >
          Mostrar mas ({remaining} restante{remaining !== 1 ? 's' : ''})
        </button>
      )}
    </div>
  )
}

function HistoryEntryRow({
  entry, isAdmin, reverting, onRevert,
}: {
  entry: HistoryEntry
  isAdmin: boolean
  reverting: boolean
  onRevert: () => void
}) {
  const isAssigned = entry.type === 'assigned'
  const isReverted = entry.reverted
  return (
    <div className={`history-row ${isReverted ? 'reverted' : ''}`}>
      <div className="history-avatar">
        {entry.memberImage ? (
          <img src={entry.memberImage} alt={entry.memberName} />
        ) : (
          <div className="history-avatar-emoji" style={{ background: entry.memberColor ?? '#6c63ff' }}>
            {entry.memberEmoji ?? '👤'}
          </div>
        )}
      </div>
      <div className="history-info">
        <div className="history-member-name">{entry.memberName}</div>
        <div className="history-date">
          {isAssigned ? 'Sorteo' : 'No disponible'} -- {fmtDate(entry.facilitationDate)}
          {entry.purpose && <span className="history-purpose"> -- {entry.purpose}</span>}
        </div>
        {isReverted && <span className="history-reverted-label">Revertido</span>}
      </div>
      {isAdmin && !isReverted && isAssigned && (
        <button
          className="history-revert-btn"
          onClick={onRevert}
          disabled={reverting}
        >
          {reverting ? '...' : 'Revertir'}
        </button>
      )}
    </div>
  )
}
