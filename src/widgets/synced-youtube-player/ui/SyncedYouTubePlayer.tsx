import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { auth, db } from '@/shared/api/firebase'
import {
  extractYouTubeVideoId,
  formatPlaybackTime,
  loadYouTubeIframeApi,
} from '@/shared/lib/youtube'
import { Button } from '@/shared/ui/button'
import { TextField } from '@/shared/ui/text-field'
import {
  Box,
  CircularProgress,
  Fade,
  Modal,
  Paper,
  Tab,
  Tabs,
  Typography,
} from '@mui/material'
import {
  Timestamp,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore'

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

const REMOTE_DRIFT_THRESHOLD_SECONDS = 1.5

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

const youtubeErrorMessages: Record<number, string> = {
  2: 'Некорректная ссылка или ID видео.',
  5: 'YouTube не смог воспроизвести это видео в HTML5-плеере.',
  100: 'Видео удалено, скрыто или не существует.',
  101: 'Автор запретил воспроизведение этого видео на сторонних сайтах.',
  150: 'Автор запретил воспроизведение этого видео на сторонних сайтах.',
  153: 'YouTube не смог определить источник встроенного плеера.',
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
  const playbackRef = useMemo(
    () => doc(db, 'rooms', roomId, 'playback', 'current'),
    [roomId],
  )
  const playerContainerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<null | YT.Player>(null)
  const lastRemoteStateRef = useRef<null | PlaybackState>(null)
  const autoplayRecoveryVideoIdRef = useRef<null | string>(null)
  const suppressPlayerEventsUntilRef = useRef(0)
  const writeQueueRef = useRef(Promise.resolve())

  const [videoUrl, setVideoUrl] = useState('')
  const [playerReady, setPlayerReady] = useState(false)
  const [muted, setMuted] = useState(true)
  const [autoplayBlocked, setAutoplayBlocked] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('connecting')
  const [error, setError] = useState<null | string>(null)
  const [remoteState, setRemoteState] = useState<null | PlaybackState>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [queueDialogOpen, setQueueDialogOpen] = useState(false)
  const [queueSubmitting, setQueueSubmitting] = useState(false)
  const [queueInputError, setQueueInputError] = useState<null | string>(null)
  const [activeRoomTab, setActiveRoomTab] = useState<'participants' | 'queue'>(
    'queue',
  )
  const [localQueuedVideoId, setLocalQueuedVideoId] = useState<null | string>(
    null,
  )

  const publishPlayback = useCallback(
    (videoId: string, status: PlaybackStatus, rawPosition: number) => {
      if (!syncEnabled) return Promise.resolve()

      const user = auth.currentUser
      if (!user) {
        setError('Для синхронизации нужно войти в аккаунт.')
        return Promise.resolve()
      }

      const positionSeconds = Number.isFinite(rawPosition)
        ? Math.max(0, rawPosition)
        : 0
      setSyncStatus('syncing')

      writeQueueRef.current = writeQueueRef.current
        .then(async () => {
          await runTransaction(db, async transaction => {
            const snapshot = await transaction.get(playbackRef)
            const currentRevision = snapshot.exists()
              ? Number(snapshot.data().revision) || 0
              : 0

            transaction.set(playbackRef, {
              changedAt: serverTimestamp(),
              changedBy: user.uid,
              positionSeconds,
              revision: currentRevision + 1,
              status,
              videoId,
            })
          })
          setSyncStatus('connected')
        })
        .catch(reason => {
          console.error('Не удалось обновить состояние плеера:', reason)
          setError(
            'Firestore отклонил синхронизацию. Опубликуйте обновлённые firestore.rules.',
          )
          setSyncStatus('error')
        })

      return writeQueueRef.current
    },
    [playbackRef, syncEnabled],
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

      const user = auth.currentUser
      if (!user) return Promise.resolve()

      setSyncStatus('syncing')
      writeQueueRef.current = writeQueueRef.current
        .then(async () => {
          await runTransaction(db, async transaction => {
            const snapshot = await transaction.get(playbackRef)
            if (
              !snapshot.exists() ||
              snapshot.data().videoId !== finishedVideoId
            ) {
              return
            }

            transaction.delete(playbackRef)
          })
          setLocalQueuedVideoId(currentVideoId =>
            currentVideoId === finishedVideoId ? null : currentVideoId,
          )
          setSyncStatus('connected')
        })
        .catch(reason => {
          console.error('Не удалось очистить завершённое видео:', reason)
          setError(
            'Firestore отклонил очистку завершённого видео. Опубликуйте обновлённые firestore.rules.',
          )
          setSyncStatus('error')
        })

      return writeQueueRef.current
    },
    [playbackRef, syncEnabled],
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
              setError(
                youtubeErrorMessages[event.data] ??
                  `YouTube вернул ошибку ${event.data}.`,
              )
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
  }, [applyRemoteState, handleAutoplayBlocked, handlePlayerStateChange])

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

  const handleJoinQueue = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const player = playerRef.current
    const videoId = extractYouTubeVideoId(videoUrl)

    if (!videoId) {
      setQueueInputError(
        'Вставьте корректную ссылку YouTube или ID из 11 символов.',
      )
      return
    }

    if (!playerReady || !player) {
      setQueueInputError('Плеер ещё загружается. Попробуйте через пару секунд.')
      return
    }

    setError(null)
    setQueueInputError(null)
    setQueueSubmitting(true)
    setAutoplayBlocked(false)
    suppressPlayerEventsUntilRef.current = Date.now() + 800
    player.loadVideoById({ startSeconds: 0, videoId })
    setLocalQueuedVideoId(videoId)
    await publishPlayback(videoId, 'playing', 0)
    setQueueSubmitting(false)
    setQueueDialogOpen(false)
    setVideoUrl('')
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

  const queueIsEmpty =
    syncStatus === 'connected' && !remoteState && !localQueuedVideoId
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
          <Box className="mt-4 max-w-[500px]">
            <Typography className="mb-3 text-[#D7DBF0]">
              {syncStatus === 'connecting'
                ? 'Загружаем очередь…'
                : queueIsEmpty
                  ? 'Очередь пока пуста'
                  : 'Видео сейчас воспроизводится'}
            </Typography>

            {queueIsEmpty && (
              <Button
                disabled={!playerReady}
                onClick={() => setQueueDialogOpen(true)}
                sx={{
                  '&:hover': { backgroundColor: '#5D5FD4' },
                  backgroundColor: '#6F70E7',
                  color: '#FFFFFF',
                  fontSize: '16px',
                  padding: '12px 20px',
                }}
                variant="contained"
              >
                Встать в очередь
              </Button>
            )}
          </Box>
        ) : (
          <Typography className="mt-4 text-[#D7DBF0]">
            Список участников появится здесь.
          </Typography>
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
            onSubmit={handleJoinQueue}
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
              error={Boolean(queueInputError)}
              helperText={queueInputError}
              onChange={event => {
                setVideoUrl(event.target.value)
                if (queueInputError) setQueueInputError(null)
              }}
              placeholder="Ссылка на видео"
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
              value={videoUrl}
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
              Встать в очередь
            </Button>
          </Box>
        </Fade>
      </Modal>
    </Box>
  )
}
