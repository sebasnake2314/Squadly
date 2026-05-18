// ============================================================
// Tipos del dominio — Squadly
// ============================================================

export type GameMode = 'ruleta' | 'cartas' | 'slots' | 'bomba'
export type MusicType = 'none' | 'circus' | '8bit' | 'gameshow' | 'hype'
export type RoomType = 'ruleta' | 'convocatoria'
export type DueMode = 'tomorrow' | 'today'
export type MemberStatus =
  | 'facilitating_today'
  | 'assigned_tomorrow'
  | 'unavailable_tomorrow'
  | `free_day${number}`
  | 'eligible'
  | 'offline'

// ---- Firebase raw shapes (lo que devuelve snapshot.val()) ----

export interface RoomMeta {
  name: string
  pin: string
  icon: string
  ownerUid: string
  purpose?: string | null
  gameMode?: GameMode
  musicType?: MusicType
  type?: RoomType
  dueMode?: DueMode
  dueCustomDate?: string | null
  freeDays?: number
  minParticipants?: number
  requireOnline?: boolean
  roomCode?: string
}

export interface Member {
  id: string
  name: string
  emoji?: string | null
  image?: string | null
  color?: string | null
  /** clave de Firebase (fbKey) - anhadida al mapear el snapshot */
  fbKey: string
}

export interface HistoryEntry {
  fbKey: string
  memberId: string
  memberName: string
  memberEmoji?: string | null
  memberImage?: string | null
  memberColor?: string | null
  facilitationDate: string   // YYYY-MM-DD
  sortDate: string           // YYYY-MM-DD
  dateLabel?: string
  purpose?: string | null
  type: 'assigned' | 'unavailable'
  reverted: boolean
  autoAssigned?: boolean
  gameMode?: GameMode
}

export interface PresenceEntry {
  online: boolean
  ts: number  // epoch ms
}

