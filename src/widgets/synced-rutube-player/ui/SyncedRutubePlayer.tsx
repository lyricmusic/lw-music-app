import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import {
  advanceRoomQueue,
  enqueueRoomVideo,
  leaveRoomQueue,
  sendRoomReaction,
  skipRoomVideo,
  type RoomMemberRole,
  type RoomReactionEmoji,
  useRoomParticipants,
  useRoomQueue,
  useRoomReactions,
} from '@/entities/room'
import { useSession } from '@/entities/session'
import { useBlockedUsers } from '@/entities/user'
import { RoomParticipantActions } from '@/features/manage-room'
import { db } from '@/shared/api/firebase'
import { formatPlaybackTime, isRutubeVideoId } from '@/shared/lib/rutube'
import { Button } from '@/shared/ui/button'
import { RoomDanceFloor } from '@/widgets/room-avatar'
import {
  Avatar,
  Box,
  CircularProgress,
  Paper,
  Tab,
  Tabs,
  Typography,
} from '@mui/material'
import { Timestamp, doc, onSnapshot } from 'firebase/firestore'
import { toast } from 'react-toastify'

import { AddToQueueDialog } from './AddToQueueDialog'

interface SyncedRutubePlayerProps {
  currentMemberRole?: null | RoomMemberRole
  previewVideoId?: string
  queueEnabled?: boolean
  roomId: string
  syncEnabled?: boolean
}

type PlaybackStatus = 'paused' | 'playing'
type SyncStatus = 'connected' | 'connecting' | 'error' | 'syncing'

interface PlaybackState {
  changedAt: Timestamp | null
  changedBy: string
  positionSeconds: number
  revision: number
  status: PlaybackStatus
  videoId: string
}

const REMOTE_DRIFT_THRESHOLD_SECONDS = 1.5
const PLAYBACK_RETRY_INTERVAL_MILLISECONDS = 10_000
const AUTOPLAY_WARNING_DELAY_MILLISECONDS = 15_000

function getParticipantInitials(displayName: string) {
  return displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(namePart => namePart[0])
    .join('')
    .toUpperCase()
}

type RoomUserListItemStatus = 'current' | 'next'

interface RoomUserListItemProps {
  actions?: ReactNode
  displayName: string
  online?: boolean
  pending?: boolean
  photoURL: null | string
  roleBadge?: ReactNode
  secondaryLabel?: string
  status?: RoomUserListItemStatus
}

function RoomUserListItem({
  actions,
  displayName,
  online,
  pending = false,
  photoURL,
  roleBadge,
  secondaryLabel,
  status,
}: RoomUserListItemProps) {
  const isCurrent = status === 'current'
  const isNext = status === 'next'

  return (
    <Box
      className="flex min-w-0 items-center gap-3"
      component="li"
      sx={{
        backgroundColor: '#3F3F59',
        borderRadius: '8px',
        boxShadow: isCurrent ? 'inset 0 0 0 2px #6F70E7' : 'none',
        height: '48px',
        opacity: pending ? 0.72 : 1,
        padding: '2px 12px 2px 2px',
        width: { xs: 'min(243px, calc(100vw - 60px))', sm: '243px' },
      }}
    >
      <Avatar
        alt={displayName}
        src={photoURL ?? undefined}
        variant="rounded"
        sx={{
          backgroundColor: '#6F70E7',
          borderRadius: '6px',
          flexShrink: 0,
          fontSize: '14px',
          height: 44,
          width: 44,
        }}
      >
        {getParticipantInitials(displayName)}
      </Avatar>

      <Box className="min-w-0 flex-1">
        <Typography
          className="truncate text-[15px] leading-[18px]"
          component="span"
          sx={{ color: '#D7DBF0' }}
        >
          {displayName}
        </Typography>

        {(status || secondaryLabel) && (
          <Box className="mt-0.5 flex items-center gap-1.5">
            <Box
              component="span"
              sx={{
                backgroundColor: status
                  ? isCurrent
                    ? '#6F70E7'
                    : 'transparent'
                  : online
                    ? '#62D79B'
                    : '#8B8DB3',
                border: status && isNext ? '1px solid #8B8DB3' : 'none',
                borderRadius: '50%',
                boxSizing: 'border-box',
                flexShrink: 0,
                height: 8,
                width: 8,
              }}
            />
            <Typography
              className="truncate text-[12px] leading-[14px]"
              component="span"
              sx={{ color: '#D7DBF0' }}
            >
              {status
                ? isCurrent
                  ? 'Сейчас показывает'
                  : 'Следующий'
                : secondaryLabel}
            </Typography>
          </Box>
        )}
      </Box>
      {roleBadge}
      {actions}
    </Box>
  )
}

