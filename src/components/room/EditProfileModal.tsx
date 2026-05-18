/**
 * EditProfileModal — el miembro edita su nombre y emoji.
 */
import { useState, useRef, useEffect } from 'react'
import { updateMember } from '../../services/rooms'
import type { Member } from '../../types'

const EMOJI_OPTIONS = [
  '👩‍💻','👨‍💼','👩‍🔬','👨‍🚀','👩‍🎨','🧑‍💻','👩‍🏫','👨‍🎤','🧙','👩‍🔧',
  '🦊','🐉','🦄','🤖','👾','🎸','🏆','🔥','💎','🌟',
]

interface Props {
  roomId: string
  member: Member
  onSaved: () => void
  onClose: () => void
}

export function EditProfileModal({ roomId, member, onSaved, onClose }: Props) {
  const [name, setName]   = useState(member.name)
  const [emoji, setEmoji] = useState(member.emoji ?? EMOJI_OPTIONS[0])
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus() }, [])
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError('Ingresa tu nombre'); return }
    setSaving(true)
    setError(null)
    try {
      await updateMember(roomId, member.fbKey, name.trim(), emoji)
      onSaved()
    } catch {
      setError('No se pudo guardar. Intentalo de nuevo.')
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 360 }}>
        <div className="modal-header">
          <h2 className="modal-title">Editar perfil</h2>
          <button className="modal-close" onClick={onClose} disabled={saving}>×</button>
        </div>
        <form className="modal-form" onSubmit={handleSave}>
          <label className="form-label">
            Tu nombre
            <input
              ref={inputRef}
              className="form-input"
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); setError(null) }}
              maxLength={30}
              disabled={saving}
            />
          </label>
          <div className="form-label">
            Emoji
            <div className="icon-grid" style={{ marginTop: 6 }}>
              {EMOJI_OPTIONS.map(em => (
                <button
                  key={em}
                  type="button"
                  className={`icon-btn ${emoji === em ? 'selected' : ''}`}
                  onClick={() => setEmoji(em)}
                  disabled={saving}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={saving || !name.trim()}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
