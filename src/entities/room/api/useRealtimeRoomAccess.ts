import { useEffect, useState } from 'react'

import { callRoomManagementApi } from '@/shared/api/firebase'
import { reportOperationalError } from '@/shared/lib/telemetry'

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
        reportOperationalError('realtime_access', reason)
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
