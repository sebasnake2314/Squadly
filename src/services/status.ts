/**
 * Lógica de estado de miembros — sin dependencias de DOM.
 * Todas las funciones reciben el estado como parámetro en lugar de leer globals.
 */
import type { Member, HistoryEntry, PresenceEntry, MemberStatus, RoomMeta } from '../types'
import { today, nextWorkDay, isWorkDay, freeDayIndex, getRoomFreeDays, getRoomWorkDays } from '../utils/dates'
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
  const next = nextWorkDay(tod, getRoomWorkDays(ctx.room.workDays)) // "mañana" = próximo día hábil
  const mine = ctx.history.filter(h => h.memberId === memberId && !h.reverted)

  if (mine.find(h => h.facilitationDate === tod && h.type === 'assigned'))
    return 'facilitating_today'

  if (mine.find(h => h.facilitationDate === next && h.type === 'assigned'))
    return 'assigned_tomorrow'

  if (mine.find(h => h.facilitationDate === next && h.type === 'unavailable'))
    return 'unavailable_tomorrow'

  const freeDay = getMemberFreeDayIndex(memberId, ctx)
  return freeDay ? `free_day${freeDay}` as MemberStatus : 'eligible'
}

/**
 * Devuelve el número de día libre (1-N) o null si no está en días libres.
 * Solo cuentan días hábiles.
 */
export function getMemberFreeDayIndex(
  memberId: string,
  ctx: Pick<RoomContext, 'history' | 'room'>,
): number | null {
  const freeDays = getRoomFreeDays(ctx.room.freeDays)
  if (freeDays === 0) return null
  const workDays = getRoomWorkDays(ctx.room.workDays)
  let best = 0
  for (const h of ctx.history) {
    if (h.memberId !== memberId || h.type !== 'assigned' || h.reverted) continue
    const k = freeDayIndex(h.facilitationDate, freeDays, workDays)
    if (k && (!best || k < best)) best = k
  }
  return best || null
}

/** ¿Hoy es día hábil en la sala? (en días no hábiles no se sortea) */
export function isTodayWorkDay(room: Pick<RoomMeta, 'workDays'>): boolean {
  return isWorkDay(today(), getRoomWorkDays(room.workDays))
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
