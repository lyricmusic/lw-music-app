import { useForm } from 'react-hook-form'

import { extractYouTubeVideoId } from '@/shared/lib/youtube'
import { Button } from '@/shared/ui/button'
import { TextField } from '@/shared/ui/text-field'
import { Box, Fade, Modal, Typography } from '@mui/material'

interface AddToQueueDialogProps {
  onClose: () => void
  onSubmit: (videoId: string) => Promise<void>
  open: boolean
}

interface QueueFormValues {
  videoUrl: string
}

const dialogStyle = {
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

export function AddToQueueDialog({
  onClose,
  onSubmit,
  open,
}: AddToQueueDialogProps) {
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<QueueFormValues>({ defaultValues: { videoUrl: '' } })

  const handleClose = () => {
    if (!isSubmitting) onClose()
  }

  const handleAddToQueue = async ({ videoUrl }: QueueFormValues) => {
    const videoId = extractYouTubeVideoId(videoUrl)

    if (!videoId) {
      setError('videoUrl', {
        message: 'Вставьте корректную ссылку YouTube или ID из 11 символов.',
        type: 'validate',
      })
      return
    }

    try {
      await onSubmit(videoId)
      reset()
      onClose()
    } catch (reason) {
      setError('videoUrl', {
        message:
          reason instanceof Error
            ? reason.message
            : 'Не удалось добавить видео в очередь.',
        type: 'server',
      })
    }
  }

  return (
    <Modal
      aria-describedby="queue-dialog-description"
      aria-labelledby="queue-dialog-title"
      closeAfterTransition
      onClose={handleClose}
      open={open}
      slotProps={{
        backdrop: {
          sx: { backgroundColor: 'rgba(20, 22, 42, 0.72)' },
        },
      }}
    >
      <Fade in={open}>
        <Box
          component="form"
          onSubmit={handleSubmit(handleAddToQueue)}
          sx={dialogStyle}
        >
          <Button
            aria-label="Закрыть окно"
            disabled={isSubmitting}
            onClick={handleClose}
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
            error={Boolean(errors.videoUrl)}
            helperText={errors.videoUrl?.message}
            placeholder="Ссылка на видео"
            {...register('videoUrl', {
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
            disabled={isSubmitting}
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
            {isSubmitting ? 'Проверяем видео…' : 'Встать в очередь'}
          </Button>
        </Box>
      </Fade>
    </Modal>
  )
}
