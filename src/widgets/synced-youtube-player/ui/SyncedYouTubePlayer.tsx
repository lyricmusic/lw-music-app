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
import {
  Box,
  Button,
  CircularProgress,
  Fade,
  Modal,
  TextField,
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

  const handlePlayerStateChange = useCallback((event: YT.OnStateChangeEvent) => {
    if (event.data === YT.PlayerState.PLAYING) setAutoplayBlocked(false)
  }, [])

  useEffect(() => {
    let disposed = false

    loadYouTubeIframeApi()
      .then(() => {
        if (disposed || !playerContainerRef.current || !window.YT) return

        playerRef.current = new window.YT.Player(playerContainerRef.current, {
          events: {
            onAutoplayBlocked: () => setAutoplayBlocked(true),
            onError: event => {
              setError(
                youtubeErrorMessages[event.data] ??
                  `YouTube вернул ошибку ${event.data}.`,
              )
            },
            onReady: event => {
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
  }, [applyRemoteState, handlePlayerStateChange])

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

  const syncLabels: Record<SyncStatus, string> = {
    connected: 'Firestore подключён',
    connecting: 'Подключаем Firestore…',
    error: 'Ошибка синхронизации',
    syncing: 'Сохраняем состояние…',
  }
  const queueIsEmpty =
    syncStatus === 'connected' && !remoteState && !localQueuedVideoId

  return (
    <section
      className="rounded-[20px] bg-gray-block p-5"
      data-testid="video-sync-player"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-ultrabold">YouTube-синхронизация</h1>
          <p className="text-sm text-secondary-text">
            Комната: <span className="font-neue">{roomId}</span>
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-white px-3 py-2">
            {syncEnabled ? syncLabels[syncStatus] : 'Локальный режим'}
          </span>
          {remoteState && (
            <span className="rounded-full bg-white px-3 py-2">
              Ревизия {remoteState.revision}
            </span>
          )}
        </div>
      </div>

      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
        {!playerReady && (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-white">
            <CircularProgress color="inherit" />
          </div>
        )}
        <div
          className="pointer-events-none h-full w-full"
          ref={playerContainerRef}
        />
      </div>

      {queueIsEmpty && (
        <Button
          disabled={!playerReady}
          fullWidth
          onClick={() => setQueueDialogOpen(true)}
          sx={{
            '&:hover': { backgroundColor: '#5D5FD4' },
            backgroundColor: '#6F70E7',
            color: '#FFFFFF',
            fontSize: '18px',
            marginTop: '16px',
          }}
          variant="contained"
        >
          Встать в очередь
        </Button>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-secondary-text">
          {formatPlaybackTime(currentTime)} / {formatPlaybackTime(duration)}
          {remoteState && (
            <span className="ml-3">
              Эфир: играет
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!playerReady}
            onClick={handleToggleSound}
            variant="outlined"
          >
            {muted ? 'Включить звук' : 'Выключить звук'}
          </Button>
        </div>
      </div>

      {autoplayBlocked && (
        <div className="mt-4 rounded-xl bg-[#FFF3CD] p-3 text-sm">
          Браузер заблокировал автозапуск. Нажмите «Включить звук», чтобы
          запустить видео.
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-xl bg-[#FFE3E8] p-3 text-sm text-[#8B2635]">
          {error}
        </div>
      )}

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
          <Box component="form" onSubmit={handleJoinQueue} sx={queueDialogStyle}>
            <button
              aria-label="Закрыть окно"
              className="absolute right-0 top-[-62px] h-12 w-12 border-0 bg-transparent p-0"
              disabled={queueSubmitting}
              onClick={() => setQueueDialogOpen(false)}
              type="button"
            >
              <span className="absolute left-0 top-[22px] block h-[4px] w-12 rotate-45 rounded-full bg-white" />
              <span className="absolute left-0 top-[22px] block h-[4px] w-12 -rotate-45 rounded-full bg-white" />
            </button>

            <h2
              className="font-ultrabold"
              id="queue-dialog-title"
              style={{ fontSize: '58px', lineHeight: 1.1, marginBottom: 20 }}
            >
              Добавление в очередь
            </h2>
            <p
              id="queue-dialog-description"
              style={{
                color: '#8B8DB3',
                fontSize: '26px',
                lineHeight: '39px',
                marginBottom: 16,
              }}
            >
              Введите ссылку на видео на YouTube
            </p>

            <TextField
              error={Boolean(queueInputError)}
              fullWidth
              helperText={queueInputError}
              label="Ссылка на видео"
              onChange={event => {
                setVideoUrl(event.target.value)
                if (queueInputError) setQueueInputError(null)
              }}
              sx={{
                marginBottom: '30px',
                '& .MuiFormHelperText-root': {
                  marginLeft: '30px',
                  position: 'absolute',
                  top: '62px',
                },
                '& .MuiInputLabel-root': {
                  color: '#8B8DB3',
                  fontSize: '24px',
                  left: '30px',
                  transform: 'translate(0, 20px) scale(1)',
                },
                '& .MuiInputLabel-root.Mui-focused': { color: '#6F70E7' },
                '& .MuiInputLabel-shrink': {
                  transform: 'translate(0, -3px) scale(0.75)',
                },
                '& .MuiInputBase-input': {
                  boxSizing: 'border-box',
                  fontSize: '20px',
                  height: '66px',
                  padding: '20px 30px 12px',
                },
                '& .MuiInput-root:after': { borderBottomColor: '#6F70E7' },
                '& .MuiInput-root:before': {
                  borderBottom: '2px solid rgba(255, 255, 255, 0.72)',
                },
                '& .MuiInput-root:hover:not(.Mui-disabled, .Mui-error):before': {
                  borderBottom: '2px solid rgba(255, 255, 255, 0.95)',
                },
              }}
              value={videoUrl}
              variant="standard"
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
    </section>
  )
}
