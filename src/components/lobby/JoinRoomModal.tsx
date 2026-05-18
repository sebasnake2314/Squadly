/**
 * JoinRoomModal — flujo multi-paso para unirse a una sala.
 * code → choose (soy nuevo / ya tengo cuenta) → register | existing → entrar
 */
import { useState, useEffect, useRef } from 'react'
import type { User } from 'firebase/auth'
import { findRoomByCode, fetchRoomMeta, createMember, linkMemberToUser, fetchRoomMembers } from '../../services/rooms'
import { setLocalSession } from '../../services/auth'
import { setPresence } from '../../services/presence'
import type { Member } from '../../types'

interface RoomPreview {
  roomId: string
  name: string
  icon: string
}

type Step = 'code' | 'choose' | 'register' | 'existing'

const EMOJI_OPTIONS = ['👩‍💻','👨‍💼','👩‍🔬','👨‍🚀','👩‍🎨','🧑‍💻','👩‍🏫','👨‍🎤','🧙','👩‍🔧','🦊','🐉']

interface Props {
  user: User | null
  initialCode?: string
  onJoined: (roomId: string) => void
  onClose: () => void
}

export function JoinRoomModal({ user, initialCode, onJoined, onClose }: Props) {
  const [step, setStep] = useState<Step>('code')
  const [code, setCode] = useState(initialCode ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<RoomPreview | null>(null)
  const [roomMembers, setRoomMembers] = useState<Member[]>([])

  // Registro
  const [regName, setRegName] = useState('')
  const [regEmoji, setRegEmoji] = useState(EMOJI_OPTIONS[0])

  // Miembro existente
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)

  const codeInputRef = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { codeInputRef.current?.focus() }, [])
  useEffect(() => {
    if (step === 'register') nameInputRef.current?.focus()
  }, [step])

  // Auto-buscar si se abre con código pre-cargado
  useEffect(() => {
    if (initialCode && initialCode.length === 6) {
      handleSearch(initialCode)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSearch = async (searchCode?: string) => {
    const trimmed = (searchCode ?? code).trim().toUpperCase()
    if (trimmed.length < 6) { setError('Ingresa los 6 caracteres del codigo'); return }

    setLoading(true)
    setError(null)

    try {
      const roomId = await findRoomByCode(trimmed)
      if (!roomId) { setError('No se encontro ninguna sala con ese codigo'); setLoading(false); return }
      const meta = await fetchRoomMeta(roomId)
      if (!meta) { setError('La sala ya no existe'); setLoading(false); return }
      const members = await fetchRoomMembers(roomId)
      setPreview({ roomId, name: meta.name, icon: meta.icon ?? '🎰' })
      setRoomMembers(members)
      setStep('choose')
    } catch {
      setError('Error al buscar la sala. Intentalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async () => {
    if (!preview) return
    if (!regName.trim()) { setError('Ingresa tu nombre'); return }
    const nameTaken = roomMembers.some(m => m.name.trim().toLowerCase() === regName.trim().toLowerCase())
    if (nameTaken) { setError('Ya existe ese nombre en la sala'); return }

    setLoading(true)
    setError(null)
    try {
      const memberId = await createMember(preview.roomId, regName.trim(), roomMembers.length, regEmoji)
      setLocalSession(preview.roomId, memberId)
      if (user) await linkMemberToUser(preview.roomId, memberId, user.uid)
      await setPresence(preview.roomId, memberId, true)
      onJoined(preview.roomId)
    } catch {
      setError('No se pudo registrar. Intentalo de nuevo.')
      setLoading(false)
    }
  }

  const handleLoginExisting = async () => {
    if (!preview || !selectedMemberId) return
    setLoading(true)
    setError(null)
    try {
      setLocalSession(preview.roomId, selectedMemberId)
      if (user) await linkMemberToUser(preview.roomId, selectedMemberId, user.uid)
      await setPresence(preview.roomId, selectedMemberId, true)
      onJoined(preview.roomId)
    } catch {
      setError('No se pudo ingresar. Intentalo de nuevo.')
      setLoading(false)
    }
  }

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    setCode(val)
    setError(null)
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <h2 className="modal-title">Unirse a una sala</h2>
          <button className="modal-close" onClick={onClose} disabled={loading}>×</button>
        </div>

        {/* ── PASO: code ── */}
        {step === 'code' && (
          <form className="modal-form" onSubmit={e => { e.preventDefault(); handleSearch() }}>
            <label className="form-label">
              Codigo de sala
              <input
                ref={codeInputRef}
                className="form-input form-input--code"
                type="text"
                placeholder="ABC123"
                value={code}
                onChange={handleCodeChange}
                disabled={loading}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            {error && <div className="form-error">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>Cancelar</button>
              <button type="submit" className="btn-primary" disabled={loading || code.length < 6}>
                {loading ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
          </form>
        )}

        {/* ── PASO: choose ── */}
        {step === 'choose' && preview && (
          <div className="modal-form">
            <div className="join-preview-room" style={{ marginBottom: 20 }}>
              <span className="join-preview-icon">{preview.icon}</span>
              <span className="join-preview-name">{preview.name}</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
              {roomMembers.length === 0
                ? 'Sos el primero en unirte. Registrate para entrar.'
                : 'Ya hay miembros en esta sala. ¿Sos nuevo o ya tenias cuenta?'}
            </p>
            <div className="modal-actions" style={{ flexDirection: 'column', gap: 10 }}>
              <button
                className="btn-primary"
                style={{ width: '100%' }}
                onClick={() => { setStep('register'); setError(null) }}
              >
                Soy nuevo - registrarme
              </button>
              {roomMembers.length > 0 && (
                <button
                  className="btn-secondary"
                  style={{ width: '100%' }}
                  onClick={() => { setStep('existing'); setError(null) }}
                >
                  Ya tengo cuenta aqui
                </button>
              )}
              <button
                className="btn-secondary"
                style={{ width: '100%', fontSize: 12 }}
                onClick={() => { setStep('code'); setPreview(null) }}
              >
                ← Cambiar codigo
              </button>
            </div>
          </div>
        )}

        {/* ── PASO: register ── */}
        {step === 'register' && preview && (
          <div className="modal-form">
            <label className="form-label">
              Tu nombre en la sala
              <input
                ref={nameInputRef}
                className="form-input"
                type="text"
                placeholder="Ej: Ana"
                value={regName}
                onChange={e => { setRegName(e.target.value); setError(null) }}
                maxLength={30}
                disabled={loading}
              />
            </label>
            <div className="form-label">
              Emoji
              <div className="icon-grid" style={{ marginTop: 6 }}>
                {EMOJI_OPTIONS.map(em => (
                  <button
                    key={em}
                    type="button"
                    className={`icon-btn ${regEmoji === em ? 'selected' : ''}`}
                    onClick={() => setRegEmoji(em)}
                    disabled={loading}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>
            {error && <div className="form-error">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => { setStep('choose'); setError(null) }} disabled={loading}>
                ← Atras
              </button>
              <button type="button" className="btn-primary" onClick={handleRegister} disabled={loading || !regName.trim()}>
                {loading ? 'Registrando...' : 'Registrarme'}
              </button>
            </div>
          </div>
        )}

        {/* ── PASO: existing ── */}
        {step === 'existing' && preview && (
          <div className="modal-form">
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>
              Selecciona tu usuario:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, maxHeight: 220, overflowY: 'auto' }}>
              {roomMembers.map(m => (
                <button
                  key={m.fbKey}
                  type="button"
                  className={`member-select-btn${selectedMemberId === m.fbKey ? ' selected' : ''}`}
                  onClick={() => setSelectedMemberId(m.fbKey)}
                >
                  <span style={{ fontSize: 20 }}>{m.emoji ?? '👤'}</span>
                  {m.name}
                </button>
              ))}
            </div>
            {error && <div className="form-error">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => { setStep('choose'); setError(null) }} disabled={loading}>
                ← Atras
              </button>
              <button type="button" className="btn-primary" onClick={handleLoginExisting} disabled={loading || !selectedMemberId}>
                {loading ? 'Ingresando...' : 'Ingresar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
