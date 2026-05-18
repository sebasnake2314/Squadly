/**
 * Lógica de estado de miembros — sin dependencias de DOM.
 * Todas las funciones reciben el estado como parámetro en lugar de leer globals.
 */
import type { Member, HistoryEntry, PresenceEntry, MemberStatus, RoomMeta } from '../types'
import { today, tomorrow, dateOffset, getRoomFreeDays } from '../utils/dates'
import { isMemberOnline } from './presence'

// ---- Tipos de contexto ----

export interface RoomContext {
  room: RoomMeta
  members: Member[]
  history: HistoryEntry[]
  presence: Record<string, PresenceEntry>
  myMemberId: string | null
  isRoomAdmin: boolean
}

// ---- Status principal ----

/**
 * Estado visible del miembro, considerando si está online.
 * Solo excluir offline si la sala tiene requireOnline explícitamente activado.
 * Rooms sin ese campo (undefined) se tratan como "no requerido".
 */
export function getMemberStatus(
  memberId: string,
  fbKey: string,
  ctx: RoomContext,
): MemberStatus {
  const requireOnline = ctx.room.requireOnline === true
  if (requireOnline && !isMemberOnline(ctx.presence, fbKey)) return 'offline'
  return getMemberStatusBase(memberId, ctx)
}

/**
 * Estado base del miembro, ignorando el check de online.
 * Usado para mostrar el estado de asignación independientemente de conexión.
 */
function getMemberStatusBase(
  memberId: string,
  ctx: Pick<RoomContext, 'history' | 'room'>,
): MemberStatus {
  const tod = today()
  const tmrw = tomorrow()
  const { history } = ctx
  const freeDays = getRoomFreeDays(ctx.room.freeDays)

  if (history.find(h => h.memberId === memberId && h.facilitationDate === tod && h.type === 'assigned' && !h.reverted))
    return 'facilitating_today'

  if (history.find(h => h.memberId === memberId && h.facilitationDate === tmrw && h.type === 'assigned' && !h.reverted))
    return 'assigned_tomorrow'

  if (history.find(h => h.memberId === memberId && h.facilitationDate === tmrw && h.type === 'unavailable' && !h.reverted))
    return 'unavailable_tomorrow'

  if (freeDays > 0) {
    const assignedDates = new Set<string>()
    for (const h of history) {
      if (h.memberId === memberId && h.type === 'assigned' && !h.reverted)
        assignedDates.add(h.facilitationDate)
    }
    for (let i = 1; i <= freeDays; i++) {
      if (assignedDates.has(dateOffset(-i))) return `free_day${i}` as MemberStatus
    }
  }

  return 'eligible'
}

/** Devuelve el número de día libre (1-N) o null si no está en días libres */
export function getMemberFreeDayIndex(
  memberId: string,
  ctx: Pick<RoomContext, 'history' | 'room'>,
): number | null {
  const freeDays = getRoomFreeDays(ctx.room.freeDays)
  if (freeDays === 0) return null
  const assignedDates = new Set<string>()
  for (const h of ctx.history) {
    if (h.memberId === memberId && h.type === 'assigned' && !h.reverted)
      assignedDates.add(h.facilitationDate)
  }
  for (let i = 1; i <= freeDays; i++) {
    if (assignedDates.has(dateOffset(-i))) return i
  }
  return null
}

/** Miembros elegibles para el sorteo */
export function getEligible(
  ctx: RoomContext,
  manualSelection: Set<string> | null,
): Member[] {
  const requireOnline = ctx.room.requireOnline === true

  if (!requireOnline && manualSelection !== null) {
    return ctx.members.filter(m => {
      if (!manualSelection.has(m.fbKey)) return false
      const st = getMemberStatusBase(m.id, ctx)
      return st !== 'facilitating_today' && st !== 'assigned_tomorrow'
    })
  }

  return ctx.members.filter(m => getMemberStatus(m.id, m.fbKey, ctx) === 'eligible')
}

/** Miembro asignado para facilitar hoy */
export function getTodayFacilitator(ctx: Pick<RoomContext, 'history' | 'members'>): Member | null {
  const h = ctx.history.find(e => e.type === 'assigned' && !e.reverted && e.facilitationDate === today())
  if (!h) return null
  return ctx.members.find(m => m.id === h.memberId) ?? null
}

/** ¿Puede el usuario actual hacer el sorteo? */
export function canCurrentUserSpin(ctx: RoomContext): boolean {
  if (ctx.isRoomAdmin) return true
  const facilitator = getTodayFacilitator(ctx)
  if (!facilitator) return true
  return ctx.myMemberId !== null && facilitator.fbKey === ctx.myMemberId
}
