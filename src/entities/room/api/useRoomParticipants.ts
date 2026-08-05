import { useEffect, useState } from 'react'

import { resolveUserCharacter, type UserCharacter } from '@/entities/session'
import { db, realtimeDb } from '@/shared/api/firebase'
import { onValue, ref } from 'firebase/database'
import { collection, doc, onSnapshot } from 'firebase/firestore'

import type { RoomMemberRole } from '../model/types'

export interface RoomParticipant {
  character: UserCharacter
  displayName: string
  id: string
  isGuest: boolean
  online: boolean
  photoURL: null | string
  role: RoomMemberRole
}

interface ParticipantProfile {
  character: UserCharacter
  displayName: string
  photoURL: null | string
}

interface ParticipantMembership {
  isGuest: boolean
  role: RoomMemberRole
}

interface RoomParticipantsState {
  error: null | string
  loading: boolean
  participants: RoomParticipant[]
}

const ROOM_MEMBER_ROLES: RoomMemberRole[] = [
  'host',
  'member',
  'moderator',
  'owner',
]
const ROLE_PRIORITY: Record<RoomMemberRole, number> = {
  owner: 0,
  moderator: 1,
  host: 2,
  member: 3,
}
const participantNameCollator = new Intl.Collator('ru', {
  sensitivity: 'base',
})

export function useRoomParticipants(roomId: string): RoomParticipantsState {
  const [participants, setParticipants] = useState<RoomParticipant[]>([])
  const [loading, setLoading] = useState(Boolean(roomId))
  const [error, setError] = useState<null | string>(null)

  useEffect(() => {
    setParticipants([])
    setError(null)

    if (!roomId) {
      setLoading(false)
      return
    }

    setLoading(true)

    let disposed = false
    let membersLoaded = false
    let presenceLoaded = false
    let onlineParticipantIds = new Set<string>()
    const membershipsById = new Map<string, ParticipantMembership>()
    const profilesById = new Map<string, ParticipantProfile>()
    const resolvedProfileIds = new Set<string>()
    const profileUnsubscribers = new Map<string, () => void>()

    const publishParticipants = () => {
      if (disposed) return

      const nextParticipants = Array.from(membershipsById, ([id, member]) => {
        const profile = profilesById.get(id)
        if (!profile) return null

        return {
          ...profile,
          id,
          isGuest: member.isGuest,
          online: onlineParticipantIds.has(id),
          role: member.role,
        } satisfies RoomParticipant
      })
        .filter(
          (participant): participant is RoomParticipant => participant !== null,
        )
        .sort((firstParticipant, secondParticipant) => {
          if (firstParticipant.online !== secondParticipant.online) {
            return firstParticipant.online ? -1 : 1
          }

          const roleDifference =
            ROLE_PRIORITY[firstParticipant.role] -
            ROLE_PRIORITY[secondParticipant.role]
          if (roleDifference !== 0) return roleDifference

          return participantNameCollator.compare(
            firstParticipant.displayName,
            secondParticipant.displayName,
          )
        })

      setParticipants(nextParticipants)
      setLoading(
        !membersLoaded ||
          !presenceLoaded ||
          Array.from(membershipsById.keys()).some(
            participantId => !resolvedProfileIds.has(participantId),
          ),
      )
    }

    const syncProfileSubscriptions = () => {
      const activeMemberIds = new Set(membershipsById.keys())

      for (const [participantId, unsubscribeProfile] of Array.from(
        profileUnsubscribers,
      )) {
        if (activeMemberIds.has(participantId)) continue

        unsubscribeProfile()
        profileUnsubscribers.delete(participantId)
        profilesById.delete(participantId)
        resolvedProfileIds.delete(participantId)
      }

      for (const participantId of activeMemberIds) {
        if (profileUnsubscribers.has(participantId)) continue

        const unsubscribeProfile = onSnapshot(
          doc(db, 'userProfiles', participantId),
          profileSnapshot => {
            resolvedProfileIds.add(participantId)

            if (profileSnapshot.exists()) {
              const profile = profileSnapshot.data() as ParticipantProfile
              if (profile.displayName.trim()) {
                profilesById.set(participantId, {
                  character: resolveUserCharacter(profile.character),
                  displayName: profile.displayName,
                  photoURL: profile.photoURL,
                })
              }
            } else {
              profilesById.delete(participantId)
            }

            publishParticipants()
          },
          reason => {
            console.error(
              'Не удалось загрузить профиль участника комнаты:',
              reason,
            )
            resolvedProfileIds.add(participantId)
            profilesById.delete(participantId)
            setError('Не удалось загрузить некоторых участников.')
            publishParticipants()
          },
        )

        profileUnsubscribers.set(participantId, unsubscribeProfile)
      }
    }

    const unsubscribeMembers = onSnapshot(
      collection(db, 'rooms', roomId, 'members'),
      snapshot => {
        membersLoaded = true
        membershipsById.clear()

        snapshot.forEach(memberSnapshot => {
          const data = memberSnapshot.data()
          if (
            data.status === 'active' &&
            ROOM_MEMBER_ROLES.includes(data.role)
          ) {
            membershipsById.set(memberSnapshot.id, {
              isGuest: data.isGuest === true,
              role: data.role as RoomMemberRole,
            })
          }
        })

        syncProfileSubscriptions()
        publishParticipants()
      },
      reason => {
        console.error('Не удалось загрузить участников комнаты:', reason)
        membersLoaded = true
        setError('Не удалось загрузить список участников.')
        setLoading(false)
      },
    )

    const unsubscribePresence = onValue(
      ref(realtimeDb, `roomPresence/${roomId}`),
      snapshot => {
        presenceLoaded = true
        const rawPresence = snapshot.val() as unknown
        onlineParticipantIds = new Set(
          rawPresence && typeof rawPresence === 'object'
            ? Object.entries(rawPresence).flatMap(
                ([participantId, connections]) =>
                  connections &&
                  typeof connections === 'object' &&
                  Object.keys(connections).length > 0
                    ? [participantId]
                    : [],
              )
            : [],
        )
        publishParticipants()
      },
      reason => {
        console.error('Не удалось загрузить присутствие в комнате:', reason)
        presenceLoaded = true
        setError('Не удалось определить, кто сейчас онлайн.')
        publishParticipants()
      },
    )

    return () => {
      disposed = true
      unsubscribeMembers()
      unsubscribePresence()
      profileUnsubscribers.forEach(unsubscribeProfile => unsubscribeProfile())
    }
  }, [roomId])

  return { error, loading, participants }
}
