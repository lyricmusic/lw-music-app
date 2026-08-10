import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import {
  Link as RouterLink,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router'

import logo from '@assets/lw.svg'

import {
  getRoomInvitePreview,
  isRoomInviteAvailable,
  redeemRoomInvite,
  type RoomInvitePreview,
} from '@/entities/room'
import { useSession } from '@/entities/session'
import { signInAsGuest } from '@/features/auth'
import {
  completeProfile,
  presetAvatars,
  type PresetAvatarId,
} from '@/features/profile-onboarding'
import { auth } from '@/shared/api/firebase'
import { routes } from '@/shared/config/routes'
import {
  reportOperationalError,
  trackProductEvent,
} from '@/shared/lib/telemetry'
import {
  Box,
  Button,
  CircularProgress,
  Paper,
  TextField,
  Typography,
} from '@mui/material'

interface GuestProfileValues {
  displayName: string
  presetAvatarId: PresetAvatarId
}

type JoinStep = 'joining' | 'preview' | 'profile'

function getUnavailableMessage(invite: RoomInvitePreview) {
  if (invite.revokedAt) return 'Владелец отозвал это приглашение.'
  if (invite.expiresAt.toMillis() <= Date.now()) {
    return 'Срок действия приглашения истёк.'
  }
  if (invite.uses >= invite.maxUses) {
    return 'Лимит использований приглашения исчерпан.'
  }
  return null
}

export function JoinPage() {
  const { inviteToken = '' } = useParams<{ inviteToken: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { loading: sessionLoading, profile, user } = useSession()
  const [invite, setInvite] = useState<RoomInvitePreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState<JoinStep>('preview')
  const [error, setError] = useState<null | string>(null)
  const {
    control,
    formState: { errors, isSubmitting, isValid },
    handleSubmit,
    register,
  } = useForm<GuestProfileValues>({
    defaultValues: { displayName: '', presetAvatarId: 'pulse' },
    mode: 'onChange',
  })

  useEffect(() => {
    let disposed = false
    setLoading(true)
    setError(null)
    setInvite(null)
    setStep('preview')

    void getRoomInvitePreview(inviteToken)
      .then(nextInvite => {
        if (!disposed) setInvite(nextInvite)
      })
      .catch(reason => {
        if (!disposed) {
          setError(
            reason instanceof Error
              ? reason.message
              : 'Не удалось открыть приглашение.',
          )
        }
      })
      .finally(() => {
        if (!disposed) setLoading(false)
      })

    return () => {
      disposed = true
    }
  }, [inviteToken])

  const enterRoom = async () => {
    if (!invite) return
    const { joinedNow, roomId } = await redeemRoomInvite(
      invite.inviteId,
      invite.roomId,
    )
    if (joinedNow) {
      trackProductEvent({
        name: 'room_joined',
        properties: {
          source: 'invite',
          user_kind: auth.currentUser?.isAnonymous ? 'guest' : 'registered',
        },
      })
    }
    navigate(routes.room(roomId), {
      replace: true,
      state: { roomEntrySource: 'invite' },
    })
  }

  const handleJoin = async () => {
    if (!invite || !isRoomInviteAvailable(invite)) return

    setError(null)
    setStep('joining')
    try {
      const currentUser = auth.currentUser ?? (await signInAsGuest('invite'))

      if (
        currentUser.isAnonymous &&
        !(user?.uid === currentUser.uid && profile?.onboardingCompleted)
      ) {
        setStep('profile')
        return
      }

      await enterRoom()
    } catch (reason) {
      reportOperationalError('room_membership', reason)
      setError(
        reason instanceof Error
          ? reason.message
          : 'Не удалось присоединиться к комнате.',
      )
      setStep('preview')
    }
  }

  const handleGuestProfile = async (values: GuestProfileValues) => {
    setError(null)
    try {
      await completeProfile({
        avatarFile: null,
        displayName: values.displayName,
        presetAvatarId: values.presetAvatarId,
      })
      setStep('joining')
      await enterRoom()
    } catch (reason) {
      reportOperationalError('room_membership', reason)
      setError(
        reason instanceof Error
          ? reason.message
          : 'Не удалось сохранить профиль и войти в комнату.',
      )
      setStep('profile')
    }
  }

  const unavailableMessage = invite ? getUnavailableMessage(invite) : null
  const busy = loading || sessionLoading || step === 'joining'

  return (
    <Box
      component="main"
      sx={{
        alignItems: 'center',
        background:
          'radial-gradient(circle at 18% 15%, #5D5FD4 0, #3F3F59 34%, #25263E 100%)',
        display: 'flex',
        justifyContent: 'center',
        minHeight: '100dvh',
        padding: { xs: 0, sm: 2 },
      }}
    >
      <Paper
        elevation={0}
        sx={{
          backgroundColor: '#1B0C32',
          border: { xs: 'none', sm: '1px solid #513574' },
          borderRadius: { xs: 0, sm: '24px' },
          color: '#FFFFFF',
          maxWidth: 560,
          minHeight: { xs: '100dvh', sm: 0 },
          overflow: 'hidden',
          width: '100%',
        }}
      >
        <Box
          sx={{
            backgroundColor: '#2A1745',
            borderBottom: '1px solid #513574',
            padding: { xs: '18px 20px', sm: '22px 28px' },
          }}
        >
          <Box
            alt="Syncly"
            component="img"
            src={logo}
            sx={{
              display: 'block',
              filter: 'brightness(0) invert(1)',
              width: { xs: 126, sm: 150 },
            }}
          />
        </Box>

        {busy && (
          <Box
            alignItems="center"
            display="flex"
            flexDirection="column"
            gap={2}
            justifyContent="center"
            minHeight={{ xs: 320, sm: 420 }}
            padding={{ xs: 3, sm: 4 }}
          >
            <CircularProgress sx={{ color: '#6F70E7' }} />
            <Typography color="text.secondary">
              {step === 'joining'
                ? 'Присоединяемся к комнате…'
                : 'Открываем приглашение…'}
            </Typography>
          </Box>
        )}

        {!busy && invite && step === 'preview' && (
          <>
            <Box
              alt={`Обложка комнаты «${invite.roomName}»`}
              component="img"
              src={invite.roomImageUrl}
              sx={{ aspectRatio: '16 / 8', objectFit: 'cover', width: '100%' }}
            />
            <Box padding={{ xs: 2.5, sm: 4 }}>
              <Typography
                component="p"
                sx={{ color: '#6F70E7', fontWeight: 700, marginBottom: 1 }}
              >
                Вас приглашают в комнату
              </Typography>
              <Typography
                component="h1"
                sx={{ fontSize: { xs: 30, sm: 36 }, overflowWrap: 'anywhere' }}
                variant="h1"
              >
                {invite.roomName}
              </Typography>
              <Typography color="text.secondary" marginTop={1.5}>
                Участников: {invite.participantCount}
              </Typography>

              {(unavailableMessage || error) && (
                <Typography color="error" marginTop={2} role="alert">
                  {unavailableMessage ?? error}
                </Typography>
              )}

              <Button
                disabled={Boolean(unavailableMessage)}
                fullWidth
                onClick={() => void handleJoin()}
                sx={{ height: 56, marginTop: 3 }}
                variant="contained"
              >
                Присоединиться
              </Button>

              {!user && (
                <Typography
                  color="text.secondary"
                  marginTop={2}
                  textAlign="center"
                >
                  Уже есть аккаунт?{' '}
                  <RouterLink state={{ from: location }} to={routes.signIn}>
                    Войти
                  </RouterLink>
                </Typography>
              )}
            </Box>
          </>
        )}

        {!busy && invite && step === 'profile' && (
          <Box
            component="form"
            noValidate
            onSubmit={handleSubmit(handleGuestProfile)}
            padding={{ xs: 2.5, sm: 4 }}
          >
            <Typography
              component="h1"
              sx={{ fontSize: { xs: 28, sm: 34 } }}
              variant="h1"
            >
              Как вас называть?
            </Typography>
            <Typography color="text.secondary" marginTop={1}>
              Пароль и email не нужны — их можно добавить позже без потери
              комнат и истории.
            </Typography>

            <TextField
              autoComplete="nickname"
              autoFocus
              error={Boolean(errors.displayName)}
              fullWidth
              helperText={errors.displayName?.message}
              inputProps={{ maxLength: 50 }}
              label="Никнейм"
              margin="normal"
              {...register('displayName', {
                maxLength: {
                  message: 'Не больше 50 символов.',
                  value: 50,
                },
                required: 'Введите никнейм.',
                validate: value => Boolean(value.trim()) || 'Введите никнейм.',
              })}
            />

            <Typography color="text.secondary" marginBottom={1} marginTop={2}>
              Базовый аватар
            </Typography>
            <Controller
              control={control}
              name="presetAvatarId"
              render={({ field }) => (
                <Box
                  display="flex"
                  flexWrap="wrap"
                  gap={1}
                  justifyContent={{ xs: 'center', sm: 'flex-start' }}
                >
                  {presetAvatars.map(avatar => {
                    const selected = avatar.id === field.value
                    return (
                      <Box
                        aria-label={`Выбрать аватар «${avatar.name}»`}
                        aria-pressed={selected}
                        component="button"
                        key={avatar.id}
                        onClick={() => field.onChange(avatar.id)}
                        sx={{
                          background: 'transparent',
                          border: selected
                            ? '3px solid #6F70E7'
                            : '3px solid transparent',
                          borderRadius: '18px',
                          height: 70,
                          padding: 0,
                          width: 70,
                        }}
                        type="button"
                      >
                        <Box
                          alt=""
                          component="img"
                          src={avatar.url}
                          sx={{ borderRadius: '14px', height: 64, width: 64 }}
                        />
                      </Box>
                    )
                  })}
                </Box>
              )}
            />

            {error && (
              <Typography color="error" marginTop={2} role="alert">
                {error}
              </Typography>
            )}

            <Button
              disabled={!isValid || isSubmitting}
              fullWidth
              sx={{ height: 56, marginTop: 3 }}
              type="submit"
              variant="contained"
            >
              {isSubmitting ? (
                <CircularProgress color="inherit" size={22} />
              ) : (
                'Выбрать никнейм'
              )}
            </Button>
          </Box>
        )}

        {!busy && !invite && (
          <Box padding={{ xs: 3, sm: 4 }} textAlign="center">
            <Typography
              component="h1"
              sx={{ fontSize: { xs: 28, sm: 32 } }}
              variant="h1"
            >
              Приглашение недоступно
            </Typography>
            <Typography color="error" marginTop={2} role="alert">
              {error ?? 'Проверьте ссылку и попробуйте ещё раз.'}
            </Typography>
            <Button
              component={RouterLink}
              sx={{ marginTop: 3 }}
              to={user && !user.isAnonymous ? routes.rooms : routes.signIn}
              variant="outlined"
            >
              На главную
            </Button>
          </Box>
        )}
      </Paper>
    </Box>
  )
}
