import SvgIcon, { SvgIconProps } from '@mui/material/SvgIcon'

export function GoogleIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props}>
      <svg
        fill="none"
        height="28"
        viewBox="0 0 28 28"
        width="28"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g clipPath="url(#clip0_78_80)">
          <path
            d="M27.72 14.318c0-.993-.09-1.947-.255-2.864H14.28v5.422h7.535c-.331 1.744-1.324 3.22-2.813 4.213v3.525h4.544c2.647-2.444 4.174-6.033 4.174-10.296z"
            fill="#4285F4"
          ></path>
          <path
            d="M14.28 28c3.78 0 6.95-1.247 9.266-3.386l-4.544-3.525c-1.247.84-2.838 1.35-4.722 1.35-3.64 0-6.733-2.457-7.84-5.766H1.782v3.614C4.086 24.857 8.807 28 14.28 28z"
            fill="#34A853"
          ></path>
          <path
            d="M6.44 16.66A8.39 8.39 0 015.995 14c0-.93.165-1.82.445-2.66V7.724H1.782A13.827 13.827 0 00.28 13.999c0 2.266.547 4.391 1.502 6.275l3.627-2.826 1.031-.789z"
            fill="#FBBC05"
          ></path>
          <path
            d="M14.28 5.575c2.062 0 3.895.712 5.358 2.087l4.01-4.01C21.216 1.388 18.06 0 14.28 0 8.807 0 4.086 3.144 1.782 7.725L6.44 11.34c1.107-3.31 4.2-5.765 7.84-5.765z"
            fill="#EA4335"
          ></path>
        </g>
        <defs>
          <clipPath id="clip0_78_80">
            <path d="M0 0H28V28H0z" fill="#fff"></path>
          </clipPath>
        </defs>
      </svg>
    </SvgIcon>
  )
}
