import { useState } from 'react'
import { SquadlyLogo } from '../components/common/SquadlyLogo'
import { signInWithGoogle, signInWithMicrosoft } from '../services/auth'
import { JoinRoomModal } from '../components/lobby/JoinRoomModal'

type Provider = 'google' | 'microsoft'

interface Props {
  onGuestJoin: (roomId: string) => void
  initialJoinCode?: string
}

export function AuthPage({ onGuestJoin, initialJoinCode }: Props) {
  const [loading, setLoading] = useState<Provider | null>(null)
  const [showJoin, setShowJoin] = useState(!!initialJoinCode)

  async function handleSignIn(provider: Provider) {
    setLoading(provider)
    try {
      if (provider === 'google') await signInWithGoogle()
      else await signInWithMicrosoft()
    } catch {
      setLoading(null)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <SquadlyLogo size={52} />
        </div>
        <h1>Squad<span>ly</span></h1>
        <p>Coordiná tu equipo: sorteos, convocatorias y más. Iniciá sesión para crear y gestionar tus salas.</p>

        <button className="google-btn" onClick={() => handleSignIn('google')} disabled={loading !== null}>
          <svg viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          {loading === 'google' ? 'Entrando...' : 'Continuar con Google'}
        </button>

        {/* Microsoft auth — habilitado cuando Azure AD esté configurado
        <div className="auth-divider">o</div>
        <button className="microsoft-btn" onClick={() => handleSignIn('microsoft')} disabled={loading !== null}>
          <svg viewBox="0 0 24 24">
            <path fill="#F25022" d="M1 1h10.5v10.5H1z" />
            <path fill="#7FBA00" d="M12.5 1H23v10.5H12.5z" />
            <path fill="#00A4EF" d="M1 12.5h10.5V23H1z" />
            <path fill="#FFB900" d="M12.5 12.5H23V23H12.5z" />
          </svg>
          {loading === 'microsoft' ? 'Entrando...' : 'Continuar con Microsoft'}
        </button>
        */}

        <div className="auth-divider">o</div>

        <button className="join-btn" onClick={() => setShowJoin(true)} disabled={loading !== null}>
          Unirse a una sala
        </button>

        <div className="auth-note">
          Para crear o administrar salas iniciá sesión con Google.
        </div>
      </div>

      {showJoin && (
        <JoinRoomModal
          user={null}
          initialCode={initialJoinCode}
          onJoined={(roomId) => { setShowJoin(false); onGuestJoin(roomId) }}
          onClose={() => setShowJoin(false)}
        />
      )}
    </div>
  )
}
