import { useEffect, useState } from 'react'

import { db } from '@/shared/api/firebase'
import { reportOperationalError } from '@/shared/lib/telemetry'
import { collection, doc, onSnapshot, Timestamp } from 'firebase/firestore'

export type RoomRestrictionKind = 'ban' | 'mute'

export interface RoomRestriction {
  displayName: string
  expiresAt: null | Timestamp
  kind: RoomRestrictionKind
  photoURL: null | string
  reason: string
  userId: string
}

interface RestrictionData {
  expiresAt: null | Timestamp
  kind: RoomRestrictionKind
  reason: string
  userId: string
}

interface RestrictionProfile {
  displayName: string
  photoURL: null | string
}

export function useRoomRestrictions(roomId: string, enabled: boolean) {
  const [restrictions, setRestrictions] = useState<RoomRestriction[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<null | string>(null)

  useEffect(() => {
    setRestrictions([])
    setError(null)

    if (!roomId || !enabled) {
      setLoading(false)
      return
    }

    setLoading(true)
    let disposed = false
    let bansLoaded = false
    let mutesLoaded = false
    const restrictionData = new Map<string, RestrictionData>()
    const profiles = new Map<string, RestrictionProfile>()
    const resolvedProfiles = new Set<string>()
    const profileUnsubscribers = new Map<string, () => void>()

    const publishRestrictions = () => {
      if (disposed) return

      const nextRestrictions = Array.from(restrictionData.values())
        .map(restriction => {
          const profile = profiles.get(restriction.userId)
          return {
            ...restriction,
            displayName: profile?.displayName || restriction.userId,
            photoURL: profile?.photoURL ?? null,
          }
        })
        .sort((firstRestriction, secondRestriction) =>
          firstRestriction.displayName.localeCompare(
            secondRestriction.displayName,
            'ru',
          ),
        )

      setRestrictions(nextRestrictions)
      setLoading(
        !bansLoaded ||
          !mutesLoaded ||
          Array.from(restrictionData.values()).some(
            restriction => !resolvedProfiles.has(restriction.userId),
          ),
      )
    }

    const syncProfileSubscriptions = () => {
      const restrictedUserIds = new Set(
        Array.from(restrictionData.values(), restriction => restriction.userId),
      )

      for (const [userId, unsubscribeProfile] of Array.from(
        profileUnsubscribers,
      )) {
        if (restrictedUserIds.has(userId)) continue
        unsubscribeProfile()
        profileUnsubscribers.delete(userId)
        profiles.delete(userId)
        resolvedProfiles.delete(userId)
      }

      for (const userId of restrictedUserIds) {
        if (profileUnsubscribers.has(userId)) continue

        profileUnsubscribers.set(
          userId,
          onSnapshot(
            doc(db, 'userProfiles', userId),
            snapshot => {
              resolvedProfiles.add(userId)
              const data = snapshot.data()
              if (
                snapshot.exists() &&
                typeof data?.displayName === 'string' &&
                data.displayName.trim()
              ) {
                profiles.set(userId, {
                  displayName: data.displayName,
                  photoURL:
                    typeof data.photoURL === 'string' ? data.photoURL : null,
                })
              }
              publishRestrictions()
            },
            reason => {
              reportOperationalError('room_restrictions', reason)
              resolvedProfiles.add(userId)
              publishRestrictions()
            },
          ),
        )
      }
    }

    const subscribeToRestrictions = (kind: RoomRestrictionKind) =>
      onSnapshot(
        collection(db, 'rooms', roomId, kind === 'ban' ? 'bans' : 'mutes'),
        snapshot => {
          for (const key of Array.from(restrictionData.keys())) {
            if (key.startsWith(`${kind}:`)) restrictionData.delete(key)
          }

          snapshot.forEach(restrictionSnapshot => {
            const data = restrictionSnapshot.data()
            restrictionData.set(`${kind}:${restrictionSnapshot.id}`, {
              expiresAt:
                data.expiresAt instanceof Timestamp ? data.expiresAt : null,
              kind,
              reason: typeof data.reason === 'string' ? data.reason : '',
              userId: restrictionSnapshot.id,
            })
          })

          if (kind === 'ban') bansLoaded = true
          else mutesLoaded = true
          syncProfileSubscriptions()
          publishRestrictions()
        },
        reason => {
          reportOperationalError('room_restrictions', reason)
          if (kind === 'ban') bansLoaded = true
          else mutesLoaded = true
          setError('Не удалось загрузить ограничения комнаты.')
          publishRestrictions()
        },
      )

    const unsubscribeBans = subscribeToRestrictions('ban')
    const unsubscribeMutes = subscribeToRestrictions('mute')

    return () => {
      disposed = true
      unsubscribeBans()
      unsubscribeMutes()
      profileUnsubscribers.forEach(unsubscribeProfile => unsubscribeProfile())
    }
  }, [enabled, roomId])

  return { error, loading, restrictions }
}
