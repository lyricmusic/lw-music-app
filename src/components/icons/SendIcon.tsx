import SvgIcon, { SvgIconProps } from '@mui/material/SvgIcon'

export function SendIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props}>
      <svg
        fill="none"
        // height="20"
        viewBox="0 0 20 20"
        // width="28"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M19.357 8.94L1.077.075C.514-.2-.106.32.018.966l1.26 6.547c.142.73.7 1.288 1.395 1.4l4.501.717c.4.064.4.673 0 .74l-4.501.717c-.696.112-1.253.67-1.395 1.4l-1.26 6.547c-.126.645.496 1.165 1.06.892l18.28-8.869c.857-.414.857-1.7 0-2.117z"></path>
      </svg>
    </SvgIcon>
  )
}
