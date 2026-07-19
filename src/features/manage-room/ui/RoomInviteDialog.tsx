import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'react-toastify'

import {
  createRoomInvite,
  getRoomInviteUrl,
  isRoomInviteAvailable,
  revokeRoomInvite,
  subscribeRoomInvites,
  type RoomInviteListItem,
  type RoomVisibility,
} from '@/entities/room'
import { routes } from '@/shared/config/routes'
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'

interface RoomInviteDialogProps {
  onClose: () => void
  open: boolean
  roomId: string
  visibility: RoomVisibility
}

interface InviteFormValues {
  maxUses: number
  validForHours: number
}

const dialogPaperSx = {
  background:
    'linear-gradient(145deg, rgba(43, 20, 72, 0.99), rgba(18, 8, 38, 0.99))',
  backgroundColor: '#160B2D',
  color: '#F8F3FF',
}

const textFieldSx = {
  '& .MuiInputBase-root': {
    backgroundColor: 'rgba(10, 4, 24, 0.55)',
    color: '#F8F3FF',
  },
  '& .MuiInputLabel-root': { color: 'rgba(248, 243, 255, 0.72)' },
  '& .MuiOutlinedInput-notchedOutline': {
    borderColor: 'rgba(200, 169, 255, 0.35)',
  },
  '& .MuiFormHelperText-root': { color: 'rgba(248, 243, 255, 0.68)' },
}

const infoAlertSx = {
  '& .MuiAlert-icon': { color: '#C8A9FF' },
  backgroundColor: 'rgba(102, 62, 155, 0.28)',
  borderColor: 'rgba(200, 169, 255, 0.3)',
  color: '#F8F3FF',
}

async function copyLink(url: string) {
  try {
    await navigator.clipboard.writeText(url)
    toast.success('Ссылка скопирована.')
  } catch {
    toast.error('Не удалось скопировать ссылку. Скопируйте её из поля вручную.')
  }
}

