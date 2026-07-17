import SvgIcon, { SvgIconProps } from '@mui/material/SvgIcon'

export function YandexIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 28 28">
      <circle cx="14" cy="14" fill="#FC3F1D" r="14" />
      <text
        dominantBaseline="central"
        fill="#fff"
        fontFamily="Arial, sans-serif"
        fontSize="20"
        fontWeight="700"
        textAnchor="middle"
        x="14"
        y="14"
      >
        Я
      </text>
    </SvgIcon>
  )
}
