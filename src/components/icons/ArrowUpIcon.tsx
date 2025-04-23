import SvgIcon, { SvgIconProps } from '@mui/material/SvgIcon'

export function ArrowUpIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props}>
      <svg
        fill="none"
        // height="28"
        viewBox="0 0 16 10"
        // width="28"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          clipRule="evenodd"
          d="M.42 9.554a1.38 1.38 0 002.031 0L8 3.674l5.549 5.88a1.38 1.38 0 002.03 0c.561-.594.561-1.557 0-2.152L9.015.446a1.38 1.38 0 00-2.03 0L.42 7.402a1.587 1.587 0 000 2.152z"
          fillRule="evenodd"
        ></path>
      </svg>
    </SvgIcon>
  )
}
