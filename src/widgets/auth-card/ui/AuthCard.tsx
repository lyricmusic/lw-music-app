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
      className="flex min-h-dvh w-full max-w-[440px] flex-col justify-between gap-8 overflow-y-auto bg-auth-card px-5 py-6 text-white sm:m-3 sm:min-h-[calc(100dvh-24px)] sm:w-[424px] sm:rounded-[20px] sm:px-8 sm:py-8 md:px-10 md:py-[38px]"
      style={{ backgroundColor: 'var(--color-auth-card, #2A2B47)' }}
    >
      <div className="relative h-[42px] w-[135px] sm:h-[52px] sm:w-[167px]">
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
            <YandexIcon className="mr-2 shrink-0 sm:mr-3" />
            <span className="text-xs sm:text-sm">
              {mode === 'sign-in'
                ? 'Войти через Яндекс'
                : 'Зарегистрироваться через Яндекс'}
            </span>
          </>
        )}
      </Button>
    </div>
  )
}
