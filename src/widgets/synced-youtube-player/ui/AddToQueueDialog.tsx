import { useEffect, useState, type FormEvent } from 'react'

import {
  searchRoomYouTubeVideos,
  type YouTubeSearchResult,
} from '@/entities/room'
import { extractYouTubeVideoId } from '@/shared/lib/youtube'
import { Button } from '@/shared/ui/button'
import { TextField } from '@/shared/ui/text-field'
import {
  Box,
  ButtonBase,
  CircularProgress,
  Fade,
  Modal,
  Typography,
} from '@mui/material'

interface AddToQueueDialogProps {
  onClose: () => void
  onSubmit: (videoId: string) => Promise<void>
  open: boolean
  roomId: string
  userId: null | string
}

interface TrackOptionProps {
  adding: boolean
  disabled: boolean
  onSelect: (track: YouTubeSearchResult) => void
  track: YouTubeSearchResult
}

const RECENT_TRACK_LIMIT = 5
const RECENT_TRACK_STORAGE_PREFIX = 'syncly:recent-youtube-tracks:v1'

const dialogStyle = {
  backgroundColor: '#24143D',
  border: '1px solid #513574',
  borderRadius: '30px',
  boxShadow: 24,
  boxSizing: 'border-box',
  color: '#F8F3FF',
  left: '50%',
  maxHeight: 'calc(100dvh - 32px)',
  maxWidth: 'calc(100vw - 32px)',
  overflowY: 'auto',
  padding: '42px 48px 48px',
  position: 'absolute' as const,
  top: '50%',
  transform: 'translate(-50%, -50%)',
  width: 833,
  '@media (max-width: 640px)': {
    borderRadius: '20px',
    padding: '52px 18px 22px',
  },
}

function isYouTubeSearchResult(value: unknown): value is YouTubeSearchResult {
  if (!value || typeof value !== 'object') return false
  const track = value as Partial<YouTubeSearchResult>

  return (
    typeof track.channelTitle === 'string' &&
    typeof track.thumbnailUrl === 'string' &&
    track.thumbnailUrl.startsWith('https://') &&
    typeof track.title === 'string' &&
    typeof track.videoId === 'string' &&
    /^[\w-]{11}$/.test(track.videoId)
  )
}

function getRecentTrackStorageKey(userId: string) {
  return `${RECENT_TRACK_STORAGE_PREFIX}:${userId}`
}

function readRecentTracks(userId: null | string) {
  if (!userId) return []

  try {
    const stored = JSON.parse(
      window.localStorage.getItem(getRecentTrackStorageKey(userId)) ?? '[]',
    ) as unknown
    return Array.isArray(stored)
      ? stored.filter(isYouTubeSearchResult).slice(0, RECENT_TRACK_LIMIT)
      : []
  } catch {
    return []
  }
}

function rememberTrack(userId: null | string, track: YouTubeSearchResult) {
  const recentTracks = [
    track,
    ...readRecentTracks(userId).filter(item => item.videoId !== track.videoId),
  ].slice(0, RECENT_TRACK_LIMIT)

  if (userId) {
    try {
      window.localStorage.setItem(
        getRecentTrackStorageKey(userId),
        JSON.stringify(recentTracks),
      )
    } catch {
      // Local history is optional and must not block adding a video.
    }
  }

  return recentTracks
}

function TrackOption({ adding, disabled, onSelect, track }: TrackOptionProps) {
  return (
    <Box component="li" sx={{ minWidth: 0 }}>
      <ButtonBase
        aria-label={`Добавить в очередь: ${track.title}`}
        disabled={disabled}
        onClick={() => onSelect(track)}
        sx={{
          '&:hover': { backgroundColor: '#392454', borderColor: '#76549C' },
          alignItems: 'center',
          backgroundColor: '#1B0C32',
          border: '1px solid #513574',
          borderRadius: '14px',
          color: '#F8F3FF',
          display: 'flex',
          gap: { xs: '12px', sm: '16px' },
          justifyContent: 'flex-start',
          minHeight: { xs: '72px', sm: '82px' },
          opacity: disabled && !adding ? 0.55 : 1,
          padding: { xs: '8px', sm: '10px' },
          textAlign: 'left',
          transition: 'background-color 150ms, border-color 150ms',
          width: '100%',
        }}
        type="button"
      >
        <Box
          alt=""
          component="img"
          src={track.thumbnailUrl}
          sx={{
            aspectRatio: '16 / 9',
            borderRadius: '9px',
            flexShrink: 0,
            objectFit: 'cover',
            width: { xs: '88px', sm: '108px' },
          }}
        />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            sx={{
              display: '-webkit-box',
              fontSize: { xs: '14px', sm: '16px' },
              fontWeight: 700,
              lineHeight: 1.3,
              overflow: 'hidden',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 2,
            }}
          >
            {track.title}
          </Typography>
          <Typography
            noWrap
            sx={{ color: '#BDA8D5', fontSize: { xs: '12px', sm: '14px' } }}
          >
            {track.channelTitle || 'YouTube'}
          </Typography>
        </Box>
        {adding && (
          <CircularProgress
            aria-label="Добавляем видео"
            size={22}
            sx={{ color: '#B7A7FF', flexShrink: 0, marginRight: '6px' }}
          />
        )}
      </ButtonBase>
    </Box>
  )
}

