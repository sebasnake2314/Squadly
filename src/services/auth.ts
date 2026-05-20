/**
 * Servicio de autenticación.
 * Encapsula toda la interacción con Firebase Auth y el flujo de routing post-login.
 */
import {
  onAuthStateChanged,
  signInWithPopup,
  getRedirectResult,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth'
import { authentication as teamsAuth } from '@microsoft/teams-js'
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

/**
 * En Teams, window.open() no preserva window.opener, por lo que el flow de popup de
 * Firebase nunca puede enviar el token de vuelta. En su lugar usamos
 * authentication.authenticate() del SDK de Teams que abre un popup gestionado y usa
 * signInWithRedirect en auth-start.html (fuera de iframe, sin restricciones X-Frame-Options).
 */
function teamsAuthFlow(providerName: 'google' | 'microsoft'): Promise<void> {
  const url = `${window.location.origin}/auth-start.html?provider=${providerName}`
  return new Promise((resolve, reject) => {
    teamsAuth.authenticate({
      url,
      successCallback: () => resolve(),
      failureCallback: (reason: string) => reject(new Error(reason ?? 'auth failed')),
    })
  })
}

/** Login con Google. En Teams usa el flow de redirect gestionado por Teams SDK. */
export async function signInWithGoogle(): Promise<void> {
  if (isInTeams()) { await teamsAuthFlow('google'); return }
  await signInWithPopup(auth, provider)
}

/** Login con Microsoft. En Teams usa el flow de redirect gestionado por Teams SDK. */
export async function signInWithMicrosoft(): Promise<void> {
  if (isInTeams()) { await teamsAuthFlow('microsoft'); return }
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
