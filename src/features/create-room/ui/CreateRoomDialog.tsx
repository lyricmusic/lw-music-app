import { ChangeEvent, FormEvent, useEffect, useState } from 'react'
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

const categoryOptions: Category[] = [
  { id: 1, title: 'Приколы' },
  { id: 2, title: 'Весёлые песни' },
  { id: 3, title: 'Научные фильмы' },
  { id: 4, title: 'Космос' },
]

export function CreateRoomDialog({ onClose, open }: CreateRoomDialogProps) {
  const [roomName, setRoomName] = useState('')
  const [categoryList, setCategoryList] = useState<Category[]>([])
  const [image, setImage] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(
    () => () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    },
    [imagePreviewUrl],
  )

  const nameHasError = submitted && !roomName.trim()
  const categoriesHaveError = submitted && categoryList.length === 0
  const imageHasError = submitted && !image

  const handleCreateRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitted(true)

    if (!roomName.trim() || categoryList.length === 0 || !image) return

    setLoading(true)

    try {
      await createRoom({
        categories: categoryList,
        image,
        name: roomName.trim(),
      })
      setRoomName('')
      setCategoryList([])
      setImage(null)
      setImagePreviewUrl(null)
      setSubmitted(false)
      onClose()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Не удалось создать комнату.',
      )
    } finally {
      setLoading(false)
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

    setImage(file)
    setImagePreviewUrl(URL.createObjectURL(file))
  }

  const handleRemoveImage = () => {
    setImage(null)
    setImagePreviewUrl(null)
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
        <Box component="form" onSubmit={handleCreateRoom} sx={style}>
          <h2 className="mb-4 text-4xl" id="create-room-title">
            Создание комнаты
          </h2>
          <div className="mb-6 flex flex-col" id="create-room-description">
            <div className="mb-6 border-b border-white pb-7">
              <span className="mb-3 block text-secondary-text">
                Придумайте название
              </span>

              <TextField
                disabled={loading}
                error={nameHasError}
                fullWidth
                helperText={nameHasError ? 'Обязательное поле.' : ''}
                inputProps={{ maxLength: 80 }}
                label="Название комнаты"
                onChange={event => setRoomName(event.target.value)}
                sx={{
                  '&.MuiFilledInput': { backgroundColor: 'white' },
                  borderRadius: '16px',
                }}
                value={roomName}
                variant="filled"
              />
            </div>

            <div className="mb-6 border-b border-white pb-7">
              <span className="mb-3 block text-secondary-text">
                Выберите категории видео (не более трёх)
              </span>

              <Autocomplete
                disabled={loading}
                filterSelectedOptions
                getOptionDisabled={() => categoryList.length >= 3}
                getOptionLabel={option => option.title}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                multiple
                noOptionsText="Нет категорий"
                onChange={(_, newValue) => setCategoryList(newValue)}
                options={categoryOptions}
                renderInput={params => (
                  <TextField
                    {...params}
                    error={categoriesHaveError}
                    helperText={
                      categoriesHaveError
                        ? 'Выберите хотя бы одну категорию.'
                        : ''
                    }
                    label="Категории комнаты"
                    placeholder="Начните вводить название категории"
                  />
                )}
                value={categoryList}
              />
            </div>

            <div className="mb-6 border-b border-white pb-7">
              <span className="mb-3 block text-secondary-text">
                Установите обложку
              </span>

              <div className="flex">
                <div
                  className={`mr-5 h-[112px] w-[112px] overflow-hidden rounded-[10px] border ${
                    imageHasError ? 'border-[#D32F2F]' : 'border-[#D6D7F0]'
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
                    disabled={loading}
                    variant="outlined"
                  >
                    Загрузить обложку
                    <input
                      accept="image/png,image/jpeg,image/webp"
                      hidden
                      onChange={handleFiles}
                      type="file"
                    />
                  </Button>

                  {image && (
                    <Button
                      className="w-full"
                      color="error"
                      disabled={loading}
                      onClick={handleRemoveImage}
                      variant="outlined"
                    >
                      Удалить
                    </Button>
                  )}
                </div>
              </div>
              {imageHasError && (
                <span className="mt-2 block text-xs text-[#D32F2F]">
                  Загрузите обложку комнаты.
                </span>
              )}
            </div>
          </div>

          <Button
            disabled={loading}
            fullWidth
            type="submit"
            variant="contained"
          >
            {loading ? 'Создаём…' : 'Готово'}
          </Button>
        </Box>
      </Fade>
    </Modal>
  )
}
