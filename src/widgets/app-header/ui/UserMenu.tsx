import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'

import { useState } from 'react'

import { useSession } from '@/entities/session'
import {
  getAuthErrorMessage,
  SaveAccountDialog,
  signOutCurrentUser,
} from '@/features/auth'
import { CharacterEditorDialog } from '@/features/edit-character'
import { routes } from '@/shared/config/routes'
import { LogoutIcon, MemberIcon } from '@/shared/ui/icons'
import { List, ListItem, ListItemButton } from '@mui/material'

export function UserMenu() {
  const navigate = useNavigate()
  const { profile, user } = useSession()
  const [saveAccountOpen, setSaveAccountOpen] = useState(false)
  const [characterEditorOpen, setCharacterEditorOpen] = useState(false)

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
      <div className="absolute -right-1 -top-1 z-10 w-[min(280px,calc(100vw-16px))] overflow-hidden rounded-2xl border border-[#4A2B6D] bg-[#24143D] text-[#F8F3FF] shadow-2xl">
        <div className="min-h-[58px] bg-[#32204B] py-3 pl-4 pr-14 sm:pl-5 sm:pr-[68px]">
          <p className="truncate font-medium">
            {profile?.displayName || user?.displayName || 'Не указан'}
          </p>
          <span className="block truncate text-xs text-[#CDBCE2]">
            {user?.email || 'Гостевой профиль'}
          </span>
        </div>

        <List>
          {user?.isAnonymous && (
            <ListItem disablePadding sx={{ borderTop: '1px solid #4A2B6D' }}>
              <ListItemButton onClick={() => setSaveAccountOpen(true)}>
                <MemberIcon
                  className="fill-light-brand mr-2"
                  sx={{ width: '16px' }}
                />
                <span className="text-nowrap py-4 text-[#E7DDF4]">
                  Сохранить профиль
                </span>
              </ListItemButton>
            </ListItem>
          )}
          <ListItem disablePadding sx={{ borderTop: '1px solid #4A2B6D' }}>
            <ListItemButton onClick={() => setCharacterEditorOpen(true)}>
              <MemberIcon
                className="fill-light-brand mr-2"
                sx={{ width: '16px' }}
              />
              <span className="text-nowrap py-4 text-[#E7DDF4]">
                Мой персонаж
              </span>
            </ListItemButton>
          </ListItem>
          <ListItem disablePadding sx={{ borderTop: '1px solid #4A2B6D' }}>
            <ListItemButton onClick={handleLogout}>
              <LogoutIcon
                className="fill-light-brand mr-2"
                sx={{ width: '16px' }}
              />
              <span className="py-4 text-[#E7DDF4]">Выйти</span>
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
      <CharacterEditorDialog
        onClose={() => setCharacterEditorOpen(false)}
        open={characterEditorOpen}
      />
    </>
  )
}
