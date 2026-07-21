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
  backgroundColor: '#24143D',
  border: '1px solid #513574',
  borderRadius: '30px',
  boxShadow: 24,
  boxSizing: 'border-box',
  color: '#F8F3FF',
  left: '50%',
  maxWidth: 'calc(100vw - 32px)',
  maxHeight: 'calc(100dvh - 32px)',
  overflowY: 'auto',
  padding: '50px 60px 60px',
  position: 'absolute' as const,
  top: '50%',
  transform: 'translate(-50%, -50%)',
  width: 833,
  '@media (max-width: 640px)': {
    borderRadius: '20px',
    padding: '56px 20px 24px',
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
              height: '40px',
              minWidth: '40px',
              padding: 0,
              position: 'absolute',
              right: '12px',
              top: '10px',
              width: '40px',
            }}
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
              fontSize: { xs: '32px', sm: '46px', md: '58px' },
              lineHeight: 1.1,
              marginBottom: { xs: '14px', sm: '20px' },
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
              fontSize: { xs: '18px', sm: '22px', md: '26px' },
              lineHeight: 1.5,
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
                backgroundColor: '#1B0C32',
                border: '1px solid #513574',
                borderRadius: '16px',
                height: { xs: '56px', sm: '66px' },
              },
              '& .MuiFilledInput-input': {
                color: '#F8F3FF',
                fontSize: { xs: '16px', sm: '20px' },
                height: { xs: '56px', sm: '66px' },
                padding: { xs: '0 18px', sm: '0 30px' },
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
              fontSize: { xs: '18px', sm: '22px' },
              height: { xs: '58px', sm: '78px' },
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
