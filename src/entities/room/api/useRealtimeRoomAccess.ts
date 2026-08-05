import { useEffect, useState } from 'react'

import { callRoomManagementApi } from '@/shared/api/firebase'

const LEASE_REFRESH_MILLISECONDS = 60_000

export type RealtimeRoomAccessStatus = 'error' | 'idle' | 'ready' | 'requesting'

export function useRealtimeRoomAccess(roomId: string, enabled: boolean) {
  const [status, setStatus] = useState<RealtimeRoomAccessStatus>('idle')

  useEffect(() => {
    let disposed = false
    let refreshTimer: ReturnType<typeof setTimeout> | undefined

    if (!roomId || !enabled) {
      setStatus('idle')
      return
    }

    const authorize = async (initial: boolean) => {
      if (initial) setStatus('requesting')
      try {
        await callRoomManagementApi('authorizeRealtimeRoom', { roomId })
        if (disposed) return
        setStatus('ready')
      } catch (reason) {
        if (disposed) return
        console.error(
          'Не удалось подтвердить доступ к realtime-данным комнаты:',
          reason,
        )
        setStatus('error')
      } finally {
        if (!disposed) {
          refreshTimer = setTimeout(
            () => void authorize(false),
            LEASE_REFRESH_MILLISECONDS,
          )
        }
      }
    }

    void authorize(true)

    return () => {
      disposed = true
      if (refreshTimer) clearTimeout(refreshTimer)
    }
  }, [enabled, roomId])

  return status
}
