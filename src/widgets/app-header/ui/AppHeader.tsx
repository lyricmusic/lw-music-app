import { useState } from 'react'
import { useMatch, useNavigate } from 'react-router-dom'

import logo from '@assets/lw.svg'

import { useRoomName } from '@/entities/room'
import { routes } from '@/shared/config/routes'
import { MemberIcon } from '@/shared/ui/icons'
import {
  AppBar,
  Box,
  Button,
  IconButton,
  Toolbar,
  Typography,
} from '@mui/material'

import { UserMenu } from './UserMenu'
// TODO тест удалить
export function AppHeader() {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const navigate = useNavigate()
  const roomMatch = useMatch(routes.roomPattern)
  const roomName = useRoomName(roomMatch?.params.roomId)
  const isInRoom = Boolean(roomMatch)

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
        height: '84px',
      }}
    >
      <Toolbar
        disableGutters
        sx={{
          height: '100%',
          justifyContent: 'space-between',
          minHeight: '84px !important',
          padding: 2,
        }}
      >
        <Box
          sx={{
            alignItems: 'center',
            display: 'flex',
            gap: 3,
            minWidth: 0,
          }}
        >
          <Box
            alt="Логотип"
            component="img"
            src={logo}
            sx={{
              display: 'block',
              flexShrink: 0,
              height: '52px',
              width: '167px',
            }}
          />
          {roomName && (
            <Typography
              component="h1"
              sx={{
                color: '#FFFFFF',
                fontSize: '32px',
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

        <Box sx={{ alignItems: 'center', display: 'flex', flexShrink: 0, gap: 2 }}>
          {isInRoom && (
            <Button
              color="inherit"
              onClick={() => navigate(routes.rooms)}
              sx={{
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  borderColor: '#FFFFFF',
                },
                borderColor: '#FFFFFF',
                borderRadius: '12px',
                borderWidth: '2px',
                color: '#FFFFFF',
                height: '52px',
                textTransform: 'uppercase',
                width: '215px',
              }}
              variant="outlined"
            >
              Покинуть комнату
            </Button>
          )}

          <Box sx={{ position: 'relative' }}>
            <IconButton
              aria-expanded={isUserMenuOpen}
              aria-haspopup="menu"
              aria-label="Открыть меню пользователя"
              onClick={() => setIsUserMenuOpen(current => !current)}
              sx={{
                '&:hover': { backgroundColor: '#FFFFFF' },
                backgroundColor: '#FFFFFF',
                borderRadius: '8px',
                height: '52px',
                padding: 0,
                position: 'relative',
                width: '52px',
                zIndex: 20,
              }}
              type="button"
            >
              <MemberIcon
                sx={{
                  '& path': { fill: '#6F70E7' },
                  height: '22px',
                  width: '18px',
                }}
              />
            </IconButton>

            {isUserMenuOpen && <UserMenu />}
          </Box>
        </Box>
      </Toolbar>
    </AppBar>
  )
}
