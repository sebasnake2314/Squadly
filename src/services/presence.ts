/**
 * Servicio de presencia en tiempo real.
 * Maneja heartbeat, onDisconnect y la lógica de "offline after 90s".
 */
import { ref, set, onDisconnect } from 'firebase/database'
import { db } from './firebase'

const HEARTBEAT_INTERVAL_MS = 30_000
const OFFLINE_THRESHOLD_MS  = 90_000

let _heartbeatInterval: ReturnType<typeof setInterval> | null = null

/** Marca a un miembro como online u offline en Firebase. */
export async function setPresence(
  roomId: string,
  memberId: string,
  online: boolean,
): Promise<void> {
  if (!memberId || !roomId) return
  const presRef = ref(db, `presence/${roomId}/${memberId}`)

  if (online) {
    await set(presRef, { online: true, ts: Date.now() })
    // Firebase escribe esto automáticamente al desconectarse
    onDisconnect(presRef).set({ online: false, ts: Date.now() })
    startHeartbeat(roomId, memberId)
  } else {
    onDisconnect(presRef).cancel()
    stopHeartbeat()
    await set(presRef, { online: false, ts: Date.now() })
  }
}

function startHeartbeat(roomId: string, memberId: string): void {
  stopHeartbeat()
  _heartbeatInterval = setInterval(() => {
    if (roomId && memberId) {
      set(ref(db, `presence/${roomId}/${memberId}`), {
        online: true,
        ts: Date.now(),
      })
    }
  }, HEARTBEAT_INTERVAL_MS)
}

function stopHeartbeat(): void {
  if (_heartbeatInterval) {
    clearInterval(_heartbeatInterval)
    _heartbeatInterval = null
  }
}

/**
 * Determina si un miembro está online.
 * Considera offline si el timestamp tiene más de 90 s sin actualizar
 * (fallback por si onDisconnect tarda).
 */
export function isMemberOnline(
  presence: Record<string, { online: boolean; ts: number }>,
  memberId: string,
): boolean {
  const p = presence[memberId]
  if (!p) return false
  if (p.online === false) return false
  if (p.ts && Date.now() - p.ts > OFFLINE_THRESHOLD_MS) return false
  return true
}
