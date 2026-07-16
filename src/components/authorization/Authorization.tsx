import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'

import logo from '@/assets/lw.svg'
import { getAuthErrorMessage, loginWithGoogle } from '@/services/auth'
import { Button, CircularProgress } from '@mui/material'

import { SignIn } from '@/components/authorization/SignIn.tsx'
import { SignUp } from '@/components/authorization/SignUp'
import { GoogleIcon } from '@/components/icons/GoogleIcon.tsx'

export function Authorization() {
  const location = useLocation()
  const navigate = useNavigate()
  const [googleLoading, setGoogleLoading] = useState(false)

  const handleGoogleLogin = async () => {
    setGoogleLoading(true)
    try {
      await loginWithGoogle()
      navigate('/rooms', { replace: true })
    } catch (error) {
      toast.error(getAuthErrorMessage(error))
    } finally {
      setGoogleLoading(false)
    }
  }

  return (
    <div className="w-[424px] px-10 py-[38px] bg-gray-block rounded-xl m-0.5 flex flex-col justify-between">
      <div>
        <img alt="Логотип" src={logo} />
      </div>
      {location.pathname === '/register' && <SignUp />}
      {location.pathname === '/' && <SignIn />}

      <Button
        disabled={googleLoading}
        onClick={handleGoogleLogin}
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
        {googleLoading ? (
          <CircularProgress color="inherit" size={22} />
        ) : (
          <>
            <GoogleIcon className="mr-3" />
            Войти через Google
          </>
        )}
      </Button>
    </div>
  )
}
