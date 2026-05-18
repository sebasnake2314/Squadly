/**
 * App shell — maneja auth y ruteo entre vistas.
 */
import { useState, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import { AuthPage } from '../views/AuthPage'
import { LobbyView } from '../views/LobbyView'
import { AppView } from '../views/AppView'

interface RoomRoute {
  roomId: string
  isAdmin: boolean
}

export function App() {
  const { user, loading } = useAuth()
  const [roomRoute, setRoomRoute] = useState<RoomRoute | null>(null)

  // Detectar ?join=CODE en la URL para auto-abrir el flujo de union
  const autoJoinCode = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('join')?.toUpperCase() ?? undefined
  }, [])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>Cargando…</div>
      </div>
    )
  }

  if (!user) return <AuthPage />

  if (roomRoute) {
    return (
      <AppView
        roomId={roomRoute.roomId}
        user={user}
        isAdmin={roomRoute.isAdmin}
        onBack={() => setRoomRoute(null)}
      />
    )
  }

  return (
    <LobbyView
      user={user}
      autoJoinCode={autoJoinCode}
      onEnterRoom={(roomId, isAdmin = false) => setRoomRoute({ roomId, isAdmin })}
    />
  )
}
