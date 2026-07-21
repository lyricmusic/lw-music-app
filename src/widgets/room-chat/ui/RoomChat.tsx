import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { useForm } from 'react-hook-form'

import {
  ROOM_MESSAGE_MAX_LENGTH,
  deleteRoomMessage,
  reportRoomMessage,
  sendRoomMessage,
  useRoomMessages,
} from '@/entities/message'
import type { RoomMessage } from '@/entities/message'
import type { RoomMemberRole } from '@/entities/room'
import { useSession } from '@/entities/session'
import { blockUser, useBlockedUsers } from '@/entities/user'
import { Button } from '@/shared/ui/button'
import { TextField } from '@/shared/ui/text-field'
import {
  Avatar,
  Box,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  TextField as MuiTextField,
  Typography,
} from '@mui/material'
import { toast } from 'react-toastify'

interface RoomChatProps {
  actions?: ReactNode
  chatEnabled?: boolean
  currentMemberRole?: null | RoomMemberRole
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
  actorRole,
  isOwn,
  message,
  roomId,
}: {
  actorRole?: null | RoomMemberRole
  isOwn: boolean
  message: RoomMessage
  roomId: string
}) {
  const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)
  const [dialogAction, setDialogAction] = useState<'delete' | 'report' | null>(
    null,
  )
  const [error, setError] = useState<null | string>(null)
  const [pending, setPending] = useState(false)
  const [reason, setReason] = useState('')
  const canDelete = Boolean(
    actorRole && ['host', 'moderator', 'owner'].includes(actorRole),
  )
  const canReport = !isOwn
  const canBlock = !isOwn
  const hasActions = canBlock || canDelete || canReport

  const openMenu = (event: MouseEvent<HTMLElement>) => {
    setAnchorElement(event.currentTarget)
  }

  const openDialog = (action: 'delete' | 'report') => {
    setAnchorElement(null)
    setDialogAction(action)
    setError(null)
    setReason('')
  }

  const closeDialog = () => {
    if (!pending) setDialogAction(null)
  }

  const submitAction = async () => {
    setPending(true)
    setError(null)
    try {
      if (dialogAction === 'delete') {
        await deleteRoomMessage(roomId, message.id)
        toast.success('Сообщение удалено.')
      } else if (dialogAction === 'report') {
        await reportRoomMessage(roomId, message.id, reason)
        toast.success('Жалоба отправлена модераторам комнаты.')
      }
      setDialogAction(null)
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Не удалось выполнить действие.',
      )
    } finally {
      setPending(false)
    }
  }

  const handleBlock = async () => {
    setAnchorElement(null)
    setPending(true)
    try {
      await blockUser(message.authorId)
      toast.success(`Сообщения ${message.authorName} скрыты только для вас.`)
    } catch (reason) {
      toast.error(
        reason instanceof Error
          ? reason.message
          : 'Не удалось скрыть пользователя.',
      )
    } finally {
      setPending(false)
    }
  }

  const messageActions = hasActions ? (
    <>
      <IconButton
        aria-label="Действия с сообщением"
        disabled={message.pending}
        onClick={openMenu}
        size="small"
        sx={{ color: '#D7DBF0', margin: '-6px -8px -6px 0' }}
      >
        ⋮
      </IconButton>
      <Menu
        anchorEl={anchorElement}
        onClose={() => setAnchorElement(null)}
        open={Boolean(anchorElement)}
        slotProps={{
          paper: {
            sx: {
              backgroundColor: '#24143D',
              backgroundImage: 'none',
              border: '1px solid #4A2B6D',
              color: '#F8F3FF',
            },
          },
        }}
      >
        {canDelete && (
          <MenuItem
            onClick={() => openDialog('delete')}
            sx={{ color: '#FF9BAD' }}
          >
            Удалить сообщение…
          </MenuItem>
        )}
        {canReport && (
          <MenuItem onClick={() => openDialog('report')}>
            Пожаловаться…
          </MenuItem>
        )}
        {canBlock && (
          <MenuItem onClick={() => void handleBlock()}>
            Скрыть пользователя
          </MenuItem>
        )}
      </Menu>
      <Dialog
        fullWidth
        maxWidth="sm"
        onClose={closeDialog}
        open={dialogAction !== null}
        slotProps={{
          paper: {
            sx: {
              backgroundColor: '#24143D',
              backgroundImage: 'none',
              border: '1px solid #4A2B6D',
              color: '#F8F3FF',
            },
          },
        }}
      >
        <DialogTitle>
          {dialogAction === 'delete'
            ? 'Удалить сообщение?'
            : 'Отправить жалобу'}
        </DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2 }}>
          {dialogAction === 'delete' ? (
            <Typography>
              Сообщение исчезнет у всех участников. Действие будет записано в
              журнал комнаты.
            </Typography>
          ) : (
            <MuiTextField
              error={Boolean(error)}
              helperText={error}
              inputProps={{ maxLength: 500 }}
              label="Причина жалобы"
              minRows={3}
              multiline
              onChange={event => {
                setReason(event.target.value)
                if (error) setError(null)
              }}
              sx={{
                '& .MuiFormHelperText-root': { color: '#FF9BAD' },
                '& .MuiInputBase-input, & .MuiInputLabel-root': {
                  color: '#F8F3FF',
                },
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#6D4A8F',
                },
              }}
              value={reason}
            />
          )}
          {dialogAction === 'delete' && error && (
            <Typography color="error" role="alert">
              {error}
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ padding: 3, paddingTop: 1 }}>
          <Button disabled={pending} onClick={closeDialog}>
            Отмена
          </Button>
          <Button
            color={dialogAction === 'delete' ? 'error' : 'primary'}
            disabled={pending || (dialogAction === 'report' && !reason.trim())}
            onClick={() => void submitAction()}
            variant="contained"
          >
            {pending
              ? 'Отправляем…'
              : dialogAction === 'delete'
                ? 'Удалить'
                : 'Отправить жалобу'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  ) : null

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
      {messageActions}
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

