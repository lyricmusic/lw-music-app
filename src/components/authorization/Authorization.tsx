import { useLocation } from 'react-router-dom'

import logo from '@/assets/lw.svg'
import { Button } from '@mui/material'

import { SignIn } from '@/components/authorization/SignIn.tsx'
import { SignUp } from '@/components/authorization/SignUp'
import { GoogleIcon } from '@/components/icons/GoogleIcon.tsx'

export function Authorization() {
  const location = useLocation()
  console.log('location', location)

  return (
    <div className="w-[424px] px-10 py-[38px] bg-gray-block rounded-xl m-0.5 flex flex-col justify-between">
      <div>
        <img alt="Логотип" src={logo} />
      </div>
      {/*<SignUp />*/}
      {location.pathname === '/register' && <SignUp />}
      {location.pathname === '/' && <SignIn />}

      <Button
        disabled={true}
        sx={{
          '&:active': {
            color: '#fff',
          },
          '&:hover': {
            backgroundColor: '#180022',
            borderColor: '#180022',
            color: '#fff',
          },
          backgroundColor: 'transparent',
          border: '1px solid #DFDDDF',
          color: '#180022',
        }}
        variant="outlined"
      >
        <GoogleIcon className="mr-3" />
        Войти через google
      </Button>
    </div>
  )
}
