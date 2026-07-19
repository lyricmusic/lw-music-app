import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'

import {
  createReport,
  REPORT_COMMENT_MAX_LENGTH,
  type ReportTargetType,
} from '@/entities/report'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material'

interface ReportDialogProps {
  description: string
  onClose: () => void
  open: boolean
  roomId: string
  targetId: string
  targetType: ReportTargetType
}

const REPORT_REASONS = [
  ['spam', 'Спам или навязчивая реклама'],
  ['harassment', 'Оскорбления или травля'],
  ['hate', 'Ненависть или дискриминация'],
  ['sexual', 'Недопустимый контент'],
  ['fraud', 'Мошенничество'],
  ['illegal', 'Незаконный контент'],
  ['other', 'Другая причина'],
] as const

const darkFieldSx = {
  '& .MuiFormHelperText-root': { color: '#FF9BAD' },
  '& .MuiInputBase-input, & .MuiInputLabel-root, & .MuiSelect-icon': {
    color: '#F8F3FF',
  },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#6D4A8F' },
  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#B88CFF' },
}

export function ReportDialog({
  description,
  onClose,
  open,
  roomId,
  targetId,
  targetType,
}: ReportDialogProps) {
  const [comment, setComment] = useState('')
  const [error, setError] = useState<null | string>(null)
  const [pending, setPending] = useState(false)
  const [reason, setReason] = useState('spam')

  useEffect(() => {
    if (!open) return
    setComment('')
    setError(null)
    setReason('spam')
  }, [open])

  const handleClose = () => {
    if (!pending) onClose()
  }

  const handleSubmit = async () => {
    setPending(true)
    setError(null)
    try {
      await createReport({ comment, reason, roomId, targetId, targetType })
      toast.success('Жалоба отправлена. Снимок объекта сохранён для проверки.')
      onClose()
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Не удалось отправить жалобу.',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      fullWidth
      maxWidth="sm"
      onClose={handleClose}
      open={open}
      slotProps={{
        paper: {
          sx: {
            backgroundColor: '#24143D',
            backgroundImage: 'none',
            border: '1px solid #4A2B6D',
            color: '#F8F3FF',
          },
        },
      }}
    >
      <DialogTitle>Отправить жалобу</DialogTitle>
      <DialogContent
        sx={{ display: 'grid', gap: 2, paddingTop: '12px !important' }}
      >
        <Typography color="#D7DBF0" variant="body2">
          {description}
        </Typography>
        <TextField
          disabled={pending}
          label="Причина"
          onChange={event => setReason(event.target.value)}
          select
          sx={darkFieldSx}
          value={reason}
        >
          {REPORT_REASONS.map(([value, label]) => (
            <MenuItem key={value} value={value}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          disabled={pending}
          error={Boolean(error)}
          helperText={
            error ?? 'Необязательно. Не добавляйте персональные данные.'
          }
          inputProps={{ maxLength: REPORT_COMMENT_MAX_LENGTH }}
          label="Комментарий"
          minRows={3}
          multiline
          onChange={event => {
            setComment(event.target.value)
            if (error) setError(null)
          }}
          sx={darkFieldSx}
          value={comment}
        />
      </DialogContent>
      <DialogActions sx={{ padding: 3, paddingTop: 1 }}>
        <Button disabled={pending} onClick={handleClose}>
          Отмена
        </Button>
        <Button
          disabled={pending}
          onClick={() => void handleSubmit()}
          variant="contained"
        >
          {pending ? 'Отправляем…' : 'Отправить жалобу'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
