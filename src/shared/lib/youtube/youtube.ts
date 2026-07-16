let youtubeApiPromise: null | Promise<void> = null

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

    if (hostname === 'youtube.com' || hostname === 'm.youtube.com') {
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
