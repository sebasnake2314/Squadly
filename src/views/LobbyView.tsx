import { useState } from 'react'
import type { User } from 'firebase/auth'
import { SquadlyLogo } from '../components/common/SquadlyLogo'
import { signOut } from '../services/auth'
import { deleteRoom } from '../services/rooms'
import { useRooms, type AdminRoom, type ParticipantRoom } from '../hooks/useRooms'
import { CreateRoomModal } from '../components/lobby/CreateRoomModal'
import { JoinRoomModal } from '../components/lobby/JoinRoomModal'

interface Props {
  user: User
  onEnterRoom: (roomId: string, isAdmin?: boolean) => void
  autoJoinCode?: string
}

type Modal = 'create' | 'join' | null

export function LobbyView({ user, onEnterRoom, autoJoinCode }: Props) {
  const { adminRooms, participantRooms, loading } = useRooms(user)
  const [modal, setModal] = useState<Modal>(autoJoinCode ? 'join' : null)

  const today = new Date().toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  const handleDeleteRoom = async (room: AdminRoom) => {
    if (!confirm(`Eliminar la sala "${room.name}"? Esta accion no se puede deshacer.`)) return
    try {
      await deleteRoom(user.uid, room.fbKey)
    } catch {
      alert('No se pudo eliminar la sala.')
    }
  }

  const handleInvite = (room: AdminRoom) => {
    const code = room.roomCode ?? room.pin  // roomCode es el codigo de 6 chars; pin es legacy fallback
    const url = `${window.location.origin}/app.html?join=${code}`
    navigator.clipboard.writeText(url).then(() => {
      alert(`Link copiado: ${url}`)
    }).catch(() => {
      prompt('Copia este link de invitacion:', url)
    })
  }

  const handleLeaveRoom = (pr: ParticipantRoom) => {
    if (!confirm(`Salir de "${pr.roomData.name}"?`)) return
    localStorage.removeItem(`dr_session_${pr.roomId}`)
    // Forzar re-render recargando la pagina (las participantRooms se recargan al montar)
    window.location.reload()
  }

  return (
    <div className="lobby">
      {/* Header */}
      <div className="lobby-header">
        <div className="lobby-logo">
          <div className="lobby-logo-icon"><SquadlyLogo size={28} /></div>
          <h1>Squad<span>ly</span></h1>
        </div>
        <div className="user-bar">
          {user.photoURL && (
            <div className="user-avatar">
              <img src={user.photoURL} alt={user.displayName ?? ''} />
            </div>
          )}
          <div className="user-name">{user.displayName ?? user.email}</div>
          <button className="logout-btn" onClick={() => signOut()}>Salir</button>
        </div>
      </div>

      {/* Mis salas */}
      <div className="rooms-section">
        <div className="rooms-section-title">Mis salas</div>
        {loading ? (
          <div style={{ fontSize: 12, color: 'var(--text3)', padding: '12px 0' }}>Cargando…</div>
        ) : (
          <div className="rooms-grid">
            {adminRooms.map(room => (
              <AdminRoomCard
                key={room.fbKey}
                room={room}
                onEnter={() => onEnterRoom(room.fbKey, true)}
                onInvite={() => handleInvite(room)}
                onDelete={() => handleDeleteRoom(room)}
              />
            ))}
            <NewRoomCard onClick={() => setModal('create')} />
          </div>
        )}
      </div>

      {/* Salas donde participo */}
      <div id="participantRoomsSection">
        <div className="rooms-section-title">Salas donde participo</div>
        <div className="rooms-grid">
          {participantRooms.map(pr => (
            <ParticipantRoomCard
              key={pr.roomId}
              room={pr}
              onEnter={() => onEnterRoom(pr.roomId, false)}
              onLeave={() => handleLeaveRoom(pr)}
            />
          ))}
          <JoinRoomCard onClick={() => setModal('join')} />
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', marginTop: 16 }}>
        {today}
      </div>

      {/* Modales */}
      {modal === 'create' && (
        <CreateRoomModal
          user={user}
          onCreated={roomId => {
            setModal(null)
            onEnterRoom(roomId, true)
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'join' && (
        <JoinRoomModal
          user={user}
          initialCode={autoJoinCode}
          onJoined={roomId => {
            setModal(null)
            onEnterRoom(roomId, false)
          }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

// ---- Sub-componentes ----

function AdminRoomCard({
  room,
  onEnter,
  onInvite,
  onDelete,
}: {
  room: AdminRoom
  onEnter: () => void
  onInvite: () => void
  onDelete: () => void
}) {
  return (
    <div
      className="room-card"
      role="button"
      tabIndex={0}
      onClick={onEnter}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onEnter()}
    >
      <div className="rc-actions">
        <button
          className="rc-invite-btn"
          title="Copiar link de invitacion"
          onClick={e => { e.stopPropagation(); onInvite() }}
        >🔗</button>
        <button
          className="rc-btn"
          title="Eliminar sala"
          onClick={e => { e.stopPropagation(); onDelete() }}
        >×</button>
      </div>
      <div className="rc-icon">{room.icon ?? '🎰'}</div>
      <div className="rc-name">{room.name}</div>
      <div className="rc-meta">
        <span className="rc-admin-badge">
          {room.type === 'convocatoria' ? '📅 Convocatoria' : '🎰 Sorteo'}
        </span>
        <span style={{ fontSize: 12, color: 'var(--accent2)', fontWeight: 600, padding: '2px 6px', background: 'rgba(108,99,255,.15)', borderRadius: 8 }}>
          Admin
        </span>
      </div>
      {room.purpose && (
        <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 5, lineHeight: 1.4 }}>
          {room.purpose}
        </div>
      )}
    </div>
  )
}

function ParticipantRoomCard({
  room,
  onEnter,
  onLeave,
}: {
  room: ParticipantRoom
  onEnter: () => void
  onLeave: () => void
}) {
  const { roomData, memberData } = room
  return (
    <div
      className="room-card"
      role="button"
      tabIndex={0}
      onClick={onEnter}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onEnter()}
    >
      <div className="rc-actions">
        <button
          className="rc-leave-btn"
          title="Salir de esta sala"
          onClick={e => { e.stopPropagation(); onLeave() }}
        >x</button>
      </div>
      <div className="rc-icon">{roomData.icon ?? '🎰'}</div>
      <div className="rc-name">{roomData.name}</div>
      <div className="rc-meta">
        <span className="rc-participant-badge">
          {roomData.type === 'convocatoria' ? 'Convocatoria' : 'Sorteo'}
        </span>
      </div>
      {memberData && (
        <div className="rc-member-chip">
          <MemberAvatar member={memberData} size={20} />
          <span className="rc-member-name">Como: {memberData.name}</span>
        </div>
      )}
    </div>
  )
}

function MemberAvatar({
  member,
  size,
}: {
  member: { name: string; emoji?: string | null; image?: string | null; color?: string | null }
  size: number
}) {
  if (member.image) {
    return (
      <div className="rc-member-av">
        <img src={member.image} alt={member.name} />
      </div>
    )
  }
  return (
    <div
      className="rc-member-av"
      style={{ background: member.color ?? '#6c63ff', fontSize: size * 0.5 }}
    >
      {member.emoji ?? '👤'}
    </div>
  )
}

function NewRoomCard({ onClick }: { onClick: () => void }) {
  return (
    <div
      className="new-room-card"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onClick()}
    >
      <span style={{ fontSize: 28 }}>+</span>
      <span>Nueva sala</span>
    </div>
  )
}

function JoinRoomCard({ onClick }: { onClick: () => void }) {
  return (
    <div
      className="join-room-card"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onClick()}
    >
      <span style={{ fontSize: 28 }}>🔑</span>
      <span>Unirse a una sala</span>
    </div>
  )
}
