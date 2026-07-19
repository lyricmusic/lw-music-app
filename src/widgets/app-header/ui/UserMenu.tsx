import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'

import { useState } from 'react'

import { useSession } from '@/entities/session'
import {
  getAuthErrorMessage,
  SaveAccountDialog,
  signOutCurrentUser,
} from '@/features/auth'
import { routes } from '@/shared/config/routes'
import { LogoutIcon, MemberIcon } from '@/shared/ui/icons'
import { List, ListItem, ListItemButton } from '@mui/material'

export function UserMenu() {
  const navigate = useNavigate()
  const { profile, user } = useSession()
  const [saveAccountOpen, setSaveAccountOpen] = useState(false)

  const handleLogout = async () => {
    try {
      await signOutCurrentUser()
      navigate(routes.signIn, { replace: true })
    } catch (error) {
      toast.error(getAuthErrorMessage(error))
    }
  }

  return (
    <>
      <div className="absolute z-10 -top-1 -right-1 min-w-[208px] bg-white rounded-2xl overflow-hidden border border-[#D6D7F0]">
        <div className="h-[60px] py-3 pl-5 pr-[68px] bg-hover-brand">
          <p>{profile?.displayName || user?.displayName || 'Не указан'}</p>
          <span>{user?.email}</span>
        </div>

        <List>
          <ListItem disablePadding sx={{ borderTop: '1px solid #D6D7F0' }}>
            <ListItemButton
              onClick={
                user?.isAnonymous ? () => setSaveAccountOpen(true) : undefined
              }
            >
              <MemberIcon
                className="fill-light-brand mr-2"
                sx={{ width: '16px' }}
              />
              <span className="py-4 text-secondary-text text-nowrap">
                {user?.isAnonymous ? 'Сохранить профиль' : 'Открыть профиль'}
              </span>
            </ListItemButton>
          </ListItem>
          <ListItem disablePadding sx={{ borderTop: '1px solid #D6D7F0' }}>
            <ListItemButton onClick={handleLogout}>
              <LogoutIcon
                className="fill-light-brand mr-2"
                sx={{ width: '16px' }}
              />
              <span className="py-4 text-secondary-text">Выйти</span>
            </ListItemButton>
          </ListItem>
        </List>
      </div>
      {user?.isAnonymous && (
        <SaveAccountDialog
          onClose={() => setSaveAccountOpen(false)}
          open={saveAccountOpen}
        />
      )}
    </>
  )
}
