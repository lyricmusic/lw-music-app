import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-toastify'

import {
  characterAccentOptions,
  characterAppearanceOptions,
  characterDanceOptions,
  characterGenderOptions,
  getCharacterAccent,
  getCharacterSpriteUrl,
  resolveUserCharacter,
  type CharacterAccentId,
  type CharacterAppearanceId,
  type CharacterDanceId,
  type CharacterGenderId,
  type UserCharacter,
  useSession,
} from '@/entities/session'
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'

import { updateUserCharacter } from '../api/updateUserCharacter'

interface CharacterEditorDialogProps {
  onClose: () => void
  open: boolean
}

interface OptionCardProps<T extends string> {
  available: boolean
  label: string
  onSelect: (value: T) => void
  selected: boolean
  value: T
}

function OptionCard<T extends string>({
  available,
  label,
  onSelect,
  selected,
  value,
}: OptionCardProps<T>) {
  return (
    <Box
      aria-pressed={selected}
      component="button"
      disabled={!available}
      onClick={() => onSelect(value)}
      sx={{
        '&:disabled': { cursor: 'not-allowed', opacity: 0.56 },
        '&:focus-visible': {
          outline: '3px solid rgba(184, 140, 255, 0.34)',
          outlineOffset: 2,
        },
        backgroundColor: selected ? '#4A2B6D' : '#32204B',
        border: selected ? '2px solid #B88CFF' : '2px solid #4A2B6D',
        borderRadius: '14px',
        boxSizing: 'border-box',
        color: '#F8F3FF',
        cursor: available ? 'pointer' : 'not-allowed',
        font: 'inherit',
        minHeight: 58,
        minWidth: 0,
        overflow: 'hidden',
        padding: '8px 10px',
        textAlign: 'left',
        width: '100%',
      }}
      type="button"
    >
      <Typography
        component="span"
        sx={{ display: 'block', fontWeight: 700, overflowWrap: 'anywhere' }}
      >
        {label}
      </Typography>
      {!available && (
        <Typography
          component="span"
          sx={{ color: '#CDBCE2', display: 'block', fontSize: 12 }}
        >
          Скоро
        </Typography>
      )}
    </Box>
  )
}

