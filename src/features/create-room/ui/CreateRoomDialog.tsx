import { ChangeEvent, useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'react-toastify'

import {
  getRoomNameKey,
  ROOM_CATEGORIES,
  ROOM_NAME_MAX_LENGTH,
  type Category,
  type RoomVisibility,
} from '@/entities/room'
import { MembersIcon } from '@/shared/ui/icons'
import { trackProductEvent } from '@/shared/lib/telemetry'
import {
  Autocomplete,
  Box,
  Button,
  Fade,
  MenuItem,
  Modal,
  TextField,
} from '@mui/material'

import { createRoom, RoomNameAlreadyExistsError } from '../api/createRoom'

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const style = {
  backgroundColor: '#24143D',
  border: '1px solid #4A2B6D',
  borderRadius: '20px',
  boxShadow: 24,
  color: '#F8F3FF',
  left: '50%',
  maxHeight: 'calc(100dvh - 16px)',
  maxWidth: 'calc(100vw - 16px)',
  overflowY: 'auto',
  padding: { xs: '24px 18px', sm: '32px', md: '40px' },
  position: 'absolute' as const,
  top: '50%',
  transform: 'translate(-50%, -50%)',
  width: { xs: 'calc(100vw - 16px)', sm: 555 },
}

interface CreateRoomDialogProps {
  existingRoomNames: string[]
  onClose: () => void
  onCreated?: (roomId: string) => void
  open: boolean
}

interface CreateRoomFormValues {
  categories: Category[]
  image: File | null
  roomName: string
  visibility: RoomVisibility
}

export function CreateRoomDialog({
  existingRoomNames,
  onClose,
  onCreated,
  open,
}: CreateRoomDialogProps) {
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setError,
    setValue,
    watch,
  } = useForm<CreateRoomFormValues>({
    defaultValues: {
      categories: [],
      image: null,
      roomName: '',
      visibility: 'public',
    },
  })
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const image = watch('image')
  const existingRoomNameKeys = useMemo(
    () => new Set(existingRoomNames.map(getRoomNameKey)),
    [existingRoomNames],
  )

  useEffect(() => {
    if (!image) {
      setImagePreviewUrl(null)
      return
    }

    const objectUrl = URL.createObjectURL(image)
    setImagePreviewUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [image])

  const handleCreateRoom = async (values: CreateRoomFormValues) => {
    if (!values.image) return
    try {
      const roomId = await createRoom({
        categories: values.categories,
        image: values.image,
        name: values.roomName.trim(),
        visibility: values.visibility,
      })
      trackProductEvent({
        name: 'room_created',
        properties: {
          category_count: values.categories.length as 1 | 2 | 3,
          visibility: values.visibility,
        },
      })
      reset()
      onClose()
      onCreated?.(roomId)
    } catch (error) {
      if (error instanceof RoomNameAlreadyExistsError) {
        setError('roomName', {
          message: error.message,
          type: 'validate',
        })
        return
      }

      toast.error(
        error instanceof Error ? error.message : 'Не удалось создать комнату.',
      )
    }
  }

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast.error('Можно загрузить изображение JPEG, PNG или WebP.')
      return
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      toast.error('Размер обложки не должен превышать 5 МБ.')
      return
    }

    setValue('image', file, { shouldValidate: true })
  }

  const handleRemoveImage = () => {
    setValue('image', null, { shouldValidate: true })
  }

  return (
    <Modal
      aria-describedby="create-room-description"
      aria-labelledby="create-room-title"
      closeAfterTransition
      onClose={onClose}
      open={open}
    >
      <Fade in={open}>
        <Box
          component="form"
          noValidate
          onSubmit={handleSubmit(handleCreateRoom)}
          sx={style}
        >
          <h2 className="mb-4 text-3xl sm:text-4xl" id="create-room-title">
            Создание комнаты
          </h2>
          <div className="mb-6 flex flex-col" id="create-room-description">
            <div className="mb-5 border-b border-[#4A2B6D] pb-6 sm:mb-6 sm:pb-7">
              <span className="mb-3 block text-[#CDBCE2]">
                Придумайте название
              </span>

              <TextField
                disabled={isSubmitting}
                error={Boolean(errors.roomName)}
                fullWidth
                helperText={errors.roomName?.message}
                inputProps={{ maxLength: ROOM_NAME_MAX_LENGTH }}
                label="Название комнаты"
                {...register('roomName', {
                  maxLength: {
                    message: `Название не может быть длиннее ${ROOM_NAME_MAX_LENGTH} символов.`,
                    value: ROOM_NAME_MAX_LENGTH,
                  },
                  required: 'Обязательное поле.',
                  validate: {
                    notBlank: value =>
                      Boolean(value.trim()) || 'Обязательное поле.',
                    unique: value =>
                      !existingRoomNameKeys.has(getRoomNameKey(value)) ||
                      'Комната с таким названием уже существует.',
                  },
                })}
                sx={{ borderRadius: '16px' }}
                variant="filled"
              />
            </div>

            <div className="mb-5 border-b border-[#4A2B6D] pb-6 sm:mb-6 sm:pb-7">
              <span className="mb-3 block text-[#CDBCE2]">
                Доступ к комнате
              </span>
              <TextField
                disabled={isSubmitting}
                fullWidth
                label="Видимость"
                select
                {...register('visibility')}
              >
                <MenuItem value="public">Публичная — видна в списке</MenuItem>
                <MenuItem value="unlisted">
                  По ссылке — скрыта из списка
                </MenuItem>
                <MenuItem value="private">
                  Приватная — только по приглашению
                </MenuItem>
              </TextField>
            </div>

            <div className="mb-5 border-b border-[#4A2B6D] pb-6 sm:mb-6 sm:pb-7">
              <span className="mb-3 block text-[#CDBCE2]">
                Выберите музыкальные категории (не более трёх)
              </span>

              <Controller
                control={control}
                name="categories"
                render={({ field }) => (
                  <Autocomplete
                    disabled={isSubmitting}
                    filterSelectedOptions
                    getOptionDisabled={() => field.value.length >= 3}
                    getOptionLabel={option => option.title}
                    isOptionEqualToValue={(option, value) =>
                      option.id === value.id
                    }
                    multiple
                    noOptionsText="Нет категорий"
                    onChange={(_, newValue) => field.onChange(newValue)}
                    options={ROOM_CATEGORIES}
                    renderInput={params => (
                      <TextField
                        {...params}
                        error={Boolean(errors.categories)}
                        helperText={errors.categories?.message}
                        label="Жанры и направления"
                        placeholder="Начните вводить жанр"
                      />
                    )}
                    value={field.value}
                  />
                )}
                rules={{
                  validate: categories =>
                    categories.length > 0 || 'Выберите хотя бы одну категорию.',
                }}
              />
            </div>

            <div className="mb-5 border-b border-[#4A2B6D] pb-6 sm:mb-6 sm:pb-7">
              <span className="mb-3 block text-[#CDBCE2]">
                Установите обложку
              </span>

              <div className="flex flex-col gap-4 min-[420px]:flex-row min-[420px]:items-stretch">
                <div
                  className={`h-[112px] w-[112px] shrink-0 overflow-hidden rounded-[10px] border ${
                    errors.image ? 'border-[#FF849A]' : 'border-[#6D4A8F]'
                  }`}
                >
                  {imagePreviewUrl ? (
                    <img
                      alt="Предпросмотр обложки комнаты"
                      className="h-full w-full object-cover"
                      src={imagePreviewUrl}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-[#32204B]">
                      <MembersIcon
                        sx={{ '& path': { fill: '#B88CFF' }, width: '32px' }}
                      />
                    </div>
                  )}
                </div>

                <div className="flex min-w-0 flex-1 flex-col justify-between">
                  <Button
                    className="mb-2 w-full"
                    component="label"
                    disabled={isSubmitting}
                    variant="outlined"
                  >
                    Загрузить обложку
                    <Controller
                      control={control}
                      name="image"
                      render={() => (
                        <input
                          accept="image/png,image/jpeg,image/webp"
                          hidden
                          onChange={handleFiles}
                          type="file"
                        />
                      )}
                      rules={{ required: 'Загрузите обложку комнаты.' }}
                    />
                  </Button>

                  {image && (
                    <Button
                      className="w-full"
                      color="error"
                      disabled={isSubmitting}
                      onClick={handleRemoveImage}
                      variant="outlined"
                    >
                      Удалить
                    </Button>
                  )}
                </div>
              </div>
              {errors.image && (
                <span className="mt-2 block text-xs text-[#FF9BAD]">
                  {errors.image.message}
                </span>
              )}
            </div>
          </div>

          <Button
            disabled={isSubmitting}
            fullWidth
            type="submit"
            variant="contained"
          >
            {isSubmitting ? 'Создаём…' : 'Готово'}
          </Button>
        </Box>
      </Fade>
    </Modal>
  )
}
