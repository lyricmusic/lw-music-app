import { useState } from 'react'
import { useMatch } from 'react-router-dom'

import logo from '@assets/lw.svg'

import { useRoomName } from '@/entities/room'
import { routes } from '@/shared/config/routes'
import { MemberIcon } from '@/shared/ui/icons'
import { AppBar, Box, IconButton, Toolbar, Typography } from '@mui/material'

import { UserMenu } from './UserMenu'
// TODO тест удалить
export function AppHeader() {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const roomMatch = useMatch(routes.roomPattern)
  const roomName = useRoomName(roomMatch?.params.roomId)

  return (
    <AppBar
      component="header"
      elevation={0}
      position="static"
      sx={{
        backgroundColor: '#2A2B47',
        borderRadius: '0 0 20px 20px',
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

        <Box sx={{ flexShrink: 0, position: 'relative' }}>
          <IconButton
            aria-expanded={isUserMenuOpen}
            aria-haspopup="menu"
            aria-label="Открыть меню пользователя"
            onClick={() => setIsUserMenuOpen(current => !current)}
            sx={{
              '&:hover': { backgroundColor: '#25263E' },
              backgroundColor: '#25263E',
              borderRadius: '12px',
              height: '52px',
              padding: 0,
              position: 'relative',
              width: '52px',
              zIndex: 20,
            }}
            type="button"
          >
            <MemberIcon sx={{ color: '#FFFFFF' }} />
          </IconButton>

          {isUserMenuOpen && <UserMenu />}
        </Box>
      </Toolbar>
    </AppBar>
  )
}