export function AddToQueueDialog({
  onClose,
  onSubmit,
  open,
  roomId,
  userId,
}: AddToQueueDialogProps) {
  const [addingVideoId, setAddingVideoId] = useState<null | string>(null)
  const [error, setError] = useState<null | string>(null)
  const [musicOnly, setMusicOnly] = useState(true)
  const [query, setQuery] = useState('')
  const [recentTracks, setRecentTracks] = useState<YouTubeSearchResult[]>([])
  const [results, setResults] = useState<YouTubeSearchResult[]>([])
  const [searching, setSearching] = useState(false)

  const inputVideoId = extractYouTubeVideoId(query)
  const busy = searching || addingVideoId !== null

  useEffect(() => {
    if (open) setRecentTracks(readRecentTracks(userId))
  }, [open, userId])

  const resetDialog = () => {
    setAddingVideoId(null)
    setError(null)
    setMusicOnly(true)
    setQuery('')
    setResults([])
    setSearching(false)
  }

  const handleClose = () => {
    if (busy) return
    resetDialog()
    onClose()
  }

  const handleAddTrack = async (track: YouTubeSearchResult) => {
    setAddingVideoId(track.videoId)
    setError(null)

    try {
      await onSubmit(track.videoId)
      setRecentTracks(rememberTrack(userId, track))
      resetDialog()
      onClose()
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Не удалось добавить видео в очередь.',
      )
    } finally {
      setAddingVideoId(null)
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedQuery = query.trim()
    setError(null)

    if (!normalizedQuery) {
      setError('Введите название трека или вставьте ссылку YouTube.')
      return
    }

    if (inputVideoId) {
      await handleAddTrack({
        channelTitle: 'Добавлено по ссылке',
        thumbnailUrl: `https://i.ytimg.com/vi/${inputVideoId}/mqdefault.jpg`,
        title: 'Видео YouTube',
        videoId: inputVideoId,
      })
      return
    }

    if (normalizedQuery.length < 2 || normalizedQuery.length > 100) {
      setError('Поисковый запрос должен содержать от 2 до 100 символов.')
      return
    }

    setSearching(true)
    setResults([])
    try {
      const items = await searchRoomYouTubeVideos({
        musicOnly,
        query: normalizedQuery,
        roomId,
      })
      setResults(items)
      if (items.length === 0) {
        setError('Ничего не найдено. Измените запрос или вставьте ссылку.')
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Не удалось выполнить поиск на YouTube.',
      )
    } finally {
      setSearching(false)
    }
  }

  const handleFilterChange = (nextMusicOnly: boolean) => {
    if (nextMusicOnly === musicOnly || busy) return
    setMusicOnly(nextMusicOnly)
    setResults([])
    setError(null)
  }

  const visibleTracks = results.length > 0 ? results : recentTracks
  const visibleTracksTitle =
    results.length > 0 ? 'Результаты' : 'Недавно выбирали'

  return (
    <Modal
      aria-describedby="queue-dialog-description"
      aria-labelledby="queue-dialog-title"
      closeAfterTransition
      onClose={handleClose}
      open={open}
      slotProps={{
        backdrop: {
          sx: { backgroundColor: 'rgba(20, 10, 36, 0.78)' },
        },
      }}
    >
      <Fade in={open}>
        <Box component="form" onSubmit={handleSubmit} sx={dialogStyle}>
          <Button
            aria-label="Закрыть окно"
            disabled={busy}
            onClick={handleClose}
            sx={{
              '&:hover': { backgroundColor: 'transparent' },
              backgroundColor: 'transparent',
              height: '40px',
              minWidth: '40px',
              padding: 0,
              position: 'absolute',
              right: '12px',
              top: '10px',
              width: '40px',
            }}
            type="button"
          >
            <Box
              component="span"
              sx={{
                backgroundColor: '#FFFFFF',
                borderRadius: '999px',
                height: '3px',
                left: '8px',
                position: 'absolute',
                top: '19px',
                transform: 'rotate(45deg)',
                width: '24px',
              }}
            />
            <Box
              component="span"
              sx={{
                backgroundColor: '#FFFFFF',
                borderRadius: '999px',
                height: '3px',
                left: '8px',
                position: 'absolute',
                top: '19px',
                transform: 'rotate(-45deg)',
                width: '24px',
              }}
            />
          </Button>

          <Typography
            component="h2"
            id="queue-dialog-title"
            sx={{
              fontSize: { xs: '30px', sm: '40px', md: '46px' },
              lineHeight: 1.1,
              marginBottom: '10px',
              overflowWrap: 'anywhere',
            }}
            variant="h2"
          >
            Добавление в очередь
          </Typography>
          <Typography
            id="queue-dialog-description"
            sx={{
              color: '#CDBCE2',
              fontSize: { xs: '16px', sm: '19px' },
              lineHeight: 1.45,
              marginBottom: '18px',
            }}
          >
            Найдите трек или вставьте ссылку YouTube
          </Typography>

          <Box
            aria-label="Фильтр поиска"
            role="group"
            sx={{ display: 'flex', gap: '8px', marginBottom: '12px' }}
          >
            {[
              { label: 'Музыка', value: true },
              { label: 'Все видео', value: false },
            ].map(filter => (
              <Button
                aria-pressed={musicOnly === filter.value}
                disabled={busy}
                key={filter.label}
                onClick={() => handleFilterChange(filter.value)}
                sx={{
                  '&:hover': {
                    backgroundColor:
                      musicOnly === filter.value ? '#7258C8' : '#352149',
                  },
                  backgroundColor:
                    musicOnly === filter.value ? '#654DB8' : '#1B0C32',
                  border: '1px solid #654A84',
                  borderRadius: '999px',
                  color: '#F8F3FF',
                  minHeight: '38px',
                  padding: '6px 16px',
                }}
                type="button"
              >
                {filter.label}
              </Button>
            ))}
          </Box>

          <TextField
            autoComplete="off"
            disabled={busy}
            error={Boolean(error)}
            helperText={error}
            inputProps={{ maxLength: 500 }}
            onChange={event => {
              setQuery(event.target.value)
              if (error) setError(null)
            }}
            placeholder="Название трека или ссылка YouTube"
            sx={{
              marginBottom: error ? '12px' : '18px',
              '& .MuiFilledInput-root': {
                backgroundColor: '#1B0C32',
                border: '1px solid #513574',
                borderRadius: '16px',
                height: { xs: '56px', sm: '62px' },
              },
              '& .MuiFilledInput-input': {
                color: '#F8F3FF',
                fontSize: { xs: '16px', sm: '18px' },
                height: { xs: '56px', sm: '62px' },
                padding: { xs: '0 16px', sm: '0 22px' },
              },
            }}
            value={query}
          />

          <Button
            disabled={busy}
            fullWidth
            sx={{
              '&.Mui-disabled': { color: '#FFFFFF', opacity: 0.62 },
              '&:hover': { backgroundColor: '#5D5FD4' },
              backgroundColor: '#6F70E7',
              borderRadius: '14px',
              color: '#FFFFFF',
              fontSize: { xs: '17px', sm: '19px' },
              height: { xs: '54px', sm: '60px' },
              marginBottom: visibleTracks.length > 0 ? '22px' : 0,
            }}
            type="submit"
            variant="contained"
          >
            {searching
              ? 'Ищем…'
              : addingVideoId
                ? 'Добавляем…'
                : inputVideoId
                  ? 'Добавить в очередь'
                  : 'Найти'}
          </Button>

          {visibleTracks.length > 0 && (
            <Box component="section" aria-labelledby="queue-tracks-title">
              <Typography
                component="h3"
                id="queue-tracks-title"
                sx={{
                  color: '#DCCEF0',
                  fontSize: { xs: '16px', sm: '18px' },
                  fontWeight: 700,
                  marginBottom: '10px',
                }}
              >
                {visibleTracksTitle}
              </Typography>
              <Box
                component="ul"
                sx={{
                  display: 'grid',
                  gap: '8px',
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                }}
              >
                {visibleTracks.map(track => (
                  <TrackOption
                    adding={addingVideoId === track.videoId}
                    disabled={busy}
                    key={track.videoId}
                    onSelect={selectedTrack =>
                      void handleAddTrack(selectedTrack)
                    }
                    track={track}
                  />
                ))}
              </Box>
            </Box>
          )}
        </Box>
      </Fade>
    </Modal>
  )
}
