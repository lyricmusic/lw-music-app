import { useState } from 'react'

import logo from '@/assets/lw.svg'

import { UserInfo } from '@/components/UserInfo.tsx'
import { MemberIcon } from '@/components/icons/MemberIcon.tsx'

export function Header() {
  const [isOpenInfo, setIsOpenInfo] = useState(false)

  return (
    <div className="flex justify-between bg-[#ECEDF2] rounded-[20px] p-4">
      <div>
        <img alt="Логотип" src={logo} />
      </div>

      <div className="relative">
        <div
          className="relative z-20 flex items-center justify-center w-[52px] h-[52px] rounded-xl bg-brand-color cursor-pointer"
          onClick={() => setIsOpenInfo(!isOpenInfo)}
        >
          <MemberIcon className="fill-white" />
        </div>

        {isOpenInfo && <UserInfo />}
      </div>
    </div>
  )
}
