import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'

import {
  advanceRoomQueue,
  enqueueRoomVideo,
  useRoomParticipants,
  useRoomQueue,
} from '@/entities/room'
import { useSession } from '@/entities/session'
import { db } from '@/shared/api/firebase'
import {
  checkYouTubeVideoEmbeddable,
  extractYouTubeVideoId,
  formatPlaybackTime,
  getYouTubeErrorMessage,
  loadYouTubeIframeApi,
} from '@/shared/lib/youtube'
import { Button } from '@/shared/ui/button'
import { TextField } from '@/shared/ui/text-field'
import {
  Avatar,
  Box,
  CircularProgress,
  Fade,
  Modal,
  Paper,
  Tab,
  Tabs,
  Typography,
} from '@mui/material'
import { Timestamp, doc, onSnapshot } from 'firebase/firestore'

interface SyncedYouTubePlayerProps {
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

interface QueueFormValues {
  videoUrl: string
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

const queueDialogStyle = {
  backgroundColor: '#D7DBF0',
  borderRadius: '30px',
  boxShadow: 24,
  boxSizing: 'border-box',
  left: '50%',
  maxWidth: 'calc(100vw - 32px)',
  padding: '50px 60px 60px',
  position: 'absolute' as const,
  top: '50%',
  transform: 'translate(-50%, -50%)',
  width: 833,
  '@media (max-width: 640px)': {
    borderRadius: '24px',
    padding: '32px 24px 24px',
  },
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

  const {
    formState: { errors: queueFormErrors, isSubmitting: queueSubmitting },
    handleSubmit: handleQueueSubmit,
    register: registerQueueField,
    reset: resetQueueForm,
    setError: setQueueFormError,
  } = useForm<QueueFormValues>({ defaultValues: { videoUrl: '' } })
  const [playerReady, setPlayerReady] = useState(false)
  const [muted, setMuted] = useState(true)
  const [autoplayBlocked, setAutoplayBlocked] = useState(false)
  const [, setSyncStatus] = useState<SyncStatus>('connecting')
  const [error, setError] = useState<null | string>(null)
  const [remoteState, setRemoteState] = useState<null | PlaybackState>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [queueDialogOpen, setQueueDialogOpen] = useState(false)
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

  const handleJoinQueue = async ({ videoUrl }: QueueFormValues) => {
    const player = playerRef.current
    const videoId = extractYouTubeVideoId(videoUrl)

    if (!videoId) {
      setQueueFormError('videoUrl', {
        message: 'Вставьте корректную ссылку YouTube или ID из 11 символов.',
        type: 'validate',
      })
      return
    }

    if (!profile || !user) {
      setQueueFormError('videoUrl', {
        message: 'Чтобы встать в очередь, войдите в аккаунт.',
        type: 'server',
      })
      return
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

      setQueueDialogOpen(false)
      resetQueueForm()
    } catch (reason) {
      console.error('Не удалось добавить видео в очередь:', reason)
      setQueueFormError('videoUrl', {
        message:
          reason instanceof Error
            ? reason.message
            : 'Не удалось добавить видео в очередь.',
        type: 'server',
      })
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

  const currentUserAlreadyQueued = queueItems.some(
    queueItem => queueItem.userId === user?.uid,
  )
  const queueButtonDisabled =
    queueLoading || !profile || !user || currentUserAlreadyQueued
  const hasVideo = Boolean(remoteState || localQueuedVideoId)

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
                  gridAutoColumns: 'minmax(220px, 1fr)',
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
                  const isCurrent = queueItemIndex === 0
                  const isNext = queueItemIndex === 1

                  return (
                    <Box
                      className="flex h-12 min-w-0 items-center gap-3 pr-3"
                      component="li"
                      key={queueItem.id}
                      sx={{
                        backgroundColor: '#3F3F59',
                        border: '2px solid',
                        borderColor: isCurrent ? '#6F70E7' : 'transparent',
                        borderRadius: '8px',
                        opacity: queueItem.pending ? 0.72 : 1,
                      }}
                    >
                      <Avatar
                        alt={queueItem.displayName}
                        src={queueItem.photoURL ?? undefined}
                        variant="rounded"
                        sx={{
                          backgroundColor: '#6F70E7',
                          borderRadius: '7px',
                          flexShrink: 0,
                          fontSize: '14px',
                          height: 44,
                          width: 44,
                        }}
                      >
                        {getParticipantInitials(queueItem.displayName)}
                      </Avatar>

                      <Box className="min-w-0 flex-1">
                        <Typography
                          className="truncate text-[15px] leading-[18px]"
                          component="span"
                          sx={{ color: '#D7DBF0' }}
                        >
                          {queueItem.displayName}
                        </Typography>

                        {(isCurrent || isNext) && (
                          <Box className="mt-0.5 flex items-center gap-1.5">
                            <Box
                              component="span"
                              sx={{
                                backgroundColor: isCurrent
                                  ? '#6F70E7'
                                  : 'transparent',
                                border: isNext ? '1px solid #8B8DB3' : 'none',
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
                              {isCurrent ? 'Сейчас показывает' : 'Следующий'}
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    </Box>
                  )
                })}

                <Box
                  className="h-12 min-w-0 overflow-hidden"
                  component="li"
                  sx={{
                    backgroundColor: '#3F3F59',
                    borderRadius: '8px',
                  }}
                >
                  <Button
                    aria-label="Встать в очередь"
                    disabled={queueButtonDisabled}
                    fullWidth
                    onClick={() => setQueueDialogOpen(true)}
                    sx={{
                      '&.Mui-disabled': {
                        color: '#D7DBF0',
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
                      padding: 0,
                      paddingRight: '12px',
                      textTransform: 'none',
                    }}
                  >
                    <Box
                      className="flex h-11 w-11 shrink-0 items-center justify-center text-[28px] font-light leading-none"
                      component="span"
                      sx={{
                        backgroundColor: '#6F70E7',
                        borderRadius: '7px',
                        color: '#FFFFFF',
                      }}
                    >
                      +
                    </Box>
                    <Box className="min-w-0 truncate" component="span">
                      Встать в очередь
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
              <Box
                className="flex min-h-[52px] items-center gap-3 p-1 pr-4"
                component="li"
                key={participant.id}
                sx={{
                  backgroundColor: '#3F3F59',
                  borderRadius: '10px',
                }}
              >
                <Avatar
                  alt={participant.displayName}
                  src={participant.photoURL ?? undefined}
                  variant="rounded"
                  sx={{
                    backgroundColor: '#6F70E7',
                    borderRadius: '8px',
                    flexShrink: 0,
                    fontSize: '14px',
                    height: 44,
                    width: 44,
                  }}
                >
                  {getParticipantInitials(participant.displayName)}
                </Avatar>
                <Typography
                  className="min-w-0 truncate text-[16px] leading-5"
                  component="span"
                  sx={{ color: '#D7DBF0' }}
                >
                  {participant.displayName}
                </Typography>
              </Box>
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

      <Modal
        aria-describedby="queue-dialog-description"
        aria-labelledby="queue-dialog-title"
        closeAfterTransition
        onClose={() => {
          if (!queueSubmitting) setQueueDialogOpen(false)
        }}
        open={queueDialogOpen}
        slotProps={{
          backdrop: {
            sx: { backgroundColor: 'rgba(20, 22, 42, 0.72)' },
          },
        }}
      >
        <Fade in={queueDialogOpen}>
          <Box
            component="form"
            onSubmit={handleQueueSubmit(handleJoinQueue)}
            sx={queueDialogStyle}
          >
            <Button
              aria-label="Закрыть окно"
              disabled={queueSubmitting}
              onClick={() => setQueueDialogOpen(false)}
              sx={{
                '&:hover': { backgroundColor: 'transparent' },
                backgroundColor: 'transparent',
                height: '48px',
                minWidth: '48px',
                padding: 0,
                position: 'absolute',
                right: 0,
                top: '-62px',
                width: '48px',
              }}
            >
              <Box
                component="span"
                sx={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '999px',
                  height: '4px',
                  left: 0,
                  position: 'absolute',
                  top: '22px',
                  transform: 'rotate(45deg)',
                  width: '48px',
                }}
              />
              <Box
                component="span"
                sx={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '999px',
                  height: '4px',
                  left: 0,
                  position: 'absolute',
                  top: '22px',
                  transform: 'rotate(-45deg)',
                  width: '48px',
                }}
              />
            </Button>

            <Typography
              component="h2"
              id="queue-dialog-title"
              sx={{ fontSize: '58px', lineHeight: 1.1, marginBottom: '20px' }}
              variant="h2"
            >
              Добавление в очередь
            </Typography>
            <Typography
              id="queue-dialog-description"
              sx={{
                color: '#8B8DB3',
                fontSize: '26px',
                lineHeight: '39px',
                marginBottom: '16px',
              }}
            >
              Введите ссылку на видео на YouTube
            </Typography>

            <TextField
              error={Boolean(queueFormErrors.videoUrl)}
              helperText={queueFormErrors.videoUrl?.message}
              placeholder="Ссылка на видео"
              {...registerQueueField('videoUrl', {
                required: 'Введите ссылку на видео.',
                validate: value =>
                  Boolean(extractYouTubeVideoId(value)) ||
                  'Вставьте корректную ссылку YouTube или ID из 11 символов.',
              })}
              sx={{
                marginBottom: '30px',
                '& .MuiFormHelperText-root': {
                  marginLeft: '12px',
                },
                '& .MuiFilledInput-root': {
                  borderRadius: '16px',
                  height: '66px',
                },
                '& .MuiFilledInput-input': {
                  fontSize: '20px',
                  height: '66px',
                  padding: '0 30px',
                },
              }}
            />

            <Button
              disabled={queueSubmitting}
              fullWidth
              sx={{
                '&.Mui-disabled': { color: '#FFFFFF', opacity: 0.6 },
                '&:hover': { backgroundColor: '#5D5FD4' },
                backgroundColor: '#6F70E7',
                borderRadius: '16px',
                color: '#FFFFFF',
                fontSize: '22px',
                height: '78px',
                padding: 0,
              }}
              type="submit"
              variant="contained"
            >
              {queueSubmitting ? 'Проверяем видео…' : 'Встать в очередь'}
            </Button>
          </Box>
        </Fade>
      </Modal>
    </Box>
  )
}
