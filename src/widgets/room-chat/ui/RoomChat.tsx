import { useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'

import {
  ROOM_MESSAGE_MAX_LENGTH,
  sendRoomMessage,
  useRoomMessages,
} from '@/entities/message'
import type { RoomMessage } from '@/entities/message'
import { useSession } from '@/entities/session'
import { Button } from '@/shared/ui/button'
import { TextField } from '@/shared/ui/text-field'
import { Avatar, Box, CircularProgress, Paper, Typography } from '@mui/material'

interface RoomChatProps {
  roomId: string
}

const timeFormatter = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
})

function formatMessageTime(message: RoomMessage) {
  return message.createdAt
    ? timeFormatter.format(message.createdAt.toDate())
    : '…'
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase()
}

function MessageItem({
  isOwn,
  message,
}: {
  isOwn: boolean
  message: RoomMessage
}) {
  const messageBubble = (
    <Box
      className={`flex min-w-0 items-end gap-3 px-4 ${
        isOwn
          ? 'rounded-[12px_12px_0_12px] py-3'
          : 'rounded-[2px_8px_8px_8px] py-[11px]'
      }`}
      sx={{
        backgroundColor: isOwn ? '#6F70E7' : '#3F3F59',
        color: '#FFFFFF',
        maxWidth: '100%',
        opacity: message.pending ? 0.76 : 1,
      }}
    >
      <Typography
        className="min-w-0 flex-1 break-words text-[16px] leading-[21px]"
        component="p"
        sx={{ whiteSpace: 'pre-wrap' }}
      >
        {message.text}
      </Typography>
      <Typography
        aria-label={`Отправлено в ${formatMessageTime(message)}`}
        className="shrink-0 text-[13px] leading-[18px]"
        component="time"
        sx={{ color: isOwn ? '#FFFFFF' : '#8B8DB3' }}
      >
        {formatMessageTime(message)}
      </Typography>
    </Box>
  )

  if (isOwn) {
    return (
      <Box className="ml-auto w-fit max-w-[86%]" component="li">
        {messageBubble}
      </Box>
    )
  }

  return (
    <Box className="flex items-start gap-3" component="li">
      <Avatar
        alt={message.authorName}
        src={message.authorPhotoURL ?? undefined}
        sx={{
          backgroundColor: '#6F70E7',
          borderRadius: '100%',
          flexShrink: 0,
          fontSize: '13px',
          height: 38,
          marginTop: '1px',
          width: 38,
        }}
      >
        {getInitials(message.authorName)}
      </Avatar>

      <Box className="min-w-0 flex-1">
        <Typography
          className="mb-0.5 truncate text-[14px] leading-[18px]"
          sx={{ color: '#8B8DB3', fontWeight: 600 }}
        >
          {message.authorName}
        </Typography>
        {messageBubble}
      </Box>
    </Box>
  )
}

export function RoomChat({ roomId }: RoomChatProps) {
  const { profile, user } = useSession()
  const { error, loading, messages } = useRoomMessages(roomId)
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    resetField,
    setError,
    watch,
  } = useForm<{ message: string }>({ defaultValues: { message: '' } })
  const messageListRef = useRef<HTMLUListElement>(null)
  const stickToBottomRef = useRef(true)
  const draft = watch('message')

  useEffect(() => {
    const messageList = messageListRef.current
    if (!messageList || !stickToBottomRef.current) return

    messageList.scrollTop = messageList.scrollHeight
  }, [messages])

  async function handleSendMessage({ message }: { message: string }) {
    if (!profile || !user || !message.trim()) return

    stickToBottomRef.current = true

    try {
      await sendRoomMessage({
        authorName: profile.displayName,
        authorPhotoURL: profile.photoURL,
        roomId,
        text: message,
      })
      resetField('message')
    } catch (reason) {
      console.error('Не удалось отправить сообщение:', reason)
      setError('message', {
        message:
          reason instanceof Error
            ? reason.message
            : 'Не удалось отправить сообщение.',
        type: 'server',
      })
    }
  }

  const inputDisabled = !profile || !user
  const submitDisabled = inputDisabled || isSubmitting || !draft.trim()

  return (
    <Paper
      className="flex h-full min-h-0 w-full flex-col p-5"
      component="aside"
      elevation={0}
      sx={{
        backgroundColor: '#2A2B47',
        borderRadius: '20px',
        color: '#FFFFFF',
      }}
    >
      <Typography
        className="shrink-0"
        component="h2"
        sx={{ fontSize: '28px', lineHeight: 1 }}
        variant="h2"
      >
        Чат
      </Typography>

      <Box
        className="my-5 min-h-0 flex-1 overflow-y-auto pr-1"
        component="ul"
        onScroll={event => {
          const target = event.currentTarget
          stickToBottomRef.current =
            target.scrollHeight - target.scrollTop - target.clientHeight < 48
        }}
        ref={messageListRef}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          listStyle: 'none',
          marginLeft: 0,
          marginRight: 0,
          scrollbarColor: '#5C5D7E transparent',
          scrollbarWidth: 'thin',
        }}
      >
        {loading && (
          <Box
            className="flex flex-1 items-center justify-center"
            component="li"
          >
            <CircularProgress size={26} sx={{ color: '#8B8DB3' }} />
          </Box>
        )}

        {!loading && !error && messages.length === 0 && (
          <Typography
            className="m-auto px-3 text-center text-sm"
            component="li"
            sx={{ color: '#8B8DB3' }}
          >
            Сообщений пока нет. Начните общение первым.
          </Typography>
        )}

        {!loading &&
          messages.map(message => (
            <MessageItem
              isOwn={message.authorId === user?.uid}
              key={message.id}
              message={message}
            />
          ))}
      </Box>

      {(error || errors.message?.message) && (
        <Typography
          className="mb-2 text-xs leading-4"
          role="alert"
          sx={{ color: '#FF9BAD' }}
        >
          {errors.message?.message ?? error}
        </Typography>
      )}

      <Box
        className="flex min-h-14 shrink-0 items-center gap-2"
        component="form"
        onSubmit={handleSubmit(handleSendMessage)}
      >
        <TextField
          autoComplete="off"
          disabled={inputDisabled || isSubmitting}
          placeholder="Написать сообщение"
          {...register('message', {
            maxLength: {
              message: `Сообщение не может быть длиннее ${ROOM_MESSAGE_MAX_LENGTH} символов.`,
              value: ROOM_MESSAGE_MAX_LENGTH,
            },
            validate: value => Boolean(value.trim()) || 'Введите сообщение.',
          })}
          slotProps={{
            htmlInput: {
              'aria-label': 'Сообщение',
              maxLength: ROOM_MESSAGE_MAX_LENGTH,
            },
          }}
          sx={{ flex: 1, minWidth: 0 }}
        />
        <Button
          aria-label="Отправить сообщение"
          disabled={submitDisabled}
          sx={{
            '&.Mui-disabled': {
              backgroundColor: '#6F70E7',
              color: '#FFFFFF',
              opacity: 0.5,
            },
            '&:hover': { backgroundColor: '#5D5FD4' },
            backgroundColor: '#6F70E7',
            color: '#FFFFFF',
            flexShrink: 0,
            fontSize: '24px',
            height: '52px',
            minWidth: '52px',
            padding: 0,
          }}
          type="submit"
          variant="contained"
        >
          →
        </Button>
      </Box>
    </Paper>
  )
}