async function shareLink(url: string) {
  if (!navigator.share) {
    await copyLink(url)
    return
  }

  try {
    await navigator.share({
      text: 'Присоединяйтесь к моей музыкальной комнате в Syncly.',
      title: 'Приглашение в Syncly',
      url,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    toast.error('Не удалось открыть системное меню «Поделиться».')
  }
}

function LinkActions({ onShowQr, url }: { onShowQr: () => void; url: string }) {
  return (
    <Stack direction={{ sm: 'row', xs: 'column' }} gap={1}>
      <Button onClick={() => void copyLink(url)} variant="contained">
        Скопировать ссылку
      </Button>
      {typeof navigator.share === 'function' && (
        <Button onClick={() => void shareLink(url)} variant="outlined">
          Поделиться
        </Button>
      )}
      <Button onClick={onShowQr} variant="outlined">
        Показать QR-код
      </Button>
    </Stack>
  )
}

function QrPanel({ onClose, url }: { onClose: () => void; url: string }) {
  return (
    <Paper
      elevation={0}
      sx={{
        alignItems: 'center',
        backgroundColor: 'rgba(31, 14, 55, 0.9)',
        border: '1px solid rgba(200, 169, 255, 0.35)',
        borderRadius: 3,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        padding: { sm: 3, xs: 2 },
      }}
    >
      <Typography color="#F8F3FF" fontWeight={700} variant="h6">
        QR-код приглашения
      </Typography>
      <Box
        sx={{
          backgroundColor: '#1B0C32',
          border: '8px solid #2F1950',
          borderRadius: 2,
          lineHeight: 0,
          maxWidth: 248,
          padding: 1,
          width: '100%',
        }}
      >
        <QRCodeSVG
          bgColor="#1B0C32"
          fgColor="#FFFFFF"
          level="M"
          size={220}
          style={{ height: 'auto', maxWidth: '100%', width: '100%' }}
          value={url}
        />
      </Box>
      <Typography
        color="rgba(248, 243, 255, 0.72)"
        textAlign="center"
        variant="body2"
      >
        Наведите камеру телефона. Изображение создаётся на этом устройстве и
        нигде отдельно не хранится.
      </Typography>
      <Button onClick={onClose} variant="text">
        Скрыть QR-код
      </Button>
    </Paper>
  )
}

export function RoomInviteDialog({
  onClose,
  open,
  roomId,
  visibility,
}: RoomInviteDialogProps) {
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const [invites, setInvites] = useState<RoomInviteListItem[]>([])
  const [invitesLoading, setInvitesLoading] = useState(false)
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
  } = useForm<InviteFormValues>({
    defaultValues: { maxUses: 5, validForHours: 24 },
  })
  const directRoomUrl = new URL(
    routes.room(roomId),
    window.location.origin,
  ).toString()
  const isPrivate = visibility === 'private'
  const activeInvites = useMemo(
    () => invites.filter(isRoomInviteAvailable),
    [invites],
  )

  useEffect(() => {
    if (!open) {
      setQrUrl(null)
      return
    }
    if (!isPrivate) return

    setInvitesLoading(true)
    return subscribeRoomInvites(
      roomId,
      nextInvites => {
        setInvites(nextInvites)
        setInvitesLoading(false)
      },
      reason => {
        setInvitesLoading(false)
        toast.error(
          reason instanceof Error
            ? reason.message
            : 'Не удалось загрузить активные приглашения.',
        )
      },
    )
  }, [isPrivate, open, roomId])

  const handleCreate = async (values: InviteFormValues) => {
    const expiresAt = new Date(
      Date.now() + values.validForHours * 60 * 60 * 1000,
    )

    try {
      const token = await createRoomInvite({
        expiresAt,
        maxUses: values.maxUses,
        roomId,
      })
      const url = getRoomInviteUrl(token)
      reset(values)
      await copyLink(url)
      setQrUrl(url)
    } catch (reason) {
      toast.error(
        reason instanceof Error
          ? reason.message
          : 'Не удалось создать приглашение.',
      )
    }
  }

  const handleRevoke = async (invite: RoomInviteListItem) => {
    setRevokingId(invite.tokenHash)
    try {
      await revokeRoomInvite(invite.tokenHash)
      if (qrUrl === getRoomInviteUrl(invite.inviteId)) setQrUrl(null)
      toast.success('Приглашение отозвано.')
    } catch (reason) {
      toast.error(
        reason instanceof Error
          ? reason.message
          : 'Не удалось отозвать приглашение.',
      )
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <Dialog
      fullScreen={fullScreen}
      fullWidth
      maxWidth="md"
      onClose={onClose}
      open={open}
      slotProps={{ paper: { sx: dialogPaperSx } }}
    >
      <DialogTitle sx={{ fontWeight: 800 }}>Пригласить в комнату</DialogTitle>
      <DialogContent sx={{ paddingTop: '12px !important' }}>
        <Stack gap={2.5}>
          {!isPrivate ? (
            <>
              <Alert severity="info" sx={infoAlertSx} variant="outlined">
                {visibility === 'unlisted'
                  ? 'Скрытая комната не показывается в каталоге, но эта постоянная ссылка всегда ведёт прямо в неё.'
                  : 'Для публичной комнаты действует постоянная ссылка без срока и ограничения по числу входов.'}
              </Alert>
              <TextField
                fullWidth
                label="Постоянная ссылка"
                slotProps={{ input: { readOnly: true } }}
                sx={textFieldSx}
                value={directRoomUrl}
              />
              <Stack direction={{ sm: 'row', xs: 'column' }} gap={1}>
                <Chip
                  label="Без срока действия"
                  sx={{ backgroundColor: '#4B2A72', color: '#F8F3FF' }}
                />
                <Chip
                  label="Без лимита использований"
                  sx={{ backgroundColor: '#4B2A72', color: '#F8F3FF' }}
                />
              </Stack>
              <LinkActions
                onShowQr={() => setQrUrl(directRoomUrl)}
                url={directRoomUrl}
              />
            </>
          ) : (
            <>
              <Alert severity="info" sx={infoAlertSx} variant="outlined">
                Для приватной комнаты создаётся защищённый токен. Он даёт только
                роль участника и перестаёт работать после истечения срока,
                достижения лимита или отзыва.
              </Alert>
              <Stack
                component="form"
                gap={2}
                onSubmit={handleSubmit(handleCreate)}
              >
                <Stack direction={{ md: 'row', xs: 'column' }} gap={2}>
                  <TextField
                    disabled={isSubmitting}
                    error={Boolean(errors.validForHours)}
                    fullWidth
                    helperText={errors.validForHours?.message}
                    inputProps={{ max: 720, min: 1, step: 1 }}
                    label="Срок действия, часов"
                    sx={textFieldSx}
                    type="number"
                    {...register('validForHours', {
                      max: { message: 'Не больше 720 часов.', value: 720 },
                      min: { message: 'Не меньше 1 часа.', value: 1 },
                      required: 'Укажите срок действия.',
                      setValueAs: value => Number(value),
                      validate: value =>
                        Number.isInteger(value) ||
                        'Введите целое количество часов.',
                    })}
                  />
                  <TextField
                    disabled={isSubmitting}
                    error={Boolean(errors.maxUses)}
                    fullWidth
                    helperText={errors.maxUses?.message}
                    inputProps={{ max: 100, min: 1, step: 1 }}
                    label="Максимум использований"
                    sx={textFieldSx}
                    type="number"
                    {...register('maxUses', {
                      max: { message: 'Не больше 100 входов.', value: 100 },
                      min: { message: 'Не меньше 1 входа.', value: 1 },
                      required: 'Укажите число использований.',
                      setValueAs: value => Number(value),
                      validate: value =>
                        Number.isInteger(value) || 'Введите целое число.',
                    })}
                  />
                </Stack>
                <Button
                  disabled={isSubmitting}
                  type="submit"
                  variant="contained"
                >
                  {isSubmitting
                    ? 'Создаём приглашение…'
                    : 'Создать приглашение'}
                </Button>
              </Stack>

              <Divider sx={{ borderColor: 'rgba(200, 169, 255, 0.24)' }} />
              <Stack gap={1.5}>
                <Typography color="#F8F3FF" fontWeight={800} variant="h6">
                  Активные приглашения
                </Typography>
                {invitesLoading && (
                  <LinearProgress
                    sx={{
                      '& .MuiLinearProgress-bar': {
                        backgroundColor: '#B88CFF',
                      },
                      backgroundColor: 'rgba(184, 140, 255, 0.18)',
                    }}
                  />
                )}
                {!invitesLoading && activeInvites.length === 0 && (
                  <Typography color="rgba(248, 243, 255, 0.68)">
                    Активных приглашений пока нет.
                  </Typography>
                )}
                {activeInvites.map(invite => {
                  const url = getRoomInviteUrl(invite.inviteId)
                  return (
                    <Paper
                      elevation={0}
                      key={invite.tokenHash}
                      sx={{
                        backgroundColor: 'rgba(63, 34, 97, 0.56)',
                        border: '1px solid rgba(200, 169, 255, 0.24)',
                        borderRadius: 3,
                        color: '#F8F3FF',
                        padding: { sm: 2.5, xs: 2 },
                      }}
                    >
                      <Stack gap={1.5}>
                        <Stack
                          alignItems={{ sm: 'center', xs: 'flex-start' }}
                          direction={{ sm: 'row', xs: 'column' }}
                          justifyContent="space-between"
                          gap={1}
                        >
                          <Typography fontWeight={700}>
                            До{' '}
                            {invite.expiresAt.toDate().toLocaleString('ru-RU')}
                          </Typography>
                          <Chip
                            label={`${invite.uses} из ${invite.maxUses} использовано`}
                            size="small"
                            sx={{
                              backgroundColor: '#4B2A72',
                              color: '#F8F3FF',
                            }}
                          />
                        </Stack>
                        <TextField
                          fullWidth
                          label="Ссылка приглашения"
                          slotProps={{ input: { readOnly: true } }}
                          sx={textFieldSx}
                          value={url}
                        />
                        <LinkActions onShowQr={() => setQrUrl(url)} url={url} />
                        <Button
                          color="error"
                          disabled={revokingId === invite.tokenHash}
                          onClick={() => void handleRevoke(invite)}
                          variant="outlined"
                        >
                          {revokingId === invite.tokenHash
                            ? 'Отзываем…'
                            : 'Отозвать приглашение'}
                        </Button>
                      </Stack>
                    </Paper>
                  )
                })}
              </Stack>
            </>
          )}

          {qrUrl && <QrPanel onClose={() => setQrUrl(null)} url={qrUrl} />}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ padding: 3, paddingTop: 2 }}>
        <Button onClick={onClose}>Закрыть</Button>
      </DialogActions>
    </Dialog>
  )
}