const ROOM_ROLE_LABELS: Record<RoomMemberRole, string> = {
  host: 'Ведущий',
  member: 'Участник',
  moderator: 'Модератор',
  owner: 'Владелец',
}

const ROOM_ROLE_BADGES: Partial<
  Record<RoomMemberRole, { color: string; symbol: string }>
> = {
  host: { color: '#80BFFF', symbol: '★' },
  moderator: { color: '#62D79B', symbol: '◆' },
  owner: { color: '#F2C94C', symbol: '♛' },
}

function RoomRoleBadge({ role }: { role: RoomMemberRole }) {
  const badge = ROOM_ROLE_BADGES[role]
  if (!badge) return null

  return (
    <Box
      aria-label={ROOM_ROLE_LABELS[role]}
      component="span"
      sx={{
        alignItems: 'center',
        border: `1px solid ${badge.color}`,
        borderRadius: '50%',
        color: badge.color,
        display: 'inline-flex',
        flexShrink: 0,
        fontSize: '12px',
        height: 24,
        justifyContent: 'center',
        width: 24,
      }}
      title={ROOM_ROLE_LABELS[role]}
    >
      {badge.symbol}
    </Box>
  )
}

function parseRutubeMessage(value: unknown) {
  try {
    const message = typeof value === 'string' ? JSON.parse(value) : value
    if (!message || typeof message !== 'object') return null

    const { data, type } = message as { data?: unknown; type?: unknown }
    if (typeof type !== 'string' || !type.startsWith('player:')) return null
    return { data, type }
  } catch {
    return null
  }
}

function parsePlaybackState(
  data: Record<string, unknown>,
): PlaybackState | null {
  const status = data.status
  const videoId = data.videoId
  const positionSeconds = data.positionSeconds
  const revision = data.revision
  const changedBy = data.changedBy

  if (
    (status !== 'paused' && status !== 'playing') ||
    typeof videoId !== 'string' ||
    !/^([-_A-Za-z0-9]{11}|[a-f\d]{32})$/.test(videoId) ||
    typeof positionSeconds !== 'number' ||
    !Number.isFinite(positionSeconds) ||
    typeof revision !== 'number' ||
    typeof changedBy !== 'string'
  ) {
    return null
  }

  return {
    changedAt: data.changedAt instanceof Timestamp ? data.changedAt : null,
    changedBy,
    positionSeconds: Math.max(0, positionSeconds),
    revision,
    status,
    videoId,
  }
}

function getExpectedPosition(state: PlaybackState) {
  if (state.status === 'paused' || !state.changedAt) {
    return state.positionSeconds
  }

  const elapsedSeconds = Math.max(
    0,
    (Date.now() - state.changedAt.toMillis()) / 1000,
  )
  return state.positionSeconds + elapsedSeconds
}

