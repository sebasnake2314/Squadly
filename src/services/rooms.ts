/**
 * Gestión de salas — operaciones CRUD sobre Firebase.
 * Sin dependencias de DOM. Recibe datos como parámetros y devuelve resultados.
 */
import { ref, set, push, update, remove, get } from 'firebase/database'
import { db } from './firebase'
import type { RoomMeta, GameMode, MusicType, RoomType, DueMode } from '../types'
import { today } from '../utils/dates'

// ---- Generadores ----

export function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000))
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sin caracteres confusos
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

// ---- Parámetros de creación ----

export interface CreateRoomParams {
  ownerUid: string
  name: string
  type: RoomType
  purpose?: string | null
  icon: string
  gameMode: GameMode
  musicType: MusicType
  requireOnline: boolean
  minParticipants: number
  freeDays: number
  dueMode: DueMode
  dueDays: number
  dueCustomDate?: string | null
}

/** Crea una sala nueva. Devuelve el roomId generado por Firebase. */
export async function createRoom(params: CreateRoomParams): Promise<string> {
  const pin = generatePin()
  const roomCode = generateRoomCode()

  const base = {
    name: params.name,
    type: params.type,
    purpose: params.purpose ?? null,
    icon: params.icon,
    pin,
    roomCode,
    ownerUid: params.ownerUid,
    createdAt: Date.now(),
  }

  const roomRef = await push(ref(db, `rooms/${params.ownerUid}`), {
    ...base,
    ...(params.type !== 'convocatoria' && {
      gameMode: params.gameMode,
      musicType: params.musicType,
      requireOnline: params.requireOnline,
      minParticipants: params.minParticipants,
      freeDays: params.freeDays,
      dueMode: params.dueMode,
      dueDays: params.dueDays,
      dueCustomDate: params.dueCustomDate ?? null,
    }),
  })

  const roomId = roomRef.key!

  await Promise.all([
    set(ref(db, `roomsMeta/${roomId}`), {
      ...base,
      ...(params.type !== 'convocatoria' && {
        gameMode: params.gameMode,
        musicType: params.musicType,
        requireOnline: params.requireOnline,
        minParticipants: params.minParticipants,
        freeDays: params.freeDays,
        dueMode: params.dueMode,
        dueDays: params.dueDays,
        dueCustomDate: params.dueCustomDate ?? null,
      }),
    }),
    set(ref(db, `roomsIndex/${roomId}`), params.ownerUid),
    set(ref(db, `roomCodeIndex/${roomCode}`), roomId),
  ])

  return roomId
}

// ---- Configuración ----

export interface UpdateRoomConfigParams {
  ownerUid: string
  roomId: string
  purpose: string
  minParticipants: number
  freeDays: number
  dueMode: DueMode
  dueDays: number
  dueCustomDate?: string | null
  requireOnline: boolean
  gameMode: GameMode
  musicType: MusicType
}

/** Actualiza la configuración de una sala existente. */
export async function updateRoomConfig(params: UpdateRoomConfigParams): Promise<void> {
  const updates = {
    purpose: params.purpose,
    minParticipants: params.minParticipants,
    freeDays: params.freeDays,
    dueMode: params.dueMode,
    dueDays: params.dueDays,
    dueCustomDate: params.dueCustomDate ?? null,
    requireOnline: params.requireOnline,
    gameMode: params.gameMode,
    musicType: params.musicType,
  }

  await Promise.all([
    update(ref(db, `rooms/${params.ownerUid}/${params.roomId}`), updates),
    update(ref(db, `roomsMeta/${params.roomId}`), updates),
  ])

  // Invalidar caché de modo de juego aleatorio del día
  localStorage.removeItem(`sq_gm_${params.roomId}_${today()}`)
  localStorage.removeItem(`sq_mu_${params.roomId}_${today()}`)
}

// ---- Eliminación ----

