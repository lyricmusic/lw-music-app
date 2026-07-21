const RUTUBE_VIDEO_ID_PATTERN = /^[a-f\d]{32}$/i

export function isRutubeVideoId(value: unknown): value is string {
  return typeof value === 'string' && RUTUBE_VIDEO_ID_PATTERN.test(value)
}

export function extractRutubeVideoId(value: string) {
  const input = value.trim()

  if (isRutubeVideoId(input)) return input.toLowerCase()

  try {
    const url = new URL(input)
    const hostname = url.hostname.replace(/^www\./, '')
    if (hostname !== 'rutube.ru') return null

    const [type, subtype, candidate] = url.pathname.split('/').filter(Boolean)
    const videoId =
      type === 'video' || type === 'shorts'
        ? subtype
        : type === 'play' && subtype === 'embed'
          ? candidate
          : null

    return isRutubeVideoId(videoId) ? videoId.toLowerCase() : null
  } catch {
    return null
  }
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
