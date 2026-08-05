import { useEffect, useRef, useState } from 'react'
import { useMatch, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'

import logo from '@assets/lw.svg'

import { leaveRoom, useCurrentRoomMember, useRoomName } from '@/entities/room'
import { useSession } from '@/entities/session'
import { LeaveRoomDialog } from '@/features/manage-room'
import { routes } from '@/shared/config/routes'
import { MemberIcon } from '@/shared/ui/icons'
import {
  AppBar,
  Avatar,
  Box,
  Button,
  IconButton,
  Toolbar,
  Typography,
} from '@mui/material'

import { UserMenu } from './UserMenu'
export function AppHeader() {
  const { profile, user } = useSession()
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)
  const [leavePending, setLeavePending] = useState(false)
  const userMenuContainerRef = useRef<HTMLDivElement>(null)
  const userMenuTriggerRef = useRef<HTMLButtonElement>(null)
  const navigate = useNavigate()
  const roomMatch = useMatch(routes.roomPattern)
  const roomId = roomMatch?.params.roomId ?? ''
  const roomName = useRoomName(roomId)
  const currentMember = useCurrentRoomMember(roomId)
  const isInRoom = Boolean(roomMatch)

  const navigateFromRoom = () => {
    navigate(user?.isAnonymous ? routes.signIn : routes.rooms, {
      replace: true,
    })
  }

  const handleRoomExitClick = () => {
    if (currentMember?.status === 'active') {
      setLeaveDialogOpen(true)
      return
    }
    navigateFromRoom()
  }

  const handleConfirmRoomExit = async () => {
    if (!roomId || currentMember?.role === 'owner') {
      setLeaveDialogOpen(false)
      navigateFromRoom()
      return
    }

    setLeavePending(true)
    try {
      await leaveRoom(roomId)
      setLeaveDialogOpen(false)
      navigateFromRoom()
    } catch (reason) {
      toast.error(
        reason instanceof Error
          ? reason.message
          : 'Не удалось покинуть комнату.',
      )
    } finally {
      setLeavePending(false)
    }
  }

  useEffect(() => {
    if (!isUserMenuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !userMenuContainerRef.current?.contains(event.target)
      ) {
        setIsUserMenuOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      setIsUserMenuOpen(false)
      userMenuTriggerRef.current?.focus()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isUserMenuOpen])

  return (
    <AppBar
      component="header"
      elevation={0}
      position="static"
      sx={{
        backgroundColor: '#2A2B47',
        borderBottomLeftRadius: '20px',
        borderBottomRightRadius: '20px',
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
        boxShadow: 'none',
        flexShrink: 0,
        height: { xs: 68, sm: 76, lg: 84 },
      }}
    >
      <Toolbar
        disableGutters
        sx={{
          height: '100%',
          justifyContent: 'space-between',
          minHeight: {
            xs: '68px !important',
            sm: '76px !important',
            lg: '84px !important',
          },
          padding: { xs: 1.25, sm: 1.5, lg: 2 },
        }}
      >
        <Box
          sx={{
            alignItems: 'center',
            display: 'flex',
            gap: { xs: 1.25, sm: 2, lg: 3 },
            minWidth: 0,
          }}
        >
          <Box
            alt="Логотип"
            component="img"
            src={logo}
            sx={{
              display: 'block',
              filter: 'brightness(0) invert(1)',
              flexShrink: 0,
              height: { xs: 34, sm: 42, lg: 52 },
              width: { xs: 109, sm: 135, lg: 167 },
            }}
          />
          {roomName && (
            <Typography
              component="h1"
              sx={{
                color: '#FFFFFF',
                fontSize: { xs: 18, sm: 24, lg: 32 },
                lineHeight: 1.2,
                marginBottom: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              variant="h1"
            >
              {roomName}
            </Typography>
          )}
        </Box>

        <Box
          sx={{
            alignItems: 'center',
            display: 'flex',
            flexShrink: 0,
            gap: { xs: 0.75, sm: 1.25, lg: 2 },
          }}
        >
          {isInRoom && (
            <Button
              color="inherit"
              onClick={handleRoomExitClick}
              sx={{
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  borderColor: '#FFFFFF',
                },
                borderColor: '#FFFFFF',
                borderRadius: '12px',
                borderWidth: '2px',
                color: '#FFFFFF',
                fontSize: { xs: 11, sm: 13, lg: 14 },
                height: { xs: 42, sm: 46, lg: 52 },
                minWidth: 0,
                paddingX: { xs: 1.25, sm: 2 },
                textTransform: 'uppercase',
                width: { xs: 'auto', md: 190, lg: 215 },
              }}
              variant="outlined"
            >
              <Box
                component="span"
                sx={{ display: { xs: 'none', sm: 'inline' } }}
              >
                {currentMember?.status === 'active'
                  ? 'Покинуть комнату'
                  : 'К комнатам'}
              </Box>
              <Box
                component="span"
                sx={{ display: { xs: 'inline', sm: 'none' } }}
              >
                Выйти
              </Box>
            </Button>
          )}

          <Box ref={userMenuContainerRef} sx={{ position: 'relative' }}>
            <IconButton
              aria-controls={isUserMenuOpen ? 'user-menu' : undefined}
              aria-expanded={isUserMenuOpen}
              aria-haspopup="menu"
              aria-label="Открыть меню пользователя"
              onClick={() => setIsUserMenuOpen(current => !current)}
              ref={userMenuTriggerRef}
              sx={{
                '&:hover': { backgroundColor: '#4A2B6D' },
                backgroundColor: '#32204B',
                border: '1px solid #6D4A8F',
                borderRadius: '8px',
                height: { xs: 42, sm: 46, lg: 52 },
                padding: 0,
                position: 'relative',
                width: { xs: 42, sm: 46, lg: 52 },
                zIndex: 20,
              }}
              type="button"
            >
              <Avatar
                alt={profile?.displayName || 'Пользователь'}
                src={profile?.photoURL ?? undefined}
                sx={{
                  backgroundColor: '#32204B',
                  borderRadius: '8px',
                  height: '100%',
                  width: '100%',
                }}
                variant="rounded"
              >
                <MemberIcon
                  sx={{
                    '& path': { fill: '#B88CFF' },
                    height: '22px',
                    width: '18px',
                  }}
                />
              </Avatar>
            </IconButton>

            <UserMenu
              onClose={() => setIsUserMenuOpen(false)}
              open={isUserMenuOpen}
            />
          </Box>
        </Box>
      </Toolbar>
      <LeaveRoomDialog
        onClose={() => setLeaveDialogOpen(false)}
        onConfirm={() => void handleConfirmRoomExit()}
        open={leaveDialogOpen}
        pending={leavePending}
        role={currentMember?.role}
      />
    </AppBar>
  )
}
