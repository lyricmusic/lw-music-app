import {
  TextField as MuiTextField,
  TextFieldProps as MuiTextFieldProps,
  styled,
} from '@mui/material'

export type TextFieldProps = Omit<MuiTextFieldProps, 'fullWidth' | 'variant'>

const StyledTextField = styled(MuiTextField)({
  '& .MuiFilledInput-input': {
    boxSizing: 'border-box',
    color: 'var(--color-auth-card)',
    fontSize: '16px',
    height: '52px',
    padding: '0 20px',
  },
  '& .MuiFilledInput-root': {
    '&.Mui-focused': {
      backgroundColor: 'var(--color-input-background)',
    },
    '&:hover': {
      backgroundColor: 'var(--color-input-background)',
    },
    backgroundColor: 'var(--color-input-background)',
    borderRadius: '12px',
    height: '52px',
    overflow: 'hidden',
  },
  '& .MuiFormHelperText-root': {
    margin: '4px 12px 0',
  },
  '& input::placeholder': {
    color: 'var(--color-input-placeholder)',
    opacity: 1,
  },
})

export function TextField(props: TextFieldProps) {
  return <StyledTextField {...props} fullWidth variant="filled" />
}