export function RoomChat({
  actions,
  chatEnabled = true,
  currentMemberRole,
  roomId,
}: RoomChatProps) {
  const { profile, user } = useSession()
  const { error, loading, messages } = useRoomMessages(roomId)
  const blockedUserIds = useBlockedUsers()
  const visibleMessages = useMemo(
    () => messages.filter(message => !blockedUserIds.has(message.authorId)),
    [blockedUserIds, messages],
  )
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
  }, [visibleMessages])

  async function handleSendMessage({ message }: { message: string }) {
    if (!profile || !user || !message.trim()) return

    stickToBottomRef.current = true

    try {
      await sendRoomMessage({
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

  const inputDisabled = !chatEnabled || !profile || !user
  const submitDisabled = inputDisabled || isSubmitting || !draft.trim()

  return (
    <Paper
      className="flex h-full min-h-0 w-full flex-col p-3 sm:p-5"
      component="aside"
      elevation={0}
      sx={{
        backgroundColor: '#2A2B47',
        borderRadius: '20px',
        color: '#FFFFFF',
      }}
    >
      <Box
        alignItems="center"
        className="shrink-0"
        display="flex"
        flexWrap="wrap"
        gap={1.5}
        justifyContent="space-between"
      >
        <Typography
          component="h2"
          sx={{ fontSize: { xs: '24px', sm: '28px' }, lineHeight: 1 }}
          variant="h2"
        >
          Чат
        </Typography>
        {actions}
      </Box>

      <Box
        className="mb-4 mt-4 min-h-0 flex-1 overflow-y-auto pr-1 sm:mb-5 sm:mt-6"
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
          !error &&
          messages.length > 0 &&
          visibleMessages.length === 0 && (
            <Typography
              className="m-auto px-3 text-center text-sm"
              component="li"
              sx={{ color: '#8B8DB3' }}
            >
              Сообщения скрытых пользователей не показываются. Совместное
              присутствие в комнате сохраняется.
            </Typography>
          )}

        {!loading &&
          visibleMessages.map(message => (
            <MessageItem
              actorRole={currentMemberRole}
              isOwn={message.authorId === user?.uid}
              key={message.id}
              message={message}
              roomId={roomId}
            />
          ))}
      </Box>

      {!chatEnabled && (
        <Typography
          className="mb-2 text-xs leading-4"
          sx={{ color: '#D7DBF0' }}
        >
          Владелец комнаты отключил чат для гостей.
        </Typography>
      )}

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
          sx={{
            '& .MuiFilledInput-input': { color: '#F8F3FF' },
            '& .MuiFilledInput-root, & .MuiFilledInput-root:hover, & .MuiFilledInput-root.Mui-focused':
              {
                backgroundColor: '#1B0C32',
              },
            '& input::placeholder': { color: '#8B8DB3' },
            flex: 1,
            minWidth: 0,
          }}
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
            fontSize: { xs: '21px', sm: '24px' },
            height: { xs: '48px', sm: '52px' },
            minWidth: { xs: '48px', sm: '52px' },
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
