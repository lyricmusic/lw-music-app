import SvgIcon, { SvgIconProps } from '@mui/material/SvgIcon'

export function LogoutIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props}>
      <svg
        fill="none"
        // height="20"
        viewBox="0 0 16 16"
        // width="28"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          clipRule="evenodd"
          d="M5.878.022L.31 1.606a.428.428 0 00-.31.41H0v12.236c0 .21.152.385.351.42l5.566 1.317a.427.427 0 00.523-.416v-.588h6.905a.732.732 0 00.732-.732v-3.174a.734.734 0 00-1.466 0v2.44h-6.17L6.443 2.75h6.17v2.472c0 .403.33.732.733.732.403 0 .732-.329.732-.732V2.017a.732.732 0 00-.732-.732H6.442V.428a.428.428 0 00-.564-.406zm9.694 9.531L11.3 9.552v1.103c0 .354-.42.572-.715.316L7.567 8.479a.428.428 0 01.01-.666l3.02-2.526a.427.427 0 01.701.328v1.134h4.274c.236 0 .426.19.426.425L16 9.126a.428.428 0 01-.428.428z"
          fillRule="evenodd"
        ></path>
      </svg>
    </SvgIcon>
  )
}
