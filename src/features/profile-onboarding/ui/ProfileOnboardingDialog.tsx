import { ChangeEvent, useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'react-toastify'

import { useSession } from '@/entities/session'
import { MemberIcon } from '@/shared/ui/icons'
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  Input,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'

import { completeProfile } from '../api/completeProfile'
import { presetAvatars, type PresetAvatarId } from '../model/presetAvatars'

const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']

interface ProfileOnboardingFormValues {
  avatarFile: File | null
  displayName: string
  presetAvatarId: null | PresetAvatarId
}

export function ProfileOnboardingDialog({
  preview = false,
}: {
  preview?: boolean
}) {
  const { loading: sessionLoading, profile, user } = useSession()
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const {
    control,
    formState: { errors, isSubmitting, isValid },
    handleSubmit,
    register,
    setValue,
    watch,
  } = useForm<ProfileOnboardingFormValues>({
    defaultValues: {
      avatarFile: null,
      displayName: '',
      presetAvatarId: null,
    },
    mode: 'onChange',
  })
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<null | string>(null)
  const [formError, setFormError] = useState<null | string>(null)
  const avatarFile = watch('avatarFile')
  const selectedPresetId = watch('presetAvatarId')

  const open =
    preview ||
    Boolean(
      user &&
      !sessionLoading &&
      (!profile || profile.onboardingCompleted === false),
    )
  const selectedPreset = useMemo(
    () => presetAvatars.find(avatar => avatar.id === selectedPresetId) ?? null,
    [selectedPresetId],
  )
  const selectedAvatarUrl = avatarPreviewUrl ?? selectedPreset?.url ?? null
  const displayNameRegistration = register('displayName', {
    maxLength: {
      message: 'Никнейм не может быть длиннее 50 символов.',
      value: 50,
    },
    required: 'Введите никнейм.',
    validate: value => Boolean(value.trim()) || 'Введите никнейм.',
  })

  useEffect(() => {
    if (user?.isAnonymous && !avatarFile && !selectedPresetId) {
      setValue('presetAvatarId', 'pulse', { shouldValidate: true })
    }
  }, [avatarFile, selectedPresetId, setValue, user?.isAnonymous])

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreviewUrl(null)
      return
    }

    const objectUrl = URL.createObjectURL(avatarFile)
    setAvatarPreviewUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [avatarFile])

  const handleAvatarFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      setFormError('Можно загрузить изображение JPEG, PNG или WebP.')
      return
    }
    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      setFormError('Размер аватара не должен превышать 5 МБ.')
      return
    }

    setFormError(null)
    setValue('avatarFile', file)
    setValue('presetAvatarId', null, { shouldValidate: true })
  }

  const handleSaveProfile = async (values: ProfileOnboardingFormValues) => {
    if (preview) return
    setFormError(null)
    try {
      await completeProfile({
        avatarFile: values.avatarFile,
        displayName: values.displayName,
        presetAvatarId: values.presetAvatarId,
      })
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Не удалось сохранить профиль. Попробуйте ещё раз.'
      setFormError(message)
      toast.error(message)
    }
  }

  return (
    <Dialog
      aria-describedby="profile-onboarding-description"
      aria-labelledby="profile-onboarding-title"
      disableEscapeKeyDown
      fullScreen={fullScreen}
      maxWidth={false}
      open={open}
      slotProps={{
        backdrop: {
          sx: { backgroundColor: 'rgba(25, 26, 46, 0.82)' },
        },
        paper: {
          sx: {
            backgroundColor: '#24143D',
            backgroundImage: 'none',
            border: '1px solid #4A2B6D',
            borderRadius: fullScreen ? 0 : '20px',
            boxShadow: '0 24px 80px rgba(20, 21, 43, 0.34)',
            color: '#F8F3FF',
            boxSizing: 'border-box',
            margin: fullScreen ? '0 !important' : '16px !important',
            maxHeight: fullScreen ? '100dvh' : 'calc(100dvh - 32px)',
            maxWidth: fullScreen
              ? '100vw !important'
              : 'calc(100% - 32px) !important',
            outline: 'none',
            overflowX: 'hidden',
            overflowY: 'auto',
            width: {
              xs: '100vw !important',
              sm: '560px !important',
            },
          },
        },
      }}
    >
      <Box
        component="form"
        noValidate
        onSubmit={handleSubmit(handleSaveProfile)}
        sx={{
          boxSizing: 'border-box',
          maxWidth: '100%',
          padding: { xs: '24px 18px', sm: '38px 40px 40px' },
          width: '100%',
        }}
      >
        <Typography
          component="h2"
          id="profile-onboarding-title"
          sx={{
            color: '#F8F3FF',
            fontSize: { xs: '28px', sm: '34px' },
            fontWeight: 700,
            lineHeight: 1.1,
            marginBottom: '18px',
          }}
        >
          {user?.isAnonymous ? 'Вход в комнату' : 'Вы зарегистрированы'}
        </Typography>

        <Box
          id="profile-onboarding-description"
          sx={{ borderBottom: '1px solid #4A2B6D', paddingBottom: '26px' }}
        >
          <Typography
            component="label"
            htmlFor="profile-nickname"
            sx={{ color: '#CDBCE2', display: 'block', fontSize: 14 }}
          >
            Придумайте никнейм
          </Typography>
          <Input
            autoComplete="nickname"
            disabled={isSubmitting}
            fullWidth
            id="profile-nickname"
            inputProps={{ maxLength: 50 }}
            {...displayNameRegistration}
            onChange={event => {
              void displayNameRegistration.onChange(event)
              if (formError) setFormError(null)
            }}
            placeholder="Никнейм"
            sx={{
              '&:after': { borderBottomColor: '#6F70E7' },
              '&:before, &:hover:not(.Mui-disabled):before': {
                borderBottomColor: '#6D4A8F',
              },
              backgroundColor: '#32204B',
              borderRadius: '14px',
              color: '#F8F3FF',
              fontSize: 16,
              height: 66,
              padding: '0 16px',
            }}
          />
          {errors.displayName && (
            <Typography
              role="alert"
              sx={{ color: '#FF9BAD', fontSize: 13, marginTop: '6px' }}
            >
              {errors.displayName.message}
            </Typography>
          )}
        </Box>

        <Box sx={{ borderBottom: '1px solid #4A2B6D', padding: '22px 0 26px' }}>
          <Typography
            sx={{ color: '#CDBCE2', fontSize: 14, marginBottom: '10px' }}
          >
            Установите аватар
          </Typography>

          <Box
            sx={{
              alignItems: { xs: 'flex-start', sm: 'flex-end' },
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              gap: '20px',
            }}
          >
            <Box
              aria-label="Предпросмотр аватара"
              sx={{
                alignItems: 'center',
                backgroundColor: '#32204B',
                border: '1px solid #6D4A8F',
                borderRadius: '16px',
                display: 'flex',
                flex: '0 0 auto',
                height: 100,
                justifyContent: 'center',
                overflow: 'hidden',
                width: 100,
              }}
            >
              {selectedAvatarUrl ? (
                <Box
                  alt="Выбранный аватар"
                  component="img"
                  src={selectedAvatarUrl}
                  sx={{ height: '100%', objectFit: 'cover', width: '100%' }}
                />
              ) : (
                <MemberIcon
                  sx={{ '& path': { fill: '#B88CFF' }, height: 33, width: 28 }}
                />
              )}
            </Box>

            <Box sx={{ minWidth: 0 }}>
              <Typography
                sx={{ color: '#CDBCE2', fontSize: 14, marginBottom: '8px' }}
              >
                Предлагаемые аватары
              </Typography>
              <Box
                sx={{
                  display: 'flex',
                  gap: '8px',
                  maxWidth: '100%',
                  overflowX: 'auto',
                  padding: '2px',
                }}
              >
                <Controller
                  control={control}
                  name="presetAvatarId"
                  render={({ field }) => (
                    <>
                      {presetAvatars.map(avatar => {
                        const selected = field.value === avatar.id
                        return (
                          <Box
                            aria-label={`Выбрать аватар «${avatar.name}»`}
                            aria-pressed={selected}
                            component="button"
                            disabled={isSubmitting}
                            key={avatar.id}
                            onClick={() => {
                              setFormError(null)
                              setValue('avatarFile', null)
                              field.onChange(avatar.id)
                            }}
                            sx={{
                              '&:focus-visible': {
                                outline: '3px solid rgba(111, 112, 231, 0.35)',
                                outlineOffset: 2,
                              },
                              background: '#32204B',
                              border: selected
                                ? '2px solid #6F70E7'
                                : '2px solid transparent',
                              borderRadius: '18px',
                              flex: '0 0 64px',
                              height: 64,
                              padding: 0,
                              width: 64,
                            }}
                            type="button"
                          >
                            <Box
                              alt=""
                              component="img"
                              src={avatar.url}
                              sx={{
                                borderRadius: '16px',
                                height: 60,
                                width: 60,
                              }}
                            />
                          </Box>
                        )
                      })}
                    </>
                  )}
                  rules={{
                    validate: (presetId, values) =>
                      Boolean(presetId || values.avatarFile) ||
                      'Выберите или загрузите аватар.',
                  }}
                />
              </Box>
            </Box>
          </Box>

          {!user?.isAnonymous && (
            <Button
              component="label"
              disabled={isSubmitting}
              fullWidth
              sx={{
                '&.MuiButton-colorPrimary.MuiButton-outlined': {
                  borderColor: '#B88CFF',
                  color: '#F8F3FF',
                },
                marginTop: '18px',
                textTransform: 'uppercase',
              }}
              variant="outlined"
            >
              Загрузить свой аватар
              <input
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={handleAvatarFile}
                type="file"
              />
            </Button>
          )}

          {(formError || errors.presetAvatarId) && (
            <Typography
              role="alert"
              sx={{ color: '#FF9BAD', fontSize: 13, marginTop: '10px' }}
            >
              {formError ?? errors.presetAvatarId?.message}
            </Typography>
          )}
        </Box>

        <Button
          disabled={!isValid || isSubmitting}
          fullWidth
          sx={{ marginTop: '26px', textTransform: 'uppercase' }}
          type="submit"
          variant="contained"
        >
          {isSubmitting ? (
            <CircularProgress color="inherit" size={22} />
          ) : user?.isAnonymous ? (
            'Войти в комнату'
          ) : (
            'Готово'
          )}
        </Button>
      </Box>
    </Dialog>
  )
}
