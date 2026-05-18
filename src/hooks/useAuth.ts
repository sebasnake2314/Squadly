import { useState, useEffect } from 'react'
import type { User } from 'firebase/auth'
import { subscribeToAuthChanges } from '../services/auth'

interface AuthState {
  user: User | null
  loading: boolean
}

/**
 * Suscripción reactiva al estado de autenticación de Firebase.
 * `loading` es true mientras se resuelve el estado inicial.
 */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ user: null, loading: true })

  useEffect(() => {
    const unsub = subscribeToAuthChanges(user => {
      setState({ user, loading: false })
    })
    return unsub
  }, [])

  return state
}
