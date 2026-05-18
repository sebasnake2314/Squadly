/**
 * Lógica de negocio de modos de juego — sin dependencias de DOM ni animaciones.
 * Las animaciones y renders visuales siguen viviendo en index.html hasta la Fase 2.
 */
import { fbAdd } from './db'
import { db } from './firebase'
import { ref, set } from 'firebase/database'
import type { Member, HistoryEntry, GameMode, RoomMeta } from '../types'
import { today, fmtDate, getTaskDueDate } from '../utils/dates'

// ---- Selección de ganador ----

/** Elige un ganador al azar de la lista de miembros elegibles. */
export function pickRandomWinner(eligible: Member[]): Member | null {
  if (!eligible.length) return null
  return eligible[Math.floor(Math.random() * eligible.length)]
}

// ---- Parámetros para guardar un ganador ----

export interface SaveWinnerParams {
  roomId: string
  room: Pick<RoomMeta, 'dueMode' | 'dueCustomDate' | 'freeDays' | 'purpose'>
  winner: Member
  gameMode: GameMode
  history: HistoryEntry[]
  /** Si es true, se guarda automáticamente sin confirmación del usuario (modo bomba) */
  autoAssigned?: boolean
}

/**
 * Guarda el ganador del sorteo en Firebase.
 * Devuelve null si la entrada ya existe (idempotente).
 */
export async function saveWinner(params: SaveWinnerParams): Promise<string | null> {
  const facilitationDate = getTaskDueDate(params.room)

  // Idempotencia: no escribir si ya hay una entrada sin revertir para esa fecha
  const alreadyExists = params.history.find(
    h => !h.reverted && h.facilitationDate === facilitationDate && h.memberId === params.winner.id,
  )
  if (alreadyExists) return null

  const key = await fbAdd(`history/${params.roomId}`, {
    memberId:      params.winner.id,
    memberName:    params.winner.name,
    memberEmoji:   params.winner.emoji ?? null,
    memberImage:   params.winner.image ?? null,
    memberColor:   params.winner.color ?? null,
    sortDate:      today(),
    facilitationDate,
    purpose:       params.room.purpose ?? null,
    type:          'assigned',
    reverted:      false,
    dateLabel:     fmtDate(facilitationDate),
    autoAssigned:  params.autoAssigned ?? false,
    gameMode:      params.gameMode,
  })

  return key
}

/** Revierte una asignación marcándola como revertida en Firebase. */
export async function revertWinner(roomId: string, entryKey: string): Promise<void> {
  await set(ref(db, `history/${roomId}/${entryKey}/reverted`), true)
}

/** Señala el estado de spinning en Firebase (para sincronización en tiempo real). */
export async function setSpinningState(roomId: string, spinning: boolean): Promise<void> {
  await set(ref(db, `roulette/${roomId}`), { spinning }).catch(() => {})
}

// ---- No disponible ----

export interface SaveUnavailableParams {
  roomId: string
  room: Pick<RoomMeta, 'dueMode' | 'dueCustomDate' | 'purpose'>
  member: Member
  history: HistoryEntry[]
}

/**
 * Marca a un miembro como no disponible para la fecha de facilitacion.
 * Idempotente: no escribe si ya existe una entrada sin revertir.
 * Devuelve el fbKey creado o null si ya existia.
 */
export async function saveUnavailable(params: SaveUnavailableParams): Promise<string | null> {
  const facilitationDate = getTaskDueDate(params.room)

  const alreadyExists = params.history.find(
    h => !h.reverted && h.facilitationDate === facilitationDate
      && h.memberId === params.member.id && h.type === 'unavailable',
  )
  if (alreadyExists) return null

  const key = await fbAdd(`history/${params.roomId}`, {
    memberId:        params.member.id,
    memberName:      params.member.name,
    memberEmoji:     params.member.emoji ?? null,
    memberImage:     params.member.image ?? null,
    memberColor:     params.member.color ?? null,
    sortDate:        today(),
    facilitationDate,
    purpose:         params.room.purpose ?? null,
    type:            'unavailable',
    reverted:        false,
    dateLabel:       fmtDate(facilitationDate),
  })

  return key
}

/**
 * Revierte una entrada de no disponible (por fbKey).
 * Alias de revertWinner — misma operacion en Firebase.
 */
export { revertWinner as revertUnavailable }
