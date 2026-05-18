/**
 * RoomConfigModal — configuracion de sala para el admin.
 * Se precarga con los valores actuales de roomData y llama a updateRoomConfig().
 */
import { useState } from 'react'
import { updateRoomConfig } from '../../services/rooms'
import type { GameMode, MusicType, DueMode, RoomMeta } from '../../types'

const GAME_MODES: { value: GameMode; label: string }[] = [
  { value: 'ruleta', label: 'Ruleta' },
  { value: 'cartas', label: 'Cartas' },
  { value: 'slots',  label: 'Slots'  },
  { value: 'bomba',  label: 'Bomba'  },
]

const MUSIC_TYPES: { value: MusicType; label: string }[] = [
  { value: 'none',     label: 'Sin musica' },
  { value: 'circus',   label: 'Circo'      },
  { value: '8bit',     label: '8-bit'      },
  { value: 'gameshow', label: 'Game Show'  },
  { value: 'hype',     label: 'Hype'       },
]

interface Props {
  ownerUid: string
  roomId: string
  roomData: RoomMeta
  onSaved: () => void
  onClose: () => void
}

export function RoomConfigModal({ ownerUid, roomId, roomData, onSaved, onClose }: Props) {
  const isConvocatoria = roomData.type === 'convocatoria'

  const [purpose,        setPurpose]        = useState(roomData.purpose ?? '')
  const [freeDays,       setFreeDays]       = useState(roomData.freeDays ?? 2)
  const [minPart,        setMinPart]        = useState(roomData.minParticipants ?? 2)
  const [requireOnline,  setRequireOnline]  = useState(roomData.requireOnline ?? false)
  const [dueMode,        setDueMode]        = useState<DueMode>(roomData.dueMode ?? 'tomorrow')
  const [gameMode,       setGameMode]       = useState<GameMode>(roomData.gameMode ?? 'ruleta')
  const [musicType,      setMusicType]      = useState<MusicType>(roomData.musicType ?? 'none')
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState<string | null>(null)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await updateRoomConfig({
        ownerUid,
        roomId,
        purpose: purpose.trim(),
        freeDays,
        minParticipants: minPart,
        requireOnline,
        dueMode,
        dueDays: 1,
        dueCustomDate: null,
        gameMode,
        musicType,
      })
      onSaved()
    } catch {
      setError('No se pudo guardar la configuracion.')
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-header">
          <h2 className="modal-title">Configurar sala</h2>
          <button className="modal-close" onClick={onClose} disabled={saving}>x</button>
        </div>

        <form className="modal-form" onSubmit={handleSave}>
          {/* Proposito */}
          <label className="form-label">
            Proposito de la sala
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

          {/* Solo para salas de sorteo */}
          {!isConvocatoria && (
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

              {/* Musica */}
              <div className="form-label">
                Musica de fondo
                <div className="toggle-group">
                  {MUSIC_TYPES.map(m => (
                    <button
                      key={m.value}
                      type="button"
                      className={`toggle-btn ${musicType === m.value ? 'active' : ''}`}
                      onClick={() => setMusicType(m.value)}
                      disabled={saving}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dias libres */}
              <div className="form-label">
                Dias libres tras facilitar
                <div className="number-row">
                  <button type="button" className="num-btn" onClick={() => setFreeDays(d => Math.max(0, d - 1))} disabled={saving}>-</button>
                  <span className="num-value">{freeDays} {freeDays === 1 ? 'dia' : 'dias'}</span>
                  <button type="button" className="num-btn" onClick={() => setFreeDays(d => Math.min(14, d + 1))} disabled={saving}>+</button>
                </div>
              </div>

              {/* Minimo participantes */}
              <div className="form-label">
                Minimo de participantes para sortear
                <div className="number-row">
                  <button type="button" className="num-btn" onClick={() => setMinPart(d => Math.max(2, d - 1))} disabled={saving}>-</button>
                  <span className="num-value">{minPart}</span>
                  <button type="button" className="num-btn" onClick={() => setMinPart(d => Math.min(20, d + 1))} disabled={saving}>+</button>
                </div>
              </div>

              {/* Asignacion para */}
              <div className="form-label">
                Asignacion para
                <div className="toggle-group">
                  <button
                    type="button"
                    className={`toggle-btn ${dueMode === 'tomorrow' ? 'active' : ''}`}
                    onClick={() => setDueMode('tomorrow')}
                    disabled={saving}
                  >Manana</button>
                  <button
                    type="button"
                    className={`toggle-btn ${dueMode === 'today' ? 'active' : ''}`}
                    onClick={() => setDueMode('today')}
                    disabled={saving}
                  >Hoy</button>
                </div>
              </div>

              {/* Require online */}
              <div className="form-label form-row">
                <span>Solo miembros en linea pueden ser sorteados</span>
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
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
