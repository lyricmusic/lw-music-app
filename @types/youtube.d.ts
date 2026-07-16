declare namespace YT {
  enum PlayerState {
    BUFFERING = 3,
    CUED = 5,
    ENDED = 0,
    PAUSED = 2,
    PLAYING = 1,
    UNSTARTED = -1,
  }

  interface PlayerEvent {
    target: Player
  }

  interface OnErrorEvent extends PlayerEvent {
    data: number
  }

  interface OnStateChangeEvent extends PlayerEvent {
    data: number
  }

  interface PlayerOptions {
    events?: {
      onAutoplayBlocked?: (event: PlayerEvent) => void
      onError?: (event: OnErrorEvent) => void
      onReady?: (event: PlayerEvent) => void
      onStateChange?: (event: OnStateChangeEvent) => void
    }
    height?: number | string
    playerVars?: Record<string, number | string>
    videoId?: string
    width?: number | string
  }

  interface VideoData {
    title?: string
    video_id?: string
  }

  class Player {
    constructor(element: HTMLElement | string, options: PlayerOptions)

    cueVideoById(options: { startSeconds?: number; videoId: string }): void
    destroy(): void
    getCurrentTime(): number
    getDuration(): number
    getPlayerState(): number
    getVideoData(): VideoData
    isMuted(): boolean
    loadVideoById(options: { startSeconds?: number; videoId: string }): void
    mute(): void
    pauseVideo(): void
    playVideo(): void
    seekTo(seconds: number, allowSeekAhead: boolean): void
    unMute(): void
  }
}

interface Window {
  YT?: typeof YT
  onYouTubeIframeAPIReady?: () => void
}