/** Borra una sala y todos sus datos asociados en Firebase. */
export async function deleteRoom(ownerUid: string, roomId: string): Promise<void> {
  await Promise.all([
    remove(ref(db, `rooms/${ownerUid}/${roomId}`)),
    remove(ref(db, `members/${roomId}`)),
    remove(ref(db, `history/${roomId}`)),
    remove(ref(db, `presence/${roomId}`)),
    remove(ref(db, `roomsMeta/${roomId}`)),
    remove(ref(db, `roomsIndex/${roomId}`)),
    remove(ref(db, `events/${roomId}`)),
    remove(ref(db, `attendance/${roomId}`)),
  ])
}

// ---- Lectura ----

/** Obtiene el metadata de una sala por roomId. Devuelve null si no existe. */
export async function fetchRoomMeta(roomId: string): Promise<(RoomMeta & { roomId: string }) | null> {
  const snap = await get(ref(db, `roomsMeta/${roomId}`))
  if (!snap.exists()) return null
  return { roomId, ...(snap.val() as RoomMeta) }
}

/** Resuelve el ownerUid de una sala legacy (vía roomsIndex). */
export async function resolveRoomOwner(roomId: string): Promise<string | null> {
  const snap = await get(ref(db, `roomsIndex/${roomId}`))
  return snap.exists() ? (snap.val() as string) : null
}

/** Busca un roomId por roomCode. */
export async function findRoomByCode(code: string): Promise<string | null> {
  const snap = await get(ref(db, `roomCodeIndex/${code.toUpperCase()}`))
  return snap.exists() ? (snap.val() as string) : null
}

// ---- Miembros ----

const MEMBER_EMOJIS = ['👩‍💻','👨‍💼','👩‍🔬','👨‍🚀','👩‍🎨','🧑‍💻','👩‍🏫','👨‍🎤','🧙','👩‍🔧']
const MEMBER_COLORS = ['#6c63ff','#f59e0b','#10b981','#ef4444','#a78bfa','#06b6d4','#f97316','#ec4899']

/**
 * Crea un miembro nuevo en la sala y devuelve su fbKey.
 * El caller es responsable de guardar en localStorage y memberLinks.
 */
export async function createMember(
  roomId: string,
  name: string,
  existingCount: number,
  emoji?: string | null,
): Promise<string> {
  const idx = existingCount
  const memberRef = await push(ref(db, `members/${roomId}`), {
    id: String(Date.now()),
    name,
    emoji: emoji ?? MEMBER_EMOJIS[idx % MEMBER_EMOJIS.length],
    color: MEMBER_COLORS[idx % MEMBER_COLORS.length],
    image: null,
    assignedCount: 0,
  })
  return memberRef.key!
}

/** Vincula un memberId existente con un usuario Google en memberLinks. */
export async function linkMemberToUser(
  roomId: string,
  memberId: string,
  uid: string,
): Promise<void> {
  await set(ref(db, `memberLinks/${uid}/${roomId}`), memberId)
}

/** Devuelve todos los miembros de una sala (lectura única, sin listener). */
export async function fetchRoomMembers(roomId: string): Promise<import('../types').Member[]> {
  const snap = await get(ref(db, `members/${roomId}`))
  if (!snap.exists()) return []
  return Object.entries(snap.val() as Record<string, Record<string, unknown>>).map(([fbKey, v]) => ({
    fbKey,
    id: String(v.id ?? Date.now()),
    name: v.name as string,
    emoji: (v.emoji as string | null) ?? null,
    color: (v.color as string | null) ?? null,
    image: (v.image as string | null) ?? null,
    assignedCount: (v.assignedCount as number) ?? 0,
  }))
}

/** Elimina un miembro de la sala (solo admin). */
export async function removeMember(roomId: string, memberId: string): Promise<void> {
  await remove(ref(db, `members/${roomId}/${memberId}`))
  await remove(ref(db, `presence/${roomId}/${memberId}`))
}

/** Actualiza nombre y emoji de un miembro existente. */
export async function updateMember(
  roomId: string,
  memberId: string,
  name: string,
  emoji: string,
): Promise<void> {
  const { fbUpdate } = await import('./db')
  await fbUpdate(`members/${roomId}/${memberId}`, { name, emoji })
}
