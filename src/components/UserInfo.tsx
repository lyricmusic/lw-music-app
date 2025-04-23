import { useNavigate } from 'react-router-dom'

import { auth } from '@/firebase'
import { useAppSelector } from '@/store'
import { List, ListItem, ListItemButton } from '@mui/material'
import { signOut } from 'firebase/auth'

import { LogoutIcon } from '@/components/icons/LogoutIcon.tsx'
import { MemberIcon } from '@/components/icons/MemberIcon.tsx'

export function UserInfo() {
  const navigate = useNavigate()
  const user = useAppSelector(state => state.user)
  console.log('user', user)

  const handleLogout = async () => {
    try {
      await signOut(auth)
      navigate('/')
      console.log('User signed out')
    } catch (error) {
      console.error('Error signing out: ', error)
    }
  }

  return (
    <div className="absolute z-10 -top-1 -right-1 min-w-[208px] bg-white rounded-2xl overflow-hidden border border-[#D6D7F0]">
      <div className="h-[60px] py-3 pl-5 pr-[68px] bg-hover-brand">
        <p>{user?.login || 'Не указан'}</p>
        <span>{user?.email}</span>
      </div>

      <List>
        <ListItem disablePadding sx={{ borderTop: '1px solid #D6D7F0' }}>
          <ListItemButton>
            <MemberIcon
              className="fill-light-brand mr-2"
              sx={{ width: '16px' }}
            />
            <span className="py-4 text-secondary-text text-nowrap">
              Открыть профиль
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
  )
}
