import { useReducer, useEffect, useRef } from 'react'
import { ref, onValue, off } from 'firebase/database'
import type { User } from 'firebase/auth'
import { db } from '../services/firebase'
import type { Member, HistoryEntry, PresenceEntry, RoomMeta } from '../types'

export interface RoomState {
  members: Member[]
  history: HistoryEntry[]
  presence: Record<string, PresenceEntry>
  roomData: RoomMeta | null
  spinning: boolean
  loading: boolean
}

type RoomAction =
  | { type: 'SET_MEMBERS'; members: Member[] }
  | { type: 'SET_HISTORY'; history: HistoryEntry[] }
  | { type: 'SET_PRESENCE'; presence: Record<string, PresenceEntry> }
  | { type: 'SET_ROOM_DATA'; roomData: Partial<RoomMeta> }
  | { type: 'SET_SPINNING'; spinning: boolean }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'TICK_PRESENCE'; presence: Record<string, PresenceEntry> }

const initialState: RoomState = {
  members: [],
  history: [],
  presence: {},
  roomData: null,
  spinning: false,
  loading: true,
}

function roomReducer(state: RoomState, action: RoomAction): RoomState {
  switch (action.type) {
    case 'SET_MEMBERS':
      return { ...state, members: action.members, loading: false }
    case 'SET_HISTORY':
      return { ...state, history: action.history }
    case 'SET_PRESENCE':
      return { ...state, presence: action.presence }
    case 'SET_ROOM_DATA':
      return { ...state, roomData: { ...(state.roomData ?? {}), ...action.roomData } as RoomMeta }
    case 'SET_SPINNING':
      return { ...state, spinning: action.spinning }
    case 'SET_LOADING':
      return { ...state, loading: action.loading }
    case 'TICK_PRESENCE':
      return { ...state, presence: { ...action.presence } }
    default:
      return state
  }
}

/**
 * Suscripción en tiempo real al estado completo de una sala.
 * Equivalente a initRoomListeners() del monolito, sin efectos de DOM.
 */
export function useRoom(roomId: string | null, user: User | null, isAdmin: boolean): RoomState {
  const [state, dispatch] = useReducer(roomReducer, initialState)

  // Polling local para detectar timeouts de presencia sin esperar Firebase
  const presenceRef = useRef<Record<string, PresenceEntry>>({})
  useEffect(() => {
    const interval = setInterval(() => {
      if (Object.keys(presenceRef.current).length > 0) {
        dispatch({ type: 'TICK_PRESENCE', presence: presenceRef.current })
      }
    }, 15_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!roomId) return

    dispatch({ type: 'SET_LOADING', loading: true })
    const unsubs: (() => void)[] = []

    // ---- Miembros ----
    const membersRef = ref(db, `members/${roomId}`)
    const unsubMembers = onValue(membersRef, snap => {
      const d = snap.val()
      const members: Member[] = d
        ? Object.entries(d).map(([k, v]) => {
            const raw = v as Record<string, unknown>
            return { ...(raw as Omit<Member, 'fbKey'>), id: String(raw.id ?? k), fbKey: k }
          })
        : []
      dispatch({ type: 'SET_MEMBERS', members })
    }, () => dispatch({ type: 'SET_LOADING', loading: false }))
    unsubs.push(() => off(membersRef, 'value', unsubMembers))

    // ---- Historial ----
    const historyRef = ref(db, `history/${roomId}`)
    const unsubHistory = onValue(historyRef, snap => {
      const d = snap.val()
      const history: HistoryEntry[] = d
        ? Object.entries(d)
            .map(([k, v]) => {
              const raw = v as Record<string, unknown>
              return { ...(raw as Omit<HistoryEntry, 'fbKey'>), memberId: String(raw.memberId ?? ''), fbKey: k }
            })
            .sort((a, b) => ((b as any).createdAt || (b as any).ts || 0) - ((a as any).createdAt || (a as any).ts || 0))
        : []
      dispatch({ type: 'SET_HISTORY', history })
    })
    unsubs.push(() => off(historyRef, 'value', unsubHistory))

    // ---- Presencia ----
    const presDbRef = ref(db, `presence/${roomId}`)
    const unsubPresence = onValue(presDbRef, snap => {
      const presence: Record<string, PresenceEntry> = snap.val() ?? {}
      presenceRef.current = presence
      dispatch({ type: 'SET_PRESENCE', presence })
    })
    unsubs.push(() => off(presDbRef, 'value', unsubPresence))

    // ---- Config de la sala en tiempo real ----
    const cfgPath = isAdmin && user
      ? `rooms/${user.uid}/${roomId}`
      : `roomsMeta/${roomId}`
    const cfgRef = ref(db, cfgPath)
    const unsubConfig = onValue(cfgRef, snap => {
      const d = snap.val()
      if (!d) return
      dispatch({ type: 'SET_ROOM_DATA', roomData: d })
    })
    unsubs.push(() => off(cfgRef, 'value', unsubConfig))

    // ---- Estado del sorteo (spinning) ----
    const rouletteRef = ref(db, `roulette/${roomId}`)
    const unsubRoulette = onValue(rouletteRef, snap => {
      dispatch({ type: 'SET_SPINNING', spinning: Boolean(snap.val()?.spinning) })
    })
    unsubs.push(() => off(rouletteRef, 'value', unsubRoulette))

    return () => unsubs.forEach(fn => fn())
  }, [roomId, user, isAdmin])

  return state
}
