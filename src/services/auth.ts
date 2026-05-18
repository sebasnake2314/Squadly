/**
 * Servicio de autenticación.
 * Encapsula toda la interacción con Firebase Auth y el flujo de routing post-login.
 */
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth'
import { ref, get } from 'firebase/database'
import { auth, provider, db } from './firebase'

export type AuthChangeCallback = (user: User | null) => void

/** Suscribirse a cambios de sesión. Devuelve la función de unsubscribe. */
export function subscribeToAuthChanges(callback: AuthChangeCallback): () => void {
  return onAuthStateChanged(auth, callback)
}

/** Login con Google popup. Lanza error si falla. */
export async function signInWithGoogle(): Promise<void> {
  await signInWithPopup(auth, provider)
}

/** Cerrar sesión. */
export async function signOut(): Promise<void> {
  await fbSignOut(auth)
}

/** Clave de sesión local para un miembro en una sala específica. */
export function getLocalSession(roomId: string): string | null {
  return localStorage.getItem(`dr_session_${roomId}`)
}

export function setLocalSession(roomId: string, memberId: string): void {
  localStorage.setItem(`dr_session_${roomId}`, memberId)
}

/**
 * Resuelve el memberId para un usuario en una sala.
 * Primero intenta localStorage; si no hay sesión local, consulta memberLinks en Firebase.
 */
export async function resolveMemberId(roomId: string, uid: string): Promise<string | null> {
  const local = getLocalSession(roomId)
  if (local) return local
  const snap = await get(ref(db, `memberLinks/${uid}/${roomId}`))
  return snap.exists() ? String(snap.val()) : null
}
