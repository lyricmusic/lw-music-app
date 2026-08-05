import { useEffect, useMemo, useState } from 'react'

import { useSession } from '@/entities/session'
import { db } from '@/shared/api/firebase'
import {
  collection,
  collectionGroup,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore'

import type { Room, RoomMemberRole } from '../model/types'
import {
  parseRoomDocument,
  type RoomWithoutPresence,
} from './parseRoomDocument'

export interface MyRoom extends Room {
  membershipRole: RoomMemberRole
}

interface MyRoomsState {
  error: null | string
  loading: boolean
  roomDocuments: MyRoom[]
}

const ROLE_PRIORITY: Record<RoomMemberRole, number> = {
  owner: 0,
  moderator: 1,
  host: 2,
  member: 3,
}

function roomTimestamp(room: RoomWithoutPresence) {
  return typeof room.updatedAt?.toMillis === 'function'
    ? room.updatedAt.toMillis()
    : 0
}

export function useMyRooms(enabled = true) {
  const { user } = useSession()
  const [state, setState] = useState<MyRoomsState>({
    error: null,
    loading: enabled,
    roomDocuments: [],
  })

  useEffect(() => {
    let disposed = false

    if (!enabled || !user || user.isAnonymous) {
      setState({ error: null, loading: false, roomDocuments: [] })
      return
    }

    setState(current => ({ ...current, error: null, loading: true }))
    const ownedRoomsQuery = query(
      collection(db, 'rooms'),
      where('ownerId', '==', user.uid),
    )
    const activeMembershipsQuery = query(
      collectionGroup(db, 'members'),
      where('userId', '==', user.uid),
      where('status', '==', 'active'),
    )

    void Promise.all([
      getDocs(ownedRoomsQuery),
      getDocs(activeMembershipsQuery),
    ])
      .then(async ([ownedSnapshot, membershipsSnapshot]) => {
        const roomsById = new Map<
          string,
          { role: RoomMemberRole; room: RoomWithoutPresence }
        >()

        ownedSnapshot.forEach(roomSnapshot => {
          const room = parseRoomDocument(roomSnapshot)
          if (room) roomsById.set(room.id, { role: 'owner', room })
        })

        const memberships = membershipsSnapshot.docs.flatMap(snapshot => {
          const roomRef = snapshot.ref.parent.parent
          const role = snapshot.data().role
          return roomRef &&
            ['host', 'member', 'moderator', 'owner'].includes(role)
            ? [{ role: role as RoomMemberRole, roomRef }]
            : []
        })
        const missingMemberships = memberships.filter(
          membership => !roomsById.has(membership.roomRef.id),
        )
        const roomSnapshots = await Promise.all(
          missingMemberships.map(membership => getDoc(membership.roomRef)),
        )

        roomSnapshots.forEach((roomSnapshot, index) => {
          const room = parseRoomDocument(roomSnapshot)
          const membership = missingMemberships[index]
          if (room && membership) {
            const role =
              room.ownerId === user.uid
                ? 'owner'
                : membership.role === 'owner'
                  ? 'member'
                  : membership.role
            roomsById.set(room.id, { role, room })
          }
        })

        if (disposed) return
        setState({
          error: null,
          loading: false,
          roomDocuments: Array.from(roomsById.values())
            .sort((left, right) => {
              if (left.room.status !== right.room.status) {
                return left.room.status === 'active' ? -1 : 1
              }
              const timestampDifference =
                roomTimestamp(right.room) - roomTimestamp(left.room)
              return timestampDifference !== 0
                ? timestampDifference
                : ROLE_PRIORITY[left.role] - ROLE_PRIORITY[right.role]
            })
            .map(({ role, room }) => ({
              ...room,
              membershipRole: role,
              participantCount: null,
            })),
        })
      })
      .catch(reason => {
        if (disposed) return
        console.error('Не удалось загрузить список своих комнат:', reason)
        setState({
          error: 'Не удалось загрузить ваши комнаты.',
          loading: false,
          roomDocuments: [],
        })
      })

    return () => {
      disposed = true
    }
  }, [enabled, user])

  const rooms = useMemo(() => state.roomDocuments, [state.roomDocuments])
  return { error: state.error, loading: state.loading, rooms }
}