export function CharacterEditorDialog({
  onClose,
  open,
}: CharacterEditorDialogProps) {
  const { profile } = useSession()
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const savedCharacter = useMemo(
    () => resolveUserCharacter(profile?.character),
    [profile?.character],
  )
  const [draft, setDraft] = useState<UserCharacter>(savedCharacter)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<null | string>(null)

  useEffect(() => {
    if (!open) return
    setDraft(savedCharacter)
    setError(null)
  }, [open, savedCharacter])

  const accent = getCharacterAccent(draft.accentColor)
  const appearanceLabel =
    characterAppearanceOptions.find(option => option.id === draft.appearanceId)
      ?.label ?? 'Базовая'
  const genderLabel =
    characterGenderOptions.find(option => option.id === draft.genderId)
      ?.label ?? 'Мужской'
  const danceLabel =
    characterDanceOptions.find(option => option.id === draft.danceId)?.label ??
    'Шаги'
  const hasChanges =
    draft.appearanceId !== savedCharacter.appearanceId ||
    draft.accentColor !== savedCharacter.accentColor ||
    draft.danceId !== savedCharacter.danceId ||
    draft.genderId !== savedCharacter.genderId

  const updateDraft = <K extends keyof UserCharacter>(
    key: K,
    value: UserCharacter[K],
  ) => {
    setError(null)
    setDraft(current => ({ ...current, [key]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await updateUserCharacter(draft)
      toast.success('Персонаж сохранён.')
      onClose()
    } catch (reason) {
      const message =
        reason instanceof Error
          ? reason.message
          : 'Не удалось сохранить персонажа.'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      aria-labelledby="character-editor-title"
      fullScreen={fullScreen}
      maxWidth="md"
      onClose={saving ? undefined : onClose}
      open={open}
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: fullScreen ? '14px' : '20px',
            boxSizing: 'border-box',
            margin: fullScreen ? '8px !important' : '16px !important',
            maxHeight: fullScreen
              ? 'calc(100dvh - 16px)'
              : 'calc(100dvh - 32px)',
            maxWidth: fullScreen
              ? 'calc(100vw - 16px) !important'
              : '820px !important',
            overflowX: 'hidden',
            width: fullScreen
              ? 'calc(100vw - 16px) !important'
              : 'calc(100% - 32px) !important',
          },
        },
      }}
    >
      <DialogTitle
        id="character-editor-title"
        sx={{
          boxSizing: 'border-box',
          padding: { xs: '22px 18px 12px', sm: '28px 30px 14px' },
        }}
      >
        Мой персонаж
      </DialogTitle>

      <DialogContent
        sx={{
          boxSizing: 'border-box',
          overflowX: 'hidden',
          padding: { xs: '8px 18px 24px', sm: '10px 30px 28px' },
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gap: { xs: 2.5, md: 3 },
            gridTemplateColumns: {
              xs: '1fr',
              md: 'minmax(240px, 0.8fr) minmax(0, 1.2fr)',
            },
            minWidth: 0,
          }}
        >
          <Box
            sx={{
              alignItems: 'center',
              background: `radial-gradient(circle at 50% 44%, ${accent.glow}, transparent 57%), #1B0C32`,
              border: `1px solid ${accent.color}`,
              borderRadius: '20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              minHeight: { xs: 230, sm: 280 },
              minWidth: 0,
              overflow: 'hidden',
              padding: 2,
            }}
          >
            <Box
              aria-label={`Предпросмотр: ${genderLabel}, внешность «${appearanceLabel}», танец «${danceLabel}»`}
              className="character-editor-sprite"
              key={`${draft.genderId}-${draft.appearanceId}-${draft.danceId}`}
              role="img"
              sx={{
                backgroundImage: `url(${getCharacterSpriteUrl(draft, true)})`,
                filter: `${accent.filter} drop-shadow(0 0 10px ${accent.color})`,
              }}
            />
            <Typography
              sx={{ color: '#F8F3FF', fontWeight: 700, marginTop: 1 }}
            >
              {genderLabel} · {appearanceLabel}
            </Typography>
            <Typography sx={{ color: accent.color, fontSize: 13 }}>
              Танец: {danceLabel}
            </Typography>
          </Box>

          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 2.5,
              minWidth: 0,
            }}
          >
            <Box component="fieldset" sx={{ border: 0, margin: 0, padding: 0 }}>
              <Typography
                component="legend"
                sx={{ color: '#F8F3FF', fontWeight: 700, marginBottom: 1 }}
              >
                Пол
              </Typography>
              <Box
                sx={{
                  display: 'grid',
                  gap: 1,
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                }}
              >
                {characterGenderOptions.map(option => (
                  <OptionCard<CharacterGenderId>
                    available
                    key={option.id}
                    label={option.label}
                    onSelect={value => updateDraft('genderId', value)}
                    selected={draft.genderId === option.id}
                    value={option.id}
                  />
                ))}
              </Box>
            </Box>

            <Box component="fieldset" sx={{ border: 0, margin: 0, padding: 0 }}>
              <Typography
                component="legend"
                sx={{ color: '#F8F3FF', fontWeight: 700, marginBottom: 1 }}
              >
                Внешность
              </Typography>
              <Box
                sx={{
                  display: 'grid',
                  gap: 1,
                  gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
                }}
              >
                {characterAppearanceOptions.map(option => (
                  <OptionCard<CharacterAppearanceId>
                    available={option.available}
                    key={option.id}
                    label={option.label}
                    onSelect={value => updateDraft('appearanceId', value)}
                    selected={draft.appearanceId === option.id}
                    value={option.id}
                  />
                ))}
              </Box>
            </Box>

            <Box component="fieldset" sx={{ border: 0, margin: 0, padding: 0 }}>
              <Typography
                component="legend"
                sx={{ color: '#F8F3FF', fontWeight: 700, marginBottom: 1 }}
              >
                Цвет акцента
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {characterAccentOptions.map(option => {
                  const selected = draft.accentColor === option.id
                  return (
                    <Box
                      aria-label={option.label}
                      aria-pressed={selected}
                      component="button"
                      disabled={saving}
                      key={option.id}
                      onClick={() =>
                        updateDraft(
                          'accentColor',
                          option.id as CharacterAccentId,
                        )
                      }
                      sx={{
                        '&:focus-visible': {
                          outline: `3px solid ${option.glow}`,
                          outlineOffset: 3,
                        },
                        backgroundColor: option.color,
                        border: selected
                          ? '3px solid #FFFFFF'
                          : '3px solid #32204B',
                        borderRadius: '50%',
                        boxShadow: selected
                          ? `0 0 16px ${option.glow}`
                          : 'none',
                        cursor: 'pointer',
                        height: 42,
                        padding: 0,
                        width: 42,
                      }}
                      title={option.label}
                      type="button"
                    />
                  )
                })}
              </Box>
            </Box>

            <Box component="fieldset" sx={{ border: 0, margin: 0, padding: 0 }}>
              <Typography
                component="legend"
                sx={{ color: '#F8F3FF', fontWeight: 700, marginBottom: 1 }}
              >
                Танец
              </Typography>
              <Box
                sx={{
                  display: 'grid',
                  gap: 1,
                  gridTemplateColumns: { xs: '1fr', sm: 'repeat(4, 1fr)' },
                }}
              >
                {characterDanceOptions.map(option => (
                  <OptionCard<CharacterDanceId>
                    available={option.available}
                    key={option.id}
                    label={option.label}
                    onSelect={value => updateDraft('danceId', value)}
                    selected={draft.danceId === option.id}
                    value={option.id}
                  />
                ))}
              </Box>
            </Box>
          </Box>
        </Box>

        {error && (
          <Typography
            role="alert"
            sx={{ color: '#FF9BAD', fontSize: 14, marginTop: 2 }}
          >
            {error}
          </Typography>
        )}
      </DialogContent>

      <DialogActions
        sx={{
          '& .MuiButton-root': { minWidth: 0, width: '100%' },
          boxSizing: 'border-box',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          padding: { xs: '0 18px 20px', sm: '0 30px 28px' },
        }}
      >
        <Button disabled={saving} onClick={onClose} variant="outlined">
          Отмена
        </Button>
        <Button
          disabled={saving || !hasChanges}
          onClick={() => void handleSave()}
          variant="contained"
        >
          {saving ? (
            <CircularProgress color="inherit" size={20} />
          ) : (
            'Сохранить'
          )}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