export function SyncedRutubePlayer({
  currentMemberRole = null,
  previewVideoId,
  queueEnabled = true,
  roomId,
  syncEnabled = true,
}: SyncedRutubePlayerProps) {
  const { profile, user } = useSession()
  const blockedUserIds = useBlockedUsers()
  const {
    error: participantsError,
    loading: participantsLoading,
    participants,
  } = useRoomParticipants(roomId)
  const roomReactions = useRoomReactions(roomId)
  const {
    error: queueError,
    items: queueItems,
    loading: queueLoading,
  } = useRoomQueue(roomId)
  const playbackRef = useMemo(
    () => doc(db, 'rooms', roomId, 'playback', 'current'),
    [roomId],
  )
  const playerFrameRef = useRef<HTMLIFrameElement>(null)
  const playerReadyRef = useRef(false)
  const loadedVideoIdRef = useRef<null | string>(null)
  const mutedRef = useRef(true)
  const playerStateRef = useRef<'paused' | 'playing' | 'stopped' | 'unknown'>(
    'unknown',
  )
  const activeVideoIdRef = useRef<null | string>(null)
  const currentTimeRef = useRef(0)
  const adPlayingRef = useRef(false)
  const completedVideoIdRef = useRef<null | string>(null)
  const lastRemoteStateRef = useRef<null | PlaybackState>(null)
  const activeQueueUserIdRef = useRef<null | string>(null)
  const suppressPlayerEventsUntilRef = useRef(0)
  const nextPlaybackRetryAtRef = useRef(0)
  const playbackRequestedAtRef = useRef(0)
  const queueMutationRef = useRef(Promise.resolve())

  const [playerReady, setPlayerReady] = useState(false)
  const [muted, setMuted] = useState(true)
  const [autoplayBlocked, setAutoplayBlocked] = useState(false)
  const [, setSyncStatus] = useState<SyncStatus>('connecting')
  const [error, setError] = useState<null | string>(null)
  const [remoteState, setRemoteState] = useState<null | PlaybackState>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [queueDialogOpen, setQueueDialogOpen] = useState(false)
  const [queueLeaving, setQueueLeaving] = useState(false)
  const [queueSkipping, setQueueSkipping] = useState(false)
  const [danceFloorCollapsed, setDanceFloorCollapsed] = useState(false)
  const [reactionPending, setReactionPending] = useState(false)
  const [activeRoomTab, setActiveRoomTab] = useState<'participants' | 'queue'>(
    'queue',
  )
  const [localQueuedVideoId, setLocalQueuedVideoId] = useState<null | string>(
    () =>
      isRutubeVideoId(previewVideoId) ? previewVideoId.toLowerCase() : null,
  )
  const [iframeVideoId, setIframeVideoId] = useState<null | string>(null)
  const activeVideoId = remoteState?.videoId ?? localQueuedVideoId
  const rutubeVideoId = isRutubeVideoId(activeVideoId) ? activeVideoId : null
  const playerSrc = iframeVideoId
    ? `https://rutube.ru/play/embed/${iframeVideoId}?autostartmute=true&autoplay=true&skinColor=6F70E7&getPlayOptions=duration,title,thumbnail_url`
    : undefined
  const hasVideo = Boolean(remoteState || localQueuedVideoId)
  const avatarIsPlaying = remoteState?.status === 'playing'
  const danceFloorParticipants = useMemo(
    () =>
      participants.filter(participant => !blockedUserIds.has(participant.id)),
    [blockedUserIds, participants],
  )
  const danceFloorDjUserId = useMemo(() => {
    const activeQueueUserId = queueItems[0]?.userId
    return (
      danceFloorParticipants.find(
        participant => participant.id === activeQueueUserId,
      )?.id ??
      danceFloorParticipants.find(participant => participant.role === 'owner')
        ?.id ??
      danceFloorParticipants.find(participant => participant.id === user?.uid)
        ?.id ??
      danceFloorParticipants[0]?.id ??
      null
    )
  }, [danceFloorParticipants, queueItems, user?.uid])

  const handleRoomReaction = useCallback(
    async (reaction: RoomReactionEmoji) => {
      if (reactionPending) return

      setReactionPending(true)
      try {
        await sendRoomReaction(roomId, reaction)
      } catch (reason) {
        toast.error(
          reason instanceof Error
            ? reason.message
            : 'Не удалось отправить реакцию.',
        )
      } finally {
        setReactionPending(false)
      }
    },
    [reactionPending, roomId],
  )

  useEffect(() => {
    activeQueueUserIdRef.current = queueItems[0]?.userId ?? null
  }, [queueItems])

  const clearFinishedPlayback = useCallback(
    (finishedVideoId: string) => {
      if (!syncEnabled) {
        if (lastRemoteStateRef.current?.videoId === finishedVideoId) {
          lastRemoteStateRef.current = null
          setRemoteState(null)
        }
        setLocalQueuedVideoId(currentVideoId =>
          currentVideoId === finishedVideoId ? null : currentVideoId,
        )
        return Promise.resolve()
      }

      const canAdvance =
        currentMemberRole === 'owner' ||
        currentMemberRole === 'host' ||
        activeQueueUserIdRef.current === user?.uid
      if (!user || !canAdvance) return Promise.resolve()

      setSyncStatus('syncing')
      queueMutationRef.current = queueMutationRef.current
        .then(async () => {
          await advanceRoomQueue({
            finishedVideoId,
            roomId,
          })
          setLocalQueuedVideoId(currentVideoId =>
            currentVideoId === finishedVideoId ? null : currentVideoId,
          )
          setSyncStatus('connected')
        })
        .catch(reason => {
          console.error('Не удалось перейти к следующему видео:', reason)
          setError(
            reason instanceof Error
              ? reason.message
              : 'Не удалось перейти к следующему видео.',
          )
          setSyncStatus('error')
        })

      return queueMutationRef.current
    },
    [currentMemberRole, roomId, syncEnabled, user],
  )

  const sendPlayerCommand = useCallback(
    (type: string, data: Record<string, unknown> = {}) => {
      playerFrameRef.current?.contentWindow?.postMessage(
        JSON.stringify({ data, type }),
        'https://rutube.ru',
      )
    },
    [],
  )

  const requestPlayerPlayback = useCallback(() => {
    if (playbackRequestedAtRef.current === 0) {
      playbackRequestedAtRef.current = Date.now()
    }
    sendPlayerCommand('player:play')
    nextPlaybackRetryAtRef.current =
      Date.now() + PLAYBACK_RETRY_INTERVAL_MILLISECONDS
  }, [sendPlayerCommand])

  const applyRemoteState = useCallback(
    (state: PlaybackState) => {
      if (
        !playerReadyRef.current ||
        activeVideoIdRef.current !== state.videoId ||
        adPlayingRef.current
      ) {
        return
      }

      const expectedPosition = getExpectedPosition(state)
      suppressPlayerEventsUntilRef.current = Date.now() + 1_800

      if (
        Math.abs(currentTimeRef.current - expectedPosition) >
        REMOTE_DRIFT_THRESHOLD_SECONDS
      ) {
        sendPlayerCommand('player:setCurrentTime', { time: expectedPosition })
      }

      if (state.status === 'paused') {
        if (playerStateRef.current !== 'paused') {
          sendPlayerCommand('player:pause')
        }
      } else if (playerStateRef.current !== 'playing') {
        requestPlayerPlayback()
      }
    },
    [requestPlayerPlayback, sendPlayerCommand],
  )

  const finishCurrentVideo = useCallback(() => {
    const finishedVideoId = activeVideoIdRef.current
    if (!finishedVideoId || completedVideoIdRef.current === finishedVideoId) {
      return
    }

    completedVideoIdRef.current = finishedVideoId
    void clearFinishedPlayback(finishedVideoId)
  }, [clearFinishedPlayback])

  useEffect(() => {
    activeVideoIdRef.current = activeVideoId
    playerStateRef.current = 'unknown'
    currentTimeRef.current = 0
    adPlayingRef.current = false
    playbackRequestedAtRef.current = 0
    completedVideoIdRef.current = null
    setAutoplayBlocked(false)
    setCurrentTime(0)
    setDuration(0)

    if (!activeVideoId) {
      playerReadyRef.current = false
      loadedVideoIdRef.current = null
      setPlayerReady(false)
      setIframeVideoId(null)
    } else if (!rutubeVideoId) {
      playerReadyRef.current = false
      loadedVideoIdRef.current = null
      setPlayerReady(false)
      setIframeVideoId(null)
      setError(
        'В очереди осталось старое видео YouTube. Переходим к следующему участнику…',
      )
      void clearFinishedPlayback(activeVideoId)
    } else if (rutubeVideoId) {
      setError(null)
      if (!iframeVideoId) {
        playerReadyRef.current = false
        loadedVideoIdRef.current = null
        setPlayerReady(false)
        setIframeVideoId(rutubeVideoId)
      } else if (
        playerReadyRef.current &&
        loadedVideoIdRef.current !== rutubeVideoId
      ) {
        loadedVideoIdRef.current = rutubeVideoId
        suppressPlayerEventsUntilRef.current = Date.now() + 2_500
        setPlayerReady(false)
        sendPlayerCommand('player:changeVideo', { id: rutubeVideoId })
      }
    }
  }, [
    activeVideoId,
    clearFinishedPlayback,
    iframeVideoId,
    rutubeVideoId,
    sendPlayerCommand,
  ])

  useEffect(() => {
    const handlePlayerMessage = (event: MessageEvent) => {
      const frameWindow = playerFrameRef.current?.contentWindow
      if (
        !frameWindow ||
        event.source !== frameWindow ||
        event.origin !== 'https://rutube.ru'
      ) {
        return
      }

      const message = parseRutubeMessage(event.data)
      if (!message) return
      const data =
        message.data && typeof message.data === 'object'
          ? (message.data as Record<string, unknown>)
          : {}

      if (message.type === 'player:ready') {
        playerReadyRef.current = true
        loadedVideoIdRef.current = iframeVideoId
        setPlayerReady(true)
        sendPlayerCommand(mutedRef.current ? 'player:mute' : 'player:unMute')

        const intendedVideoId = activeVideoIdRef.current
        if (
          isRutubeVideoId(intendedVideoId) &&
          loadedVideoIdRef.current !== intendedVideoId
        ) {
          loadedVideoIdRef.current = intendedVideoId
          sendPlayerCommand('player:changeVideo', { id: intendedVideoId })
          return
        }

        const remote = lastRemoteStateRef.current
        if (remote) {
          applyRemoteState(remote)
        } else {
          sendPlayerCommand('player:setCurrentTime', { time: 0 })
          requestPlayerPlayback()
        }
        return
      }

      if (message.type === 'player:init') {
        const videoId = data.videoId
        if (isRutubeVideoId(videoId)) {
          loadedVideoIdRef.current = videoId.toLowerCase()
        }

        setPlayerReady(true)
        const remote = lastRemoteStateRef.current
        if (remote) {
          applyRemoteState(remote)
        } else if (activeVideoIdRef.current === loadedVideoIdRef.current) {
          sendPlayerCommand('player:setCurrentTime', { time: 0 })
          requestPlayerPlayback()
        }
        return
      }

      if (message.type === 'player:currentTime') {
        const time = data.time
        if (typeof time === 'number' && Number.isFinite(time)) {
          const previousTime = currentTimeRef.current
          currentTimeRef.current = Math.max(0, time)
          setCurrentTime(currentTimeRef.current)
          if (currentTimeRef.current > previousTime + 0.05) {
            playbackRequestedAtRef.current = 0
            setAutoplayBlocked(false)
          }
        }
        return
      }

      if (message.type === 'player:durationChange') {
        const nextDuration = data.duration
        if (typeof nextDuration === 'number' && Number.isFinite(nextDuration)) {
          setDuration(Math.max(0, nextDuration))
        }
        return
      }

      if (message.type === 'player:changeState') {
        const state = data.state
        if (state === 'paused' || state === 'playing' || state === 'stopped') {
          playerStateRef.current = state
          if (state === 'playing') {
            playbackRequestedAtRef.current = 0
            setAutoplayBlocked(false)
            nextPlaybackRetryAtRef.current =
              Date.now() + PLAYBACK_RETRY_INTERVAL_MILLISECONDS
          }
        }
        return
      }

      if (message.type === 'player:rollState') {
        adPlayingRef.current = data.state === 'play'
        if (data.state === 'play') {
          playbackRequestedAtRef.current = 0
          setAutoplayBlocked(false)
        }
        if (data.state === 'complete') {
          const remote = lastRemoteStateRef.current
          if (remote) applyRemoteState(remote)
        }
        return
      }

      if (message.type === 'player:adStart') {
        adPlayingRef.current = true
        playbackRequestedAtRef.current = 0
        setAutoplayBlocked(false)
        return
      }

      if (message.type === 'player:adEnd') {
        adPlayingRef.current = false
        const remote = lastRemoteStateRef.current
        if (remote) applyRemoteState(remote)
        return
      }

      if (message.type === 'player:playComplete') {
        finishCurrentVideo()
        return
      }

      if (message.type === 'player:error') {
        const code = typeof data.code === 'string' ? ` (${data.code})` : ''
        const details =
          typeof data.text === 'string' && data.text.trim()
            ? `: ${data.text.trim().slice(0, 160)}`
            : ''
        setError(`RUTUBE не смог воспроизвести видео${code}${details}`)
        finishCurrentVideo()
      }
    }

    window.addEventListener('message', handlePlayerMessage)
    return () => window.removeEventListener('message', handlePlayerMessage)
  }, [
    applyRemoteState,
    finishCurrentVideo,
    iframeVideoId,
    requestPlayerPlayback,
    sendPlayerCommand,
  ])

  useEffect(() => {
    if (!syncEnabled) {
      setSyncStatus('connected')
      return
    }

    setSyncStatus('connecting')

    return onSnapshot(
      playbackRef,
      snapshot => {
        if (!snapshot.exists()) {
          lastRemoteStateRef.current = null
          setRemoteState(null)
          setSyncStatus('connected')
          return
        }

        const parsed = parsePlaybackState(snapshot.data())
        if (!parsed) {
          setError('В Firestore сохранено некорректное состояние плеера.')
          setSyncStatus('error')
          return
        }

        lastRemoteStateRef.current = parsed
        setRemoteState(parsed)
        setLocalQueuedVideoId(null)
        setSyncStatus('connected')
        applyRemoteState(parsed)
      },
      reason => {
        console.error('Не удалось подписаться на состояние плеера:', reason)
        setError(
          reason.code === 'permission-denied'
            ? 'Нет доступа к состоянию плеера. Проверьте, что вы вошли в комнату как активный участник.'
            : 'Не удалось загрузить состояние плеера. Проверьте соединение и попробуйте ещё раз.',
        )
        setSyncStatus('error')
      },
    )
  }, [applyRemoteState, playbackRef, syncEnabled])

  useEffect(() => {
    if (!playerReady) return

    const interval = window.setInterval(() => {
      const remote = lastRemoteStateRef.current
      if (
        !remote ||
        remote.status !== 'playing' ||
        adPlayingRef.current ||
        Date.now() < suppressPlayerEventsUntilRef.current
      ) {
        return
      }

      const expectedPosition = getExpectedPosition(remote)

      if (
        Math.abs(currentTimeRef.current - expectedPosition) >
        REMOTE_DRIFT_THRESHOLD_SECONDS
      ) {
        sendPlayerCommand('player:setCurrentTime', { time: expectedPosition })
      }

      if (
        playerStateRef.current !== 'playing' &&
        playerStateRef.current !== 'stopped' &&
        Date.now() >= nextPlaybackRetryAtRef.current
      ) {
        requestPlayerPlayback()
        setAutoplayBlocked(
          playbackRequestedAtRef.current > 0 &&
            Date.now() - playbackRequestedAtRef.current >=
              AUTOPLAY_WARNING_DELAY_MILLISECONDS,
        )
      }
    }, 750)

    return () => window.clearInterval(interval)
  }, [playerReady, requestPlayerPlayback, sendPlayerCommand])

  const handleJoinQueue = async (videoId: string) => {
    if (!profile || !user) {
      throw new Error('Чтобы встать в очередь, войдите в аккаунт.')
    }

    try {
      const { isActive } = await enqueueRoomVideo({
        displayName: profile.displayName,
        photoURL: profile.photoURL,
        roomId,
        videoId,
      })

      if (isActive) {
        setError(null)
        setAutoplayBlocked(false)
        setLocalQueuedVideoId(videoId)
      }
    } catch (reason) {
      console.error('Не удалось добавить видео в очередь:', reason)
      throw reason
    }
  }

  const handleToggleSound = () => {
    if (!playerReadyRef.current) return

    if (muted) {
      sendPlayerCommand('player:unMute')
      mutedRef.current = false
      setMuted(false)
      if (lastRemoteStateRef.current?.status !== 'paused') {
        requestPlayerPlayback()
      }
      setAutoplayBlocked(false)
    } else {
      sendPlayerCommand('player:mute')
      mutedRef.current = true
      setMuted(true)
    }
  }

  const handleSkipVideo = async () => {
    if (queueSkipping) return
    setQueueSkipping(true)
    try {
      await skipRoomVideo(roomId)
      toast.success('Переходим к следующему видео.')
    } catch (reason) {
      toast.error(
        reason instanceof Error
          ? reason.message
          : 'Не удалось пропустить видео.',
      )
    } finally {
      setQueueSkipping(false)
    }
  }

  const currentUserQueueItem = queueItems.find(
    queueItem => queueItem.userId === user?.uid,
  )
  const currentUserAlreadyQueued = Boolean(currentUserQueueItem)
  const queueButtonDisabled =
    queueLoading ||
    queueLeaving ||
    !queueEnabled ||
    !user ||
    currentUserQueueItem?.pending ||
    (!currentUserAlreadyQueued && !profile)

  const handleLeaveQueue = async () => {
    if (!user || queueLeaving) return

    setQueueLeaving(true)
    try {
      const { wasActive } = await leaveRoomQueue({ roomId })

      if (wasActive) {
        setLocalQueuedVideoId(null)
        setAutoplayBlocked(false)
      }
      setError(null)
    } catch (reason) {
      console.error('Не удалось покинуть очередь:', reason)
      setError(
        reason instanceof Error
          ? reason.message
          : 'Не удалось покинуть очередь.',
      )
    } finally {
      setQueueLeaving(false)
    }
  }

  return (
    <Box
      className={`room-player-layout ${
        hasVideo ? 'room-player-layout--with-video' : ''
      }`}
    >
      <Paper
        aria-hidden={!hasVideo}
        className={`room-video-panel ${
          hasVideo ? 'block' : 'hidden'
        } min-h-0 overflow-hidden`}
        component="section"
        data-testid="video-sync-player"
        elevation={0}
        sx={{ backgroundColor: '#2A2B47', borderRadius: '20px' }}
      >
        <Box className="relative h-full w-full overflow-hidden bg-black">
          {!playerReady && (
            <Box className="absolute inset-0 z-10 flex items-center justify-center text-white">
              <CircularProgress color="inherit" />
            </Box>
          )}
          {playerSrc && (
            <Box
              allow="clipboard-write; autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              className="pointer-events-none h-full w-full border-0"
              component="iframe"
              key={iframeVideoId}
              ref={playerFrameRef}
              src={playerSrc}
              tabIndex={-1}
              title="Синхронный плеер RUTUBE"
            />
          )}

          <Box className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-3 bg-gradient-to-t from-black/80 to-transparent px-3 pb-3 pt-10 text-sm text-white sm:px-5 sm:pb-4">
            <Typography component="span" variant="body2">
              {formatPlaybackTime(currentTime)} / {formatPlaybackTime(duration)}
            </Typography>
            <Box className="flex flex-wrap justify-end gap-2">
              {(currentMemberRole === 'owner' ||
                currentMemberRole === 'host') && (
                <Button
                  disabled={queueSkipping || queueItems.length === 0}
                  onClick={() => void handleSkipVideo()}
                  sx={{
                    '&:hover': { backgroundColor: '#5D3A82' },
                    backgroundColor: '#3B2158',
                    borderColor: '#B88CFF',
                    color: '#FFFFFF',
                    padding: '8px 12px',
                  }}
                  variant="outlined"
                >
                  {queueSkipping ? 'Пропускаем…' : 'Пропустить'}
                </Button>
              )}
              <Button
                disabled={!playerReady}
                onClick={handleToggleSound}
                sx={{
                  '&:hover': {
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    borderColor: '#FFFFFF',
                  },
                  backgroundColor: 'rgba(0, 0, 0, 0.3)',
                  borderColor: 'rgba(255, 255, 255, 0.7)',
                  color: '#FFFFFF',
                  padding: '8px 12px',
                }}
                variant="outlined"
              >
                {muted
                  ? autoplayBlocked
                    ? 'Запустить со звуком'
                    : 'Включить звук'
                  : 'Выключить звук'}
              </Button>
            </Box>
          </Box>

          {autoplayBlocked && (
            <Box className="absolute left-4 right-4 top-4 rounded-xl border border-[#6D4A8F] bg-[#24143D] p-3 text-sm text-[#F8F3FF]">
              Браузер не разрешил автоматический запуск. Нажмите «Запустить со
              звуком» один раз — дальше плеер продолжит синхронизацию сам.
            </Box>
          )}
        </Box>
      </Paper>

      <Paper
        className="room-queue-panel min-h-0 p-3 sm:p-4"
        component="section"
        elevation={0}
        sx={{
          backgroundColor: '#2A2B47',
          borderRadius: '20px',
          color: '#FFFFFF',
        }}
      >
        <Box
          className={`room-lower-layout ${
            danceFloorCollapsed ? 'room-lower-layout--dance-collapsed' : ''
          }`}
        >
          <RoomDanceFloor
            collapsed={danceFloorCollapsed}
            currentUserId={user?.uid}
            djUserId={danceFloorDjUserId}
            isMusicPlaying={avatarIsPlaying}
            onCollapsedChange={setDanceFloorCollapsed}
            onReaction={reaction => void handleRoomReaction(reaction)}
            onShowAllParticipants={() => setActiveRoomTab('participants')}
            participants={danceFloorParticipants}
            reactionPending={reactionPending}
            reactions={roomReactions}
          />

          <Box className="room-lower-layout__details min-w-0">
            <Tabs
              aria-label="Содержимое комнаты"
              onChange={(_event, value: 'participants' | 'queue') =>
                setActiveRoomTab(value)
              }
              sx={{
                minHeight: 0,
                '& .MuiTab-root': {
                  backgroundColor: '#3F3F59',
                  borderRadius: '12px',
                  color: '#D7DBF0',
                  fontFamily: 'Golos Text, sans-serif',
                  fontWeight: 700,
                  fontSize: { xs: '16px', sm: '20px' },
                  minHeight: { xs: '44px', sm: '48px' },
                  minWidth: 0,
                  padding: { xs: '7px 11px', sm: '8px 16px' },
                  textTransform: 'none',
                },
                '& .MuiTab-root.Mui-selected': {
                  backgroundColor: '#5D3A82',
                  color: '#FFFFFF',
                },
                '& .MuiTabs-flexContainer': { gap: '8px' },
                '& .MuiTabs-indicator': { display: 'none' },
              }}
              value={activeRoomTab}
            >
              <Tab label="Очередь" value="queue" />
              <Tab label="Участники" value="participants" />
            </Tabs>

            {activeRoomTab === 'queue' ? (
              <Box className="mt-3 min-w-0 max-w-[500px]">
                {queueLoading ? (
                  <Box className="flex min-h-12 items-center justify-center">
                    <CircularProgress size={24} sx={{ color: '#8B8DB3' }} />
                  </Box>
                ) : (
                  <Box
                    className="grid min-w-0 gap-2 overflow-x-auto pb-1"
                    component="ul"
                    sx={{
                      gridAutoColumns: {
                        xs: 'min(243px, calc(100vw - 60px))',
                        sm: '243px',
                      },
                      gridAutoFlow: 'column',
                      gridTemplateRows: 'repeat(4, 48px)',
                      listStyle: 'none',
                      marginLeft: 0,
                      marginRight: 0,
                      scrollbarColor: '#5C5D7E transparent',
                      scrollbarWidth: 'thin',
                    }}
                  >
                    {queueItems.map((queueItem, queueItemIndex) => {
                      return (
                        <RoomUserListItem
                          displayName={queueItem.displayName}
                          key={queueItem.id}
                          pending={queueItem.pending}
                          photoURL={queueItem.photoURL}
                          status={
                            queueItemIndex === 0
                              ? 'current'
                              : queueItemIndex === 1
                                ? 'next'
                                : undefined
                          }
                        />
                      )
                    })}

                    <Box
                      className="min-w-0 overflow-hidden"
                      component="li"
                      sx={{
                        backgroundColor: '#3F3F59',
                        borderRadius: '8px',
                        height: '48px',
                        width: {
                          xs: 'min(243px, calc(100vw - 60px))',
                          sm: '243px',
                        },
                      }}
                    >
                      <Button
                        aria-label={
                          currentUserAlreadyQueued
                            ? 'Покинуть очередь'
                            : 'Встать в очередь'
                        }
                        aria-busy={queueLeaving}
                        disabled={queueButtonDisabled}
                        fullWidth
                        onClick={() => {
                          if (currentUserAlreadyQueued) {
                            void handleLeaveQueue()
                          } else {
                            setQueueDialogOpen(true)
                          }
                        }}
                        sx={{
                          '&.Mui-disabled': {
                            color: '#FFFFFF',
                            opacity: 0.5,
                          },
                          '&:hover': { backgroundColor: '#4A4A68' },
                          backgroundColor: 'transparent',
                          borderRadius: '8px',
                          color: '#FFFFFF',
                          display: 'flex',
                          fontSize: '14px',
                          fontWeight: 400,
                          gap: '12px',
                          height: '48px',
                          justifyContent: 'flex-start',
                          padding: '2px 12px 2px 2px',
                          textTransform: 'none',
                          width: '100%',
                        }}
                      >
                        <Box
                          className="flex h-11 w-11 shrink-0 items-center justify-center text-[28px] font-light leading-none"
                          component="span"
                          sx={{
                            backgroundColor: '#6F70E7',
                            borderRadius: '6px',
                            color: '#FFFFFF',
                          }}
                        >
                          {currentUserAlreadyQueued ? '−' : '+'}
                        </Box>
                        <Box className="min-w-0 truncate" component="span">
                          {queueLeaving
                            ? 'Покидаем очередь…'
                            : currentUserAlreadyQueued
                              ? 'Покинуть очередь'
                              : 'Встать в очередь'}
                        </Box>
                      </Button>
                    </Box>
                  </Box>
                )}

                {queueError && (
                  <Typography
                    className="mt-2 text-sm"
                    role="alert"
                    sx={{ color: '#FF9BAD' }}
                  >
                    {queueError}
                  </Typography>
                )}

                {!queueEnabled && (
                  <Typography
                    className="mt-2 text-sm"
                    sx={{ color: '#D7DBF0' }}
                  >
                    Владелец комнаты отключил очередь для гостей.
                  </Typography>
                )}

                {!queueLoading && queueItems.length === 0 && !queueError && (
                  <Typography className="sr-only">
                    Очередь пока пуста. Встаньте в очередь первым.
                  </Typography>
                )}

                {currentUserAlreadyQueued && (
                  <Typography className="sr-only">
                    Вы уже находитесь в очереди.
                  </Typography>
                )}
              </Box>
            ) : (
              <Box
                className="mt-4 flex max-w-[500px] flex-col gap-2"
                component="ul"
                sx={{ listStyle: 'none', marginLeft: 0, marginRight: 0 }}
              >
                {participants.map(participant => (
                  <RoomUserListItem
                    actions={
                      <RoomParticipantActions
                        actorRole={currentMemberRole}
                        blocked={blockedUserIds.has(participant.id)}
                        participant={participant}
                        roomId={roomId}
                      />
                    }
                    displayName={participant.displayName}
                    key={participant.id}
                    online={participant.online}
                    photoURL={participant.photoURL}
                    roleBadge={<RoomRoleBadge role={participant.role} />}
                    secondaryLabel={`${ROOM_ROLE_LABELS[participant.role]}${participant.isGuest ? ' · гость' : ''}${participant.online ? '' : ' · не в сети'}`}
                  />
                ))}

                {participantsLoading && (
                  <Box className="flex min-h-[52px] items-center justify-center">
                    <CircularProgress size={24} sx={{ color: '#8B8DB3' }} />
                  </Box>
                )}

                {!participantsLoading &&
                  !participantsError &&
                  participants.length === 0 && (
                    <Typography component="li" sx={{ color: '#D7DBF0' }}>
                      В комнате пока никого нет.
                    </Typography>
                  )}

                {participantsError && (
                  <Typography
                    component="li"
                    role="alert"
                    sx={{ color: '#FF9BAD' }}
                  >
                    {participantsError}
                  </Typography>
                )}
              </Box>
            )}
          </Box>
        </Box>

        {error && (
          <Box className="mt-4 rounded-xl border border-[#8B3755] bg-[#35152C] p-3 text-sm text-[#FFB4C2]">
            {error}
          </Box>
        )}
      </Paper>

      <AddToQueueDialog
        onClose={() => setQueueDialogOpen(false)}
        onSubmit={handleJoinQueue}
        open={queueDialogOpen}
        roomId={roomId}
        userId={user?.uid ?? null}
      />
    </Box>
  )
}
