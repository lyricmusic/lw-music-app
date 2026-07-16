import {
  Button as MuiButton,
  type ButtonProps as MuiButtonProps,
  styled,
} from '@mui/material'

export type ButtonProps = MuiButtonProps

const StyledButton = styled(MuiButton)({
  borderRadius: '12px',
  boxShadow: 'none',
  fontFamily: 'inherit',
  textTransform: 'none',
})

export function Button(props: ButtonProps) {
  return <StyledButton disableElevation {...props} />
}
