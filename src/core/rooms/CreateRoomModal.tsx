import React, { useState } from 'react'
import ReactFileReader from 'react-file-reader'
import { toast } from 'react-toastify'

import { Category } from '@/core/rooms/types/Room.ts'
import { db } from '@/firebase.ts'
import { Autocomplete, Box, Button, Modal } from '@mui/material'
import TextField from '@mui/material/TextField'
import { animated, useSpring } from '@react-spring/web'
import { addDoc, collection, updateDoc } from 'firebase/firestore'

import { MembersIcon } from '@/components/icons/MembersIcon.tsx'

interface FadeProps {
  children: React.ReactElement
  in?: boolean
  onClick?: any
  onEnter?: (node: HTMLElement, isAppearing: boolean) => void
  onExited?: (node: HTMLElement, isAppearing: boolean) => void
  ownerState?: any
}

const Fade = React.forwardRef<HTMLDivElement, FadeProps>(
  function Fade(props, ref) {
    const {
      children,
      in: open,
      onClick,
      onEnter,
      onExited,
      ownerState,
      ...other
    } = props
    const style = useSpring({
      from: { opacity: 0 },
      onRest: () => {
        if (!open && onExited) {
          onExited(null as any, true)
        }
      },
      onStart: () => {
        if (open && onEnter) {
          onEnter(null as any, true)
        }
      },
      to: { opacity: open ? 1 : 0 },
    })

    return (
      <animated.div ref={ref} style={style} {...other}>
        {React.cloneElement(children, { onClick })}
      </animated.div>
    )
  },
)

const style = {
  backgroundColor: '#ECEDF2',
  borderRadius: '20px',
  boxShadow: 24,
  left: '50%',
  padding: '40px',
  position: 'absolute' as 'absolute',
  top: '50%',
  transform: 'translate(-50%, -50%)',
  width: 555,
}

export function CreateRoomModal({
  handleClose,
  isOpen,
  onRoomCreated,
}: {
  handleClose: () => void
  isOpen: boolean
  onRoomCreated: () => void
}) {
  const [roomName, setRoomName] = useState('')
  const [categoryList, setCategoryList] = useState<Category[]>([])
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const handleCreateRoom = async () => {
    setLoading(true)
    if (!roomName || !categoryList.length) {
      setError(true)
      return
    }

    setError(false)

    const room = {
      categories: categoryList,
      image: url,
      name: roomName,
    }

    try {
      const roomCreated = await addDoc(collection(db, 'rooms'), room)
      // const roomId = roomCreated.id

      await updateDoc(roomCreated, { id: roomCreated.id })
      onRoomCreated()
      handleClose()
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

  const handleFiles = (files: FileList) => {
    console.log('files', files)
    // if (files.base64) {
    // setUrl(files.base64)
    // }
  }

  const categoryOptions: Category[] = [
    { id: 1, title: 'Приколы' },
    { id: 2, title: 'Веселые песни' },
    { id: 3, title: 'Научные фильмы' },
    { id: 4, title: 'Космос' },
  ]

  return (
    <Modal
      aria-describedby="spring-modal-description"
      aria-labelledby="spring-modal-title"
      closeAfterTransition
      onClose={handleClose}
      open={isOpen}
      slotProps={{
        backdrop: {
          TransitionComponent: Fade,
        },
      }}
    >
      <Fade in={isOpen}>
        <Box component="form" sx={style}>
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
                  <ReactFileReader
                    base64={true}
                    fileTypes={['.png', '.jpg']}
                    handleFiles={handleFiles}
                  >
                    <Button className="w-full mb-2" variant="outlined">
                      Загрузить обложку
                    </Button>
                  </ReactFileReader>

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
            onClick={handleCreateRoom}
            variant="contained"
          >
            Готово
          </Button>
        </Box>
      </Fade>
    </Modal>
  )
}
