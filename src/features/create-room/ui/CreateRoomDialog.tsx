import { ChangeEvent, useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'react-toastify'

import type { Category } from '@/entities/room'
import { MembersIcon } from '@/shared/ui/icons'
import {
  Autocomplete,
  Box,
  Button,
  Fade,
  Modal,
  TextField,
} from '@mui/material'

import { createRoom } from '../api/createRoom'

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const style = {
  backgroundColor: '#ECEDF2',
  borderRadius: '20px',
  boxShadow: 24,
  left: '50%',
  maxHeight: 'calc(100vh - 32px)',
  maxWidth: 'calc(100vw - 32px)',
  overflowY: 'auto',
  padding: '40px',
  position: 'absolute' as const,
  top: '50%',
  transform: 'translate(-50%, -50%)',
  width: 555,
}

interface CreateRoomDialogProps {
  onClose: () => void
  open: boolean
}

interface CreateRoomFormValues {
  categories: Category[]
  image: File | null
  roomName: string
}

const categoryOptions: Category[] = [
  { id: 1, title: 'Приколы' },
  { id: 2, title: 'Весёлые песни' },
  { id: 3, title: 'Научные фильмы' },
  { id: 4, title: 'Космос' },
]

export function CreateRoomDialog({ onClose, open }: CreateRoomDialogProps) {
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setValue,
    watch,
  } = useForm<CreateRoomFormValues>({
    defaultValues: { categories: [], image: null, roomName: '' },
  })
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const image = watch('image')

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
      await createRoom({
        categories: values.categories,
        image: values.image,
        name: values.roomName.trim(),
      })
      reset()
      onClose()
    } catch (error) {
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
          <h2 className="mb-4 text-4xl" id="create-room-title">
            Создание комнаты
          </h2>
          <div className="mb-6 flex flex-col" id="create-room-description">
            <div className="mb-6 border-b border-white pb-7">
              <span className="mb-3 block text-secondary-text">
                Придумайте название
              </span>

              <TextField
                disabled={isSubmitting}
                error={Boolean(errors.roomName)}
                fullWidth
                helperText={errors.roomName?.message}
                inputProps={{ maxLength: 80 }}
                label="Название комнаты"
                {...register('roomName', {
                  maxLength: {
                    message: 'Название не может быть длиннее 80 символов.',
                    value: 80,
                  },
                  required: 'Обязательное поле.',
                  validate: value =>
                    Boolean(value.trim()) || 'Обязательное поле.',
                })}
                sx={{
                  '&.MuiFilledInput': { backgroundColor: 'white' },
                  borderRadius: '16px',
                }}
                variant="filled"
              />
            </div>

            <div className="mb-6 border-b border-white pb-7">
              <span className="mb-3 block text-secondary-text">
                Выберите категории видео (не более трёх)
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
                    options={categoryOptions}
                    renderInput={params => (
                      <TextField
                        {...params}
                        error={Boolean(errors.categories)}
                        helperText={errors.categories?.message}
                        label="Категории комнаты"
                        placeholder="Начните вводить название категории"
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

            <div className="mb-6 border-b border-white pb-7">
              <span className="mb-3 block text-secondary-text">
                Установите обложку
              </span>

              <div className="flex">
                <div
                  className={`mr-5 h-[112px] w-[112px] overflow-hidden rounded-[10px] border ${
                    errors.image ? 'border-[#D32F2F]' : 'border-[#D6D7F0]'
                  }`}
                >
                  {imagePreviewUrl ? (
                    <img
                      alt="Предпросмотр обложки комнаты"
                      className="h-full w-full object-cover"
                      src={imagePreviewUrl}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-white">
                      <MembersIcon sx={{ width: '32px' }} />
                    </div>
                  )}
                </div>

                <div className="flex flex-col justify-between">
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
                <span className="mt-2 block text-xs text-[#D32F2F]">
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
