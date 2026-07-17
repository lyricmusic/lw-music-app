import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'

import {
  SignInForm,
  SignUpForm,
  getAuthDestination,
  getAuthErrorMessage,
  signInWithYandex,
} from '@/features/auth'
import { YandexIcon } from '@/shared/ui/icons'
import { Button, CircularProgress } from '@mui/material'
import logo from '@assets/lw.svg'

interface AuthCardProps {
  mode: 'sign-in' | 'sign-up'
}

export function AuthCard({ mode }: AuthCardProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const [yandexLoading, setYandexLoading] = useState(false)

  const handleYandexLogin = async () => {
    setYandexLoading(true)
    try {
      await signInWithYandex()
      navigate(getAuthDestination(location.state), { replace: true })
    } catch (error) {
      toast.error(getAuthErrorMessage(error))
    } finally {
      setYandexLoading(false)
    }
  }

  return (
    <div
      className="m-0.5 flex w-[calc(100%-0.25rem)] max-w-[424px] flex-col justify-between rounded-[20px] bg-auth-card px-6 py-8 text-white min-[480px]:w-[424px] min-[480px]:px-10 min-[480px]:py-[38px]"
      style={{ backgroundColor: 'var(--color-auth-card, #2A2B47)' }}
    >
      <div className="relative h-[52px] w-[167px]">
        <img className="brightness-0 invert" alt="Логотип" src={logo} />
        <span
          aria-hidden="true"
          className="absolute bottom-[9.5px] right-[10.5px] h-2 w-2 rounded-full bg-accent"
        />
      </div>
      {mode === 'sign-in' ? <SignInForm /> : <SignUpForm />}

      <Button
        disabled={yandexLoading}
        onClick={handleYandexLogin}
        sx={{
          '&.MuiButton-colorPrimary.MuiButton-outlined': {
            '&:active, &:active:hover': {
              backgroundColor: 'var(--color-auth-provider-background-pressed)',
              borderColor: 'var(--color-auth-provider-border)',
              color: 'var(--color-auth-card)',
            },
            '&:hover': {
              backgroundColor: 'var(--color-auth-provider-background-hover)',
              borderColor: 'var(--color-auth-provider-border)',
              color: 'var(--color-auth-card)',
            },
            backgroundColor: 'var(--color-auth-provider-background-default)',
            border: '2px solid var(--color-auth-provider-border)',
            color: 'var(--color-auth-text)',
          },
          borderRadius: '12px',
          height: '52px',
          padding: 0,
          textTransform: 'uppercase',
        }}
        variant="outlined"
      >
        {yandexLoading ? (
          <CircularProgress color="inherit" size={22} />
        ) : (
          <>
            <YandexIcon className="mr-3" />
            {mode === 'sign-in'
              ? 'Войти через Яндекс'
              : 'Зарегистрироваться через Яндекс'}
          </>
        )}
      </Button>
    </div>
  )
}
