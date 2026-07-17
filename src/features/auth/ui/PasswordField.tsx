import { forwardRef, useState } from 'react'

import { TextField, TextFieldProps } from '@/shared/ui/text-field'
import { IconButton, InputAdornment } from '@mui/material'

type PasswordFieldProps = Omit<TextFieldProps, 'type'>

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField(props, ref) {
    const [isPasswordVisible, setIsPasswordVisible] = useState(false)

    return (
      <TextField
        {...props}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                aria-label={
                  isPasswordVisible ? 'Скрыть пароль' : 'Показать пароль'
                }
                edge="end"
                onClick={() => setIsPasswordVisible(value => !value)}
                onMouseDown={event => event.preventDefault()}
                sx={{ color: 'var(--color-input-placeholder)', mr: 0.5 }}
                type="button"
              >
                {isPasswordVisible ? <EyeOffIcon /> : <EyeIcon />}
              </IconButton>
            </InputAdornment>
          ),
        }}
        inputRef={ref}
        type={isPasswordVisible ? 'text' : 'password'}
      />
    )
  },
)

function EyeIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="22"
      viewBox="0 0 24 24"
      width="22"
    >
      <path
        d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <circle
        cx="12"
        cy="12"
        r="2.75"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="22"
      viewBox="0 0 24 24"
      width="22"
    >
      <path
        d="M9.9 5.2A10.7 10.7 0 0 1 12 5c6 0 9.5 7 9.5 7a16.8 16.8 0 0 1-2.3 3.1M6.1 6.1C3.8 7.8 2.5 12 2.5 12s3.5 7 9.5 7c1.7 0 3.2-.6 4.5-1.4M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}
