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
import { Button, CircularProgress, TextField } from '@mui/material'
import {
  Timestamp,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore'

interface SyncedYouTubePlayerProps {
  isHost?: boolean
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

interface PlaybackAnchor {
  measuredAt: number
  positionSeconds: number
  status: PlaybackStatus
  videoId: string
}

const DEFAULT_VIDEO_URL = 'https://www.youtube.com/watch?v=M7lc1UVf-VE'
const REMOTE_DRIFT_THRESHOLD_SECONDS = 1.5
const MANUAL_SEEK_THRESHOLD_SECONDS = 1.25

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
  isHost = true,
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
  const playbackAnchorRef = useRef<null | PlaybackAnchor>(null)
  const lastPublishedRef = useRef<
    null | (PlaybackAnchor & { publishedAt: number })
  >(null)
  const writeQueueRef = useRef(Promise.resolve())

  const [videoUrl, setVideoUrl] = useState(DEFAULT_VIDEO_URL)
  const [playerReady, setPlayerReady] = useState(false)
  const [muted, setMuted] = useState(true)
  const [autoplayBlocked, setAutoplayBlocked] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('connecting')
  const [error, setError] = useState<null | string>(null)
  const [remoteState, setRemoteState] = useState<null | PlaybackState>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

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
      const now = Date.now()
      const lastPublished = lastPublishedRef.current
      const duplicate =
        lastPublished?.videoId === videoId &&
        lastPublished.status === status &&
        Math.abs(lastPublished.positionSeconds - positionSeconds) < 0.75 &&
        now - lastPublished.publishedAt < 1_500

      if (duplicate) return Promise.resolve()

      const anchor: PlaybackAnchor = {
        measuredAt: now,
        positionSeconds,
        status,
        videoId,
      }
      playbackAnchorRef.current = anchor
      lastPublishedRef.current = { ...anchor, publishedAt: now }
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
      if (state.status === 'playing') {
        player.loadVideoById({
          startSeconds: expectedPosition,
          videoId: state.videoId,
        })
      } else {
        player.cueVideoById({
          startSeconds: expectedPosition,
          videoId: state.videoId,
        })
      }
    } else {
      const localPosition = player.getCurrentTime()
      if (
        Math.abs(localPosition - expectedPosition) >
        REMOTE_DRIFT_THRESHOLD_SECONDS
      ) {
        player.seekTo(expectedPosition, true)
      }

      if (
        state.status === 'playing' &&
        player.getPlayerState() !== YT.PlayerState.PLAYING
      ) {
        player.playVideo()
      }

      if (
        state.status === 'paused' &&
        player.getPlayerState() === YT.PlayerState.PLAYING
      ) {
        player.pauseVideo()
      }
    }

    playbackAnchorRef.current = {
      measuredAt: Date.now(),
      positionSeconds: expectedPosition,
      status: state.status,
      videoId: state.videoId,
    }
  }, [])

  const handlePlayerStateChange = useCallback(
    (event: YT.OnStateChangeEvent) => {
      if (!isHost || Date.now() < suppressPlayerEventsUntilRef.current) return

      const videoId = event.target.getVideoData().video_id
      if (!videoId) return

      const positionSeconds = event.target.getCurrentTime()

      if (event.data === YT.PlayerState.PLAYING) {
        setAutoplayBlocked(false)
        void publishPlayback(videoId, 'playing', positionSeconds)
      }

      if (event.data === YT.PlayerState.PAUSED) {
        void publishPlayback(videoId, 'paused', positionSeconds)
      }

      if (event.data === YT.PlayerState.ENDED) {
        void publishPlayback(videoId, 'paused', event.target.getDuration())
      }
    },
    [isHost, publishPlayback],
  )

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
              } else {
                const defaultVideoId = extractYouTubeVideoId(DEFAULT_VIDEO_URL)
                if (defaultVideoId) {
                  event.target.cueVideoById({ videoId: defaultVideoId })
                }
              }
            },
            onStateChange: handlePlayerStateChange,
          },
          height: '100%',
          playerVars: {
            autoplay: 0,
            controls: isHost ? 1 : 0,
            disablekb: isHost ? 0 : 1,
            enablejsapi: 1,
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
  }, [applyRemoteState, handlePlayerStateChange, isHost])

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
        setVideoUrl(`https://youtu.be/${parsed.videoId}`)
        setSyncStatus('connected')

        const isOwnHostUpdate =
          isHost && parsed.changedBy === auth.currentUser?.uid
        if (!isOwnHostUpdate) applyRemoteState(parsed)
      },
      reason => {
        console.error('Не удалось подписаться на состояние плеера:', reason)
        setError(
          'Нет доступа к состоянию плеера. Опубликуйте обновлённые firestore.rules.',
        )
        setSyncStatus('error')
      },
    )
  }, [applyRemoteState, isHost, playbackRef, syncEnabled])

  useEffect(() => {
    if (!playerReady) return

    const interval = window.setInterval(() => {
      const player = playerRef.current
      if (!player) return

      const positionSeconds = player.getCurrentTime()
      setCurrentTime(positionSeconds)
      setDuration(player.getDuration())

      if (!isHost || Date.now() < suppressPlayerEventsUntilRef.current) return

      const playerState = player.getPlayerState()
      if (
        playerState !== YT.PlayerState.PLAYING &&
        playerState !== YT.PlayerState.PAUSED
      ) {
        return
      }

      const videoId = player.getVideoData().video_id
      if (!videoId) return

      const status: PlaybackStatus =
        playerState === YT.PlayerState.PLAYING ? 'playing' : 'paused'
      const anchor = playbackAnchorRef.current

      if (!anchor || anchor.videoId !== videoId || anchor.status !== status) {
        playbackAnchorRef.current = {
          measuredAt: Date.now(),
          positionSeconds,
          status,
          videoId,
        }
        return
      }

      const expectedPosition =
        anchor.status === 'playing'
          ? anchor.positionSeconds + (Date.now() - anchor.measuredAt) / 1000
          : anchor.positionSeconds

      if (
        Math.abs(positionSeconds - expectedPosition) >
        MANUAL_SEEK_THRESHOLD_SECONDS
      ) {
        void publishPlayback(videoId, status, positionSeconds)
      }
    }, 750)

    return () => window.clearInterval(interval)
  }, [isHost, playerReady, publishPlayback])

  const handleLoadVideo = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const player = playerRef.current
    const videoId = extractYouTubeVideoId(videoUrl)

    if (!videoId) {
      setError('Вставьте корректную ссылку YouTube или ID из 11 символов.')
      return
    }

    if (!playerReady || !player) {
      setError('Плеер ещё загружается. Попробуйте через пару секунд.')
      return
    }

    setError(null)
    setAutoplayBlocked(false)
    suppressPlayerEventsUntilRef.current = Date.now() + 800
    player.unMute()
    setMuted(false)
    player.loadVideoById({ startSeconds: 0, videoId })
    playbackAnchorRef.current = {
      measuredAt: Date.now(),
      positionSeconds: 0,
      status: 'playing',
      videoId,
    }
    void publishPlayback(videoId, 'playing', 0)
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

  const handleForceSync = () => {
    const remote = lastRemoteStateRef.current
    if (!remote) return

    setAutoplayBlocked(false)
    applyRemoteState(remote)
    if (remote.status === 'playing') playerRef.current?.playVideo()
  }

  const syncLabels: Record<SyncStatus, string> = {
    connected: 'Firestore подключён',
    connecting: 'Подключаем Firestore…',
    error: 'Ошибка синхронизации',
    syncing: 'Сохраняем состояние…',
  }

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
            {isHost ? 'Ведущий' : 'Слушатель'}
          </span>
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

      {isHost && (
        <form className="mb-4 flex gap-2" onSubmit={handleLoadVideo}>
          <TextField
            fullWidth
            label="Ссылка на YouTube"
            onChange={event => setVideoUrl(event.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            size="small"
            value={videoUrl}
          />
          <Button disabled={!playerReady} type="submit" variant="contained">
            Запустить
          </Button>
        </form>
      )}

      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
        {!playerReady && (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-white">
            <CircularProgress color="inherit" />
          </div>
        )}
        <div
          className={`h-full w-full ${isHost ? '' : 'pointer-events-none'}`}
          ref={playerContainerRef}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-secondary-text">
          {formatPlaybackTime(currentTime)} / {formatPlaybackTime(duration)}
          {remoteState && (
            <span className="ml-3">
              Эфир: {remoteState.status === 'playing' ? 'играет' : 'пауза'}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {!isHost && remoteState && (
            <Button onClick={handleForceSync} variant="outlined">
              Синхронизировать сейчас
            </Button>
          )}
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
          Браузер заблокировал автозапуск со звуком.{' '}
          {isHost
            ? 'Нажмите Play внутри видео.'
            : 'Нажмите «Синхронизировать сейчас» или «Включить звук».'}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-xl bg-[#FFE3E8] p-3 text-sm text-[#8B2635]">
          {error}
        </div>
      )}
    </section>
  )
}
