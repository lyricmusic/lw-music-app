import { ChangeEvent, FormEvent, useState } from 'react'
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

const style = {
  backgroundColor: '#ECEDF2',
  borderRadius: '20px',
  boxShadow: 24,
  left: '50%',
  padding: '40px',
  position: 'absolute' as const,
  top: '50%',
  transform: 'translate(-50%, -50%)',
  maxHeight: 'calc(100vh - 32px)',
  maxWidth: 'calc(100vw - 32px)',
  overflowY: 'auto',
  width: 555,
}

interface CreateRoomDialogProps {
  onClose: () => void
  onRoomCreated: () => void
  open: boolean
}

const categoryOptions: Category[] = [
  { id: 1, title: 'Приколы' },
  { id: 2, title: 'Весёлые песни' },
  { id: 3, title: 'Научные фильмы' },
  { id: 4, title: 'Космос' },
]

export function CreateRoomDialog({
  onClose,
  onRoomCreated,
  open,
}: CreateRoomDialogProps) {
  const [roomName, setRoomName] = useState('')
  const [categoryList, setCategoryList] = useState<Category[]>([])
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const handleCreateRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!roomName.trim() || !categoryList.length) {
      setError(true)
      return
    }

    setError(false)
    setLoading(true)

    try {
      await createRoom({
        categories: categoryList,
        image: url,
        name: roomName.trim(),
      })
      onRoomCreated()
      onClose()
    } catch (error) {
      if (error instanceof Error) {
        const isErrorSize = error.message.includes(
          'The value of property "image"',
        )
        toast.error(
          isErrorSize
            ? 'Размер обложки не должен превышать 1МБ'
            : error.message,
        )
      }
    } finally {
      setLoading(false)
    }
  }

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.size > 700_000) {
      toast.error('Размер обложки не должен превышать 700 КБ')
      event.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') setUrl(reader.result)
    })
    reader.readAsDataURL(file)
  }

  return (
    <Modal
      aria-describedby="spring-modal-description"
      aria-labelledby="spring-modal-title"
      closeAfterTransition
      onClose={onClose}
      open={open}
    >
      <Fade in={open}>
        <Box component="form" onSubmit={handleCreateRoom} sx={style}>
          <h2 className="font-ultrabold text-4xl mb-4">Создание комнаты</h2>
          <div className="flex flex-col mb-6">
            <div className="mb-6 pb-7 border-b border-white">
              <span className="text-secondary-text block mb-3">
                Придумайте название
              </span>

              <TextField
                error={error}
                fullWidth
                helperText={error ? 'Обязательное поле.' : ''}
                label="Название комнаты"
                onChange={e => setRoomName(e.target.value)}
                sx={{
                  '&.MuiFilledInput': {
                    backgroundColor: 'white',
                  },
                  borderRadius: '16px',
                }}
                value={roomName}
                variant="filled"
              />
            </div>

            <div className="mb-6 pb-7 border-b border-white">
              <span className="text-secondary-text block mb-3">
                Выберите категории видео (не более трёх)
              </span>

              <Autocomplete
                filterSelectedOptions
                getOptionLabel={option => option.title}
                isOptionEqualToValue={(option: Category, value: Category) =>
                  option.id === value.id
                }
                multiple
                noOptionsText="Нет категорий"
                onChange={(_, newValue: Category[]) => {
                  setCategoryList(newValue)
                }}
                options={categoryOptions}
                renderInput={params => (
                  <TextField
                    {...params}
                    error={error}
                    helperText={error ? 'Обязательное поле.' : ''}
                    label="Название категории"
                    placeholder="Начните вводить название категории"
                  />
                )}
                value={categoryList}
              />
            </div>

            <div className="mb-6 pb-7 border-b border-white">
              <span className="text-secondary-text block mb-3">
                Установите обложку
              </span>

              <div className="flex">
                <div className="w-[112px] h-[112px] rounded-[10px] overflow-hidden mr-5 border border-[#D6D7F0]">
                  {url ? (
                    <img
                      alt="Avatar Placeholder"
                      className="w-full h-full object-cover"
                      src={url}
                    />
                  ) : (
                    <div className="h-full flex justify-center items-center bg-white">
                      <MembersIcon sx={{ width: '32px' }} />
                    </div>
                  )}
                </div>

                <div className="flex flex-col justify-between">
                  <Button
                    className="w-full mb-2"
                    component="label"
                    variant="outlined"
                  >
                    Загрузить обложку
                    <input
                      accept="image/png,image/jpeg"
                      hidden
                      onChange={handleFiles}
                      type="file"
                    />
                  </Button>

                  {url && (
                    <Button
                      className="w-full"
                      color="error"
                      onClick={() => setUrl('')}
                      variant="outlined"
                    >
                      Удалить
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <Button
            disabled={loading}
            fullWidth
            type="submit"
            variant="contained"
          >
            Готово
          </Button>
        </Box>
      </Fade>
    </Modal>
  )
}
