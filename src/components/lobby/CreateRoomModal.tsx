/**
 * CreateRoomModal — formulario para crear una sala nueva.
 * Llama a createRoom() del servicio rooms.ts y devuelve el roomId creado.
 */
import { useState, useRef, useEffect } from 'react'
import type { User } from 'firebase/auth'
import { createRoom } from '../../services/rooms'
import type { GameMode, MusicType, RoomType, DueMode } from '../../types'

const ROOM_ICONS = [
  '🎰','🎯','🎲','🚀','💡','⚡','🎸','🏆','🔥','💎',
  '🌟','👾','🤖','🦄','🐉','🎪','🎨','🎬','🏀','⚽',
  '🎮','📊','💻','🛸','🌈','🧩','🎭','🥁','🎤','🦊',
]

const GAME_MODES: { value: GameMode; label: string; icon: string }[] = [
  { value: 'ruleta',  label: 'Ruleta',  icon: '🎰' },
  { value: 'cartas',  label: 'Cartas',  icon: '🃏' },
  { value: 'slots',   label: 'Slots',   icon: '🎰' },
  { value: 'bomba',   label: 'Bomba',   icon: '💣' },
]

interface Props {
  user: User
  onCreated: (roomId: string) => void
  onClose: () => void
}

export function CreateRoomModal({ user, onCreated, onClose }: Props) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('🎰')
  const [type, setType] = useState<RoomType>('ruleta')
  const [gameMode, setGameMode] = useState<GameMode>('ruleta')
  const [freeDays, setFreeDays] = useState(2)
  const [minParticipants, setMinParticipants] = useState(2)
  const [requireOnline, setRequireOnline] = useState(false)
  const [dueMode, setDueMode] = useState<DueMode>('tomorrow')
  const [purpose, setPurpose] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nameInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { nameInputRef.current?.focus() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true)
    setError(null)
    try {
      const roomId = await createRoom({
        ownerUid: user.uid,
        name: name.trim(),
        icon,
        type,
        purpose: purpose.trim() || null,
        gameMode,
        musicType: 'none' as MusicType,
        requireOnline,
        minParticipants,
        freeDays,
        dueMode,
        dueDays: 1,
        dueCustomDate: null,
      })
      onCreated(roomId)
    } catch (err) {
      setError('No se pudo crear la sala. Intentalo de nuevo.')
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-header">
          <h2 className="modal-title">Nueva sala</h2>
          <button className="modal-close" onClick={onClose} disabled={saving}>×</button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          {/* Nombre */}
          <label className="form-label">
            Nombre de la sala
            <input
              ref={nameInputRef}
              className="form-input"
              type="text"
              placeholder="Ej: Daily del equipo"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={40}
              disabled={saving}
            />
          </label>

          {/* Propósito */}
          <label className="form-label">
            Propósito <span className="form-optional">(opcional)</span>
            <input
              className="form-input"
              type="text"
              placeholder="Ej: Daily standup de producto"
              value={purpose}
              onChange={e => setPurpose(e.target.value)}
              maxLength={80}
              disabled={saving}
            />
          </label>

          {/* Icono */}
          <div className="form-label">
            Ícono
            <div className="icon-grid">
              {ROOM_ICONS.map(em => (
                <button
                  key={em}
                  type="button"
                  className={`icon-btn ${icon === em ? 'selected' : ''}`}
                  onClick={() => setIcon(em)}
                  disabled={saving}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>

          {/* Tipo */}
          <div className="form-label">
            Tipo de sala
            <div className="toggle-group">
              <button
                type="button"
                className={`toggle-btn ${type === 'ruleta' ? 'active' : ''}`}
                onClick={() => setType('ruleta')}
                disabled={saving}
              >
                🎰 Sorteo
              </button>
              <button
                type="button"
                className={`toggle-btn ${type === 'convocatoria' ? 'active' : ''}`}
                onClick={() => setType('convocatoria')}
                disabled={saving}
              >
                📅 Convocatoria
              </button>
            </div>
          </div>

          {/* Opciones solo para sorteo */}
          {type === 'ruleta' && (
            <>
              {/* Modo de juego */}
              <div className="form-label">
                Modo de juego
                <div className="toggle-group">
                  {GAME_MODES.map(m => (
                    <button
                      key={m.value}
                      type="button"
                      className={`toggle-btn ${gameMode === m.value ? 'active' : ''}`}
                      onClick={() => setGameMode(m.value)}
                      disabled={saving}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Días libres */}
              <div className="form-label">
                Dias libres tras facilitar
                <div className="number-row">
                  <button type="button" className="num-btn" onClick={() => setFreeDays(d => Math.max(0, d - 1))} disabled={saving}>−</button>
                  <span className="num-value">{freeDays} {freeDays === 1 ? 'día' : 'días'}</span>
                  <button type="button" className="num-btn" onClick={() => setFreeDays(d => Math.min(14, d + 1))} disabled={saving}>+</button>
                </div>
              </div>

              {/* Mínimo participantes */}
              <div className="form-label">
                Mínimo de participantes para sortear
                <div className="number-row">
                  <button type="button" className="num-btn" onClick={() => setMinParticipants(d => Math.max(2, d - 1))} disabled={saving}>−</button>
                  <span className="num-value">{minParticipants}</span>
                  <button type="button" className="num-btn" onClick={() => setMinParticipants(d => Math.min(20, d + 1))} disabled={saving}>+</button>
                </div>
              </div>

              {/* Asignación para */}
              <div className="form-label">
                Asignación para
                <div className="toggle-group">
                  <button
                    type="button"
                    className={`toggle-btn ${dueMode === 'tomorrow' ? 'active' : ''}`}
                    onClick={() => setDueMode('tomorrow')}
                    disabled={saving}
                  >
                    Mañana
                  </button>
                  <button
                    type="button"
                    className={`toggle-btn ${dueMode === 'today' ? 'active' : ''}`}
                    onClick={() => setDueMode('today')}
                    disabled={saving}
                  >
                    Hoy
                  </button>
                </div>
              </div>

              {/* Require online */}
              <div className="form-label form-row">
                <span>Solo miembros en línea pueden ser sorteados</span>
                <button
                  type="button"
                  className={`toggle-switch ${requireOnline ? 'on' : ''}`}
                  onClick={() => setRequireOnline(v => !v)}
                  disabled={saving}
                  role="switch"
                  aria-checked={requireOnline}
                >
                  <span className="toggle-thumb" />
                </button>
              </div>
            </>
          )}

          {error && <div className="form-error">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={saving || !name.trim()}>
              {saving ? 'Creando...' : 'Crear sala'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
