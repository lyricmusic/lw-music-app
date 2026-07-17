import { createTheme } from '@mui/material/styles'

export const appTheme = createTheme({
  components: {
    MuiAutocomplete: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            '& fieldset': { border: 'none' },
            backgroundColor: '#fff',
            borderRadius: '16px',
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          '&.MuiButton-colorError.MuiButton-outlined': {
            '&.Mui-disabled': { opacity: 0.5 },
            '&:active': { boxShadow: 'none' },
            '&:hover': {
              backgroundColor: '#FF849A',
              boxShadow: 'none',
              color: 'white',
            },
            border: '2px solid #FF849A',
            color: '#FF849A',
          },
          '&.MuiButton-colorPrimary.MuiButton-contained': {
            '&.Mui-disabled': { opacity: 0.5 },
            '&:active': {
              '&:hover': { backgroundColor: '#7949C5' },
              backgroundColor: '#7949C5',
              boxShadow: 'none',
            },
            '&:hover': {
              backgroundColor: '#A46CFF',
              boxShadow: 'none',
            },
            backgroundColor: '#B79EFF',
            color: '#25263E',
            paddingBottom: '16px',
            paddingTop: '16px',
          },
          '&.MuiButton-colorPrimary.MuiButton-outlined': {
            border: '2px solid #3C2F4A',
            color: '#25263E',
          },
          '&.MuiButton-outlined': {
            fontSize: '14px',
            paddingBottom: '12px',
            paddingTop: '12px',
          },
          borderRadius: '16px',
          boxShadow: 'none',
          fontFamily: 'inherit',
          lineHeight: '20px',
        },
      },
    },
    MuiFilledInput: {
      styleOverrides: {
        root: {
          '&.Mui-focused': { backgroundColor: '#fff' },
          '&:after, &:before, &:hover:not(.Mui-disabled):before': {
            borderBottom: 'none',
          },
          '&:hover': { backgroundColor: '#fff' },
          backgroundColor: '#fff',
          border: 'none',
          borderRadius: '16px',
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: { '&.Mui-focused': { color: '#8B8DB3' } },
      },
    },
    MuiList: {
      styleOverrides: { root: { paddingBottom: 0, paddingTop: 0 } },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          '&:hover': { backgroundColor: '#E9E2FF' },
          paddingBottom: 0,
          paddingLeft: '20px',
          paddingRight: '20px',
          paddingTop: 0,
        },
      },
    },
  },
  palette: { error: { main: '#FF849A' } },
  typography: {
    fontFamily: [
      '-apple-system',
      'BlinkMacSystemFont',
      'Golos Text',
      'Arial',
      'sans-serif',
      'Apple Color Emoji',
      'Segoe UI Emoji',
      'Segoe UI Symbol',
    ].join(','),
  },
})
