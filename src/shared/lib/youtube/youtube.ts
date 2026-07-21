let youtubeApiPromise: null | Promise<void> = null

const youtubeErrorMessages: Record<number, string> = {
  2: 'Некорректная ссылка или ID видео.',
  5: 'YouTube не смог воспроизвести это видео в HTML5-плеере.',
  100: 'Видео удалено, скрыто или не существует.',
  101: 'Владелец запретил воспроизведение этого видео на других сайтах.',
  150: 'Владелец запретил воспроизведение этого видео на других сайтах.',
  153: 'YouTube не смог определить источник встроенного плеера.',
}

export function extractYouTubeVideoId(value: string) {
  const input = value.trim()

  if (/^[\w-]{11}$/.test(input)) return input

  try {
    const url = new URL(input)
    const hostname = url.hostname.replace(/^www\./, '')

    if (hostname === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0]
      return id && /^[\w-]{11}$/.test(id) ? id : null
    }

    if (
      ['youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(hostname)
    ) {
      const queryId = url.searchParams.get('v')
      if (queryId && /^[\w-]{11}$/.test(queryId)) return queryId

      const [type, id] = url.pathname.split('/').filter(Boolean)
      if (
        ['embed', 'live', 'shorts'].includes(type) &&
        id &&
        /^[\w-]{11}$/.test(id)
      ) {
        return id
      }
    }
  } catch {
    return null
  }

  return null
}

export function formatPlaybackTime(value: number) {
  const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${rest
      .toString()
      .padStart(2, '0')}`
  }

  return `${minutes}:${rest.toString().padStart(2, '0')}`
}

export function getYouTubeErrorMessage(errorCode: number) {
  return (
    youtubeErrorMessages[errorCode] ??
    `YouTube вернул ошибку ${errorCode}. Выберите другое видео.`
  )
}

export function loadYouTubeIframeApi() {
  if (window.YT?.Player) return Promise.resolve()
  if (youtubeApiPromise) return youtubeApiPromise

  youtubeApiPromise = new Promise<void>((resolve, reject) => {
    const previousCallback = window.onYouTubeIframeAPIReady
    const timeout = window.setTimeout(() => {
      youtubeApiPromise = null
      reject(new Error('YouTube IFrame API не загрузился за 15 секунд.'))
    }, 15_000)

    window.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timeout)
      previousCallback?.()
      resolve()
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]',
    )

    if (existingScript) return

    const script = document.createElement('script')
    script.async = true
    script.src = 'https://www.youtube.com/iframe_api'
    script.addEventListener('error', () => {
      window.clearTimeout(timeout)
      youtubeApiPromise = null
      reject(new Error('Не удалось загрузить YouTube IFrame API.'))
    })
    document.head.append(script)
  })

  return youtubeApiPromise
}

export async function checkYouTubeVideoEmbeddable(videoId: string) {
  await loadYouTubeIframeApi()

  if (!window.YT) {
    throw new Error('YouTube API недоступен. Попробуйте ещё раз.')
  }

  return new Promise<void>((resolve, reject) => {
    const container = document.createElement('div')
    const playerHost = document.createElement('div')
    let player: null | YT.Player = null
    let settled = false

    container.setAttribute('aria-hidden', 'true')
    Object.assign(container.style, {
      height: '200px',
      left: '-10000px',
      pointerEvents: 'none',
      position: 'fixed',
      top: '-10000px',
      visibility: 'hidden',
      width: '200px',
    })
    container.append(playerHost)
    document.body.append(container)

    const timeout = window.setTimeout(() => {
      finish(
        new Error(
          'Не удалось проверить, разрешено ли встраивание видео. Попробуйте ещё раз.',
        ),
      )
    }, 12_000)

    const finish = (reason?: Error) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      player?.destroy()
      container.remove()

      if (reason) reject(reason)
      else resolve()
    }

    player = new window.YT.Player(playerHost, {
      events: {
        onError: event => finish(new Error(getYouTubeErrorMessage(event.data))),
        onReady: event => event.target.cueVideoById({ videoId }),
        onStateChange: event => {
          if (event.data === YT.PlayerState.CUED) finish()
        },
      },
      height: 200,
      playerVars: {
        controls: 0,
        disablekb: 1,
        enablejsapi: 1,
        origin: window.location.origin,
        playsinline: 1,
      },
      width: 200,
    })
  })
}
