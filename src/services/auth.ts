/**
 * Servicio de autenticación.
 * Encapsula toda la interacción con Firebase Auth y el flujo de routing post-login.
 */
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth'
import { ref, get } from 'firebase/database'
import { auth, provider, microsoftProvider, db } from './firebase'

export type AuthChangeCallback = (user: User | null) => void

/** Suscribirse a cambios de sesión. Devuelve la función de unsubscribe. */
export function subscribeToAuthChanges(callback: AuthChangeCallback): () => void {
  return onAuthStateChanged(auth, callback)
}

/** Devuelve true si la app corre embebida en un iframe (ej. Microsoft Teams). */
export function isInTeams(): boolean {
  return window.parent !== window
}

/** Login con Google. Usa redirect si corre en Teams (popup bloqueado en iframes). */
export async function signInWithGoogle(): Promise<void> {
  if (isInTeams()) { await signInWithRedirect(auth, provider); return }
  await signInWithPopup(auth, provider)
}

/** Login con Microsoft. Usa redirect si corre en Teams. */
export async function signInWithMicrosoft(): Promise<void> {
  if (isInTeams()) { await signInWithRedirect(auth, microsoftProvider); return }
  await signInWithPopup(auth, microsoftProvider)
}

/** Completa el flow de redirect post-OAuth. Debe llamarse al iniciar la app. */
export async function handleRedirectResult(): Promise<void> {
  try { await getRedirectResult(auth) } catch { /* ignorar — no hay redirect pendiente */ }
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
