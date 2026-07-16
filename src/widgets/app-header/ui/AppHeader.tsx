import { useState } from 'react'

import logo from '@/assets/lw.svg'

import { MemberIcon } from '@/shared/ui/icons'

import { UserMenu } from './UserMenu'

export function AppHeader() {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)

  return (
    <header className="flex justify-between rounded-[20px] bg-[#ECEDF2] p-4">
      <div>
        <img alt="Логотип" src={logo} />
      </div>

      <div className="relative">
        <button
          aria-expanded={isUserMenuOpen}
          aria-label="Открыть меню пользователя"
          className="relative z-20 flex items-center justify-center w-[52px] h-[52px] rounded-xl bg-brand-color cursor-pointer"
          onClick={() => setIsUserMenuOpen(current => !current)}
          type="button"
        >
          <MemberIcon className="fill-white" />
        </button>

        {isUserMenuOpen && <UserMenu />}
      </div>
    </header>
  )
}
