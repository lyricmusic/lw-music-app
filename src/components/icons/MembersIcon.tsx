import SvgIcon, { SvgIconProps } from '@mui/material/SvgIcon'

export function MembersIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props}>
      <svg
        fill="none"
        // height="20"
        viewBox="0 0 28 20"
        // width="28"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          clipRule="evenodd"
          d="M15.636 4.286c0-1.137.46-2.227 1.278-3.03A4.405 4.405 0 0120 0c1.157 0 2.267.452 3.086 1.255a4.247 4.247 0 011.278 3.03c0 1.137-.46 2.227-1.278 3.031A4.405 4.405 0 0120 8.571a4.405 4.405 0 01-3.086-1.255 4.247 4.247 0 01-1.278-3.03zM12 17.719a7.79 7.79 0 012.387-5.477A8.077 8.077 0 0120 9.984c2.1 0 4.116.811 5.613 2.258A7.79 7.79 0 0128 17.72a.705.705 0 01-.112.393.724.724 0 01-.312.269A18.399 18.399 0 0120 20c-2.702 0-5.269-.58-7.576-1.62a.724.724 0 01-.312-.268.705.705 0 01-.112-.393z"
          fill="#3A3055"
          fillRule="evenodd"
        ></path>
        <path
          d="M8.883 12c1.161 0 2.198.072 3.117.202-1.369 1.296-2.228 3.975-2.228 5.798v.04c-3.633.057-7.386-.232-9.772-.865C0 15.11 2.665 12 8.883 12zM14 5.5a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"
          fill="#3A3055"
        ></path>
      </svg>
    </SvgIcon>
  )
}
