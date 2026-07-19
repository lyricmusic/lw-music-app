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
  type RoomMemberRole,
  useRoomParticipants,
  useRoomQueue,
} from '@/entities/room'
import { useSession } from '@/entities/session'
import { RoomParticipantActions } from '@/features/manage-room'
import { db } from '@/shared/api/firebase'
import {
  checkYouTubeVideoEmbeddable,
  formatPlaybackTime,
  getYouTubeErrorMessage,
  loadYouTubeIframeApi,
} from '@/shared/lib/youtube'
import { Button } from '@/shared/ui/button'
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

import { AddToQueueDialog } from './AddToQueueDialog'

interface SyncedYouTubePlayerProps {
  currentMemberRole?: null | RoomMemberRole
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
  secondaryLabel?: string
  status?: RoomUserListItemStatus
}

function RoomUserListItem({
  actions,
  displayName,
  online,
  pending = false,
  photoURL,
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
        width: '243px',
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

function allowAutoplay(player: YT.Player) {
  const iframe = player.getIframe()
  const allowedFeatures = iframe.allow
    .split(';')
    .map(feature => feature.trim())
    .filter(Boolean)

  if (!allowedFeatures.some(feature => feature.startsWith('autoplay'))) {
    iframe.allow = [...allowedFeatures, 'autoplay'].join('; ')
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
    !/^[\w-]{11}$/.test(videoId) ||
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

export function SyncedYouTubePlayer({
  currentMemberRole = null,
  queueEnabled = true,
  roomId,
  syncEnabled = true,
}: SyncedYouTubePlayerProps) {
  const { profile, user } = useSession()
  const {
    error: participantsError,
    loading: participantsLoading,
    participants,
  } = useRoomParticipants(roomId)
  const {
    error: queueError,
    items: queueItems,
    loading: queueLoading,
  } = useRoomQueue(roomId)
  const playbackRef = useMemo(
    () => doc(db, 'rooms', roomId, 'playback', 'current'),
    [roomId],
  )
  const playerContainerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<null | YT.Player>(null)
  const lastRemoteStateRef = useRef<null | PlaybackState>(null)
  const autoplayRecoveryVideoIdRef = useRef<null | string>(null)
  const suppressPlayerEventsUntilRef = useRef(0)
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
  const [activeRoomTab, setActiveRoomTab] = useState<'participants' | 'queue'>(
    'queue',
  )
  const [localQueuedVideoId, setLocalQueuedVideoId] = useState<null | string>(
    null,
  )

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

      if (!user) return Promise.resolve()

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
            'Firestore отклонил переход к следующему видео. Опубликуйте обновлённые firestore.rules.',
          )
          setSyncStatus('error')
        })

      return queueMutationRef.current
    },
    [roomId, syncEnabled, user],
  )

  const applyRemoteState = useCallback((state: PlaybackState) => {
    const player = playerRef.current
    if (!player) return

    const expectedPosition = getExpectedPosition(state)
    const currentVideoId = player.getVideoData().video_id
    const videoChanged = currentVideoId !== state.videoId
    suppressPlayerEventsUntilRef.current = Date.now() + 1_800

    if (videoChanged) {
      player.loadVideoById({
        startSeconds: expectedPosition,
        videoId: state.videoId,
      })
    } else {
      const localPosition = player.getCurrentTime()
      if (
        Math.abs(localPosition - expectedPosition) >
        REMOTE_DRIFT_THRESHOLD_SECONDS
      ) {
        player.seekTo(expectedPosition, true)
      }

      if (player.getPlayerState() !== YT.PlayerState.PLAYING) {
        player.playVideo()
      }
    }
  }, [])

  const handlePlayerStateChange = useCallback(
    (event: YT.OnStateChangeEvent) => {
      if (event.data === YT.PlayerState.PLAYING) {
        autoplayRecoveryVideoIdRef.current = null
        setAutoplayBlocked(false)
      }

      if (event.data === YT.PlayerState.ENDED) {
        const finishedVideoId = event.target.getVideoData().video_id
        if (finishedVideoId) void clearFinishedPlayback(finishedVideoId)
      }
    },
    [clearFinishedPlayback],
  )

  const handleAutoplayBlocked = useCallback(
    (event: YT.PlayerEvent) => {
      // Mobile browsers reject scripted playback with sound. Muting first and
      // retrying from the current room position keeps video sync automatic.
      event.target.mute()
      setMuted(true)
      setAutoplayBlocked(true)

      const remote = lastRemoteStateRef.current
      if (
        !remote ||
        remote.status !== 'playing' ||
        autoplayRecoveryVideoIdRef.current === remote.videoId
      ) {
        return
      }

      autoplayRecoveryVideoIdRef.current = remote.videoId
      window.setTimeout(() => {
        if (playerRef.current === event.target) {
          applyRemoteState(lastRemoteStateRef.current ?? remote)
        }
      }, 0)
    },
    [applyRemoteState],
  )

  useEffect(() => {
    let disposed = false

    loadYouTubeIframeApi()
      .then(() => {
        if (disposed || !playerContainerRef.current || !window.YT) return

        playerRef.current = new window.YT.Player(playerContainerRef.current, {
          events: {
            onAutoplayBlocked: handleAutoplayBlocked,
            onError: event => {
              setError(getYouTubeErrorMessage(event.data))

              if ([100, 101, 150].includes(event.data)) {
                const unavailableVideoId = event.target.getVideoData().video_id
                if (unavailableVideoId) {
                  void clearFinishedPlayback(unavailableVideoId)
                }
              }
            },
            onReady: event => {
              allowAutoplay(event.target)
              event.target.mute()
              setMuted(true)
              setPlayerReady(true)

              const remote = lastRemoteStateRef.current
              if (remote) {
                applyRemoteState(remote)
              }
            },
            onStateChange: handlePlayerStateChange,
          },
          height: '100%',
          playerVars: {
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            enablejsapi: 1,
            fs: 0,
            mute: 1,
            origin: window.location.origin,
            playsinline: 1,
            rel: 0,
          },
          width: '100%',
        })
      })
      .catch(reason => {
        setError(
          reason instanceof Error ? reason.message : 'YouTube API недоступен.',
        )
      })

    return () => {
      disposed = true
      playerRef.current?.destroy()
      playerRef.current = null
    }
  }, [
    applyRemoteState,
    clearFinishedPlayback,
    handleAutoplayBlocked,
    handlePlayerStateChange,
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
          'Нет доступа к состоянию плеера. Опубликуйте обновлённые firestore.rules.',
        )
        setSyncStatus('error')
      },
    )
  }, [applyRemoteState, playbackRef, syncEnabled])

  useEffect(() => {
    if (!playerReady) return

    const interval = window.setInterval(() => {
      const player = playerRef.current
      if (!player) return

      const positionSeconds = player.getCurrentTime()
      setCurrentTime(positionSeconds)
      setDuration(player.getDuration())

      const remote = lastRemoteStateRef.current
      if (
        !remote ||
        remote.status !== 'playing' ||
        Date.now() < suppressPlayerEventsUntilRef.current
      ) {
        return
      }

      const expectedPosition = getExpectedPosition(remote)

      if (
        Math.abs(positionSeconds - expectedPosition) >
        REMOTE_DRIFT_THRESHOLD_SECONDS
      ) {
        player.seekTo(expectedPosition, true)
      }

      if (
        player.getPlayerState() !== YT.PlayerState.PLAYING &&
        player.getPlayerState() !== YT.PlayerState.ENDED
      ) {
        player.playVideo()
      }
    }, 750)

    return () => window.clearInterval(interval)
  }, [playerReady])

  const handleJoinQueue = async (videoId: string) => {
    const player = playerRef.current

    if (!profile || !user) {
      throw new Error('Чтобы встать в очередь, войдите в аккаунт.')
    }

    try {
      await checkYouTubeVideoEmbeddable(videoId)

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

        if (playerReady && player) {
          suppressPlayerEventsUntilRef.current = Date.now() + 800
          player.loadVideoById({ startSeconds: 0, videoId })
        }
      }
    } catch (reason) {
      console.error('Не удалось добавить видео в очередь:', reason)
      throw reason
    }
  }

  const handleToggleSound = () => {
    const player = playerRef.current
    if (!player) return

    if (player.isMuted()) {
      player.unMute()
      setMuted(false)
      if (lastRemoteStateRef.current?.status === 'playing') player.playVideo()
    } else {
      player.mute()
      setMuted(true)
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
  const hasVideo = Boolean(remoteState || localQueuedVideoId)

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
          <Box
            className="pointer-events-none h-full w-full"
            ref={playerContainerRef}
          />

          <Box className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-black/80 to-transparent px-5 pb-4 pt-10 text-sm text-white">
            <Typography component="span" variant="body2">
              {formatPlaybackTime(currentTime)} / {formatPlaybackTime(duration)}
            </Typography>
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
                padding: '8px 16px',
              }}
              variant="outlined"
            >
              {muted ? 'Включить звук' : 'Выключить звук'}
            </Button>
          </Box>

          {autoplayBlocked && (
            <Box className="absolute left-4 right-4 top-4 rounded-xl bg-[#FFF3CD] p-3 text-sm text-[#25263E]">
              Восстанавливаем беззвучное воспроизведение и синхронизацию с
              комнатой…
            </Box>
          )}
        </Box>
      </Paper>

      <Paper
        className="room-queue-panel min-h-0 overflow-y-auto p-4"
        component="section"
        elevation={0}
        sx={{
          backgroundColor: '#2A2B47',
          borderRadius: '20px',
          color: '#FFFFFF',
        }}
      >
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
              fontSize: '20px',
              minHeight: '48px',
              minWidth: 0,
              padding: '8px 16px',
              textTransform: 'none',
            },
            '& .MuiTab-root.Mui-selected': {
              backgroundColor: '#FFFFFF',
              color: '#25263E',
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
                  gridAutoColumns: '243px',
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
                    width: '243px',
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
                      width: '243px',
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
              <Typography className="mt-2 text-sm" sx={{ color: '#D7DBF0' }}>
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
                    participant={participant}
                    roomId={roomId}
                  />
                }
                displayName={participant.displayName}
                key={participant.id}
                online={participant.online}
                photoURL={participant.photoURL}
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
              <Typography component="li" role="alert" sx={{ color: '#FF9BAD' }}>
                {participantsError}
              </Typography>
            )}
          </Box>
        )}

        {error && (
          <Box className="mt-4 rounded-xl bg-[#FFE3E8] p-3 text-sm text-[#8B2635]">
            {error}
          </Box>
        )}
      </Paper>

      <AddToQueueDialog
        onClose={() => setQueueDialogOpen(false)}
        onSubmit={handleJoinQueue}
        open={queueDialogOpen}
      />
    </Box>
  )
}
