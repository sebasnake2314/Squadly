/**
 * UserAvatar — foto de la cuenta (Google/Microsoft) con respaldo a la inicial.
 * lh3.googleusercontent.com responde 403/429 a pedidos con Referer de otro origen
 * (ej. localhost), por eso se pide sin referrer y, si igual falla, se muestra la inicial.
 */
import { useState } from 'react'
import type { User } from 'firebase/auth'

export function UserAvatar({ user }: { user: Pick<User, 'photoURL' | 'displayName' | 'email'> }) {
  const [failed, setFailed] = useState(false)
  const initial = (user.displayName || user.email || '?').trim().charAt(0).toUpperCase()

  return (
    <div className="user-avatar">
      {user.photoURL && !failed ? (
        <img
          src={user.photoURL}
          alt={user.displayName ?? ''}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <div style={{
          width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--accent)', color: 'white', fontSize: 14, fontWeight: 700,
        }}>
          {initial}
        </div>
      )}
    </div>
  )
}
