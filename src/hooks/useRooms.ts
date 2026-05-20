import { useState, useEffect } from 'react'
import { ref, onValue, get } from 'firebase/database'
import type { User } from 'firebase/auth'
import { db } from '../services/firebase'
import type { RoomMeta } from '../types'

export interface AdminRoom extends RoomMeta {
  fbKey: string
}

export interface ParticipantRoom {
  roomId: string
  roomData: RoomMeta
  memberId: string
  memberData: {
    id: string
    name: string
    emoji?: string | null
    image?: string | null
    color?: string | null
  } | null
}

interface RoomsState {
  adminRooms: AdminRoom[]
  participantRooms: ParticipantRoom[]
  loading: boolean
  loadingParticipants: boolean
}

/**
 * Suscripción reactiva a las salas del usuario:
 * - adminRooms: salas donde el usuario es dueño (rooms/{uid})
 * - participantRooms: salas donde participa como invitado (localStorage + memberLinks)
 */
export function useRooms(user: User | null): RoomsState {
  const [state, setState] = useState<RoomsState>({
    adminRooms: [],
    participantRooms: [],
    loading: true,
    loadingParticipants: true,
  })

  // ---- Salas admin (suscripción en tiempo real) ----
  useEffect(() => {
    if (!user) {
      setState({ adminRooms: [], participantRooms: [], loading: false, loadingParticipants: false })
      return
    }

    const roomsRef = ref(db, `rooms/${user.uid}`)
    const unsub = onValue(roomsRef, snap => {
      const data = snap.val()
      const adminRooms: AdminRoom[] = data
        ? Object.entries(data).map(([k, v]) => ({ ...(v as RoomMeta), fbKey: k }))
        : []
      setState(prev => ({ ...prev, adminRooms, loading: false }))
      loadParticipantRooms(user, new Set(adminRooms.map(r => r.fbKey)), setState)
        .catch(() => setState(prev => ({ ...prev, participantRooms: [], loadingParticipants: false })))
    })

    return () => unsub()
  }, [user])

  return state
}

// ---- Salas donde participo (carga única) ----

async function loadParticipantRooms(
  user: User,
  adminRoomIds: Set<string>,
  setState: React.Dispatch<React.SetStateAction<RoomsState>>,
) {
  // Usuario autenticado: solo memberLinks (sigue la cuenta, no el navegador)
  // Guest: solo localStorage
  const linkedSnap = await get(ref(db, `memberLinks/${user.uid}`))
  const linkedRooms: Record<string, string> = linkedSnap.val() ?? {}
  const participantIds = Object.keys(linkedRooms).filter(id => !adminRoomIds.has(id))

  if (!participantIds.length) {
    setState(prev => ({ ...prev, participantRooms: [], loadingParticipants: false }))
    return
  }

  // 4. Cargar metadata de cada sala en paralelo
  const results = await Promise.all(
    participantIds.map(async roomId => {
      const memberId = linkedRooms[roomId]
      if (!memberId) return null

      const [roomSnap, memberSnap] = await Promise.all([
        get(ref(db, `roomsMeta/${roomId}`)),
        get(ref(db, `members/${roomId}/${memberId}`)),
      ])

      const roomData: RoomMeta | null = roomSnap.val()
      if (!roomData) {
        // Sala eliminada — limpiar sesión local
        localStorage.removeItem(`dr_session_${roomId}`)
        return null
      }

      return {
        roomId,
        roomData,
        memberId,
        memberData: memberSnap.val() ?? null,
      } satisfies ParticipantRoom
    }),
  )

  const participantRooms = results.filter(Boolean) as ParticipantRoom[]
  setState(prev => ({ ...prev, participantRooms, loadingParticipants: false }))
}
