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
            '&.Mui-disabled': {
              backgroundColor: 'var(--color-primary-background-disabled)',
              color: 'var(--color-primary-text-disabled)',
              opacity: 1,
            },
            '&:hover': {
              backgroundColor: 'var(--color-primary-background-hover)',
              boxShadow: 'none',
              color: 'var(--color-primary-text-hover)',
            },
            '&:active, &:active:hover': {
              backgroundColor: 'var(--color-primary-background-pressed)',
              boxShadow: 'none',
              color: 'var(--color-primary-text-pressed)',
            },
            backgroundColor: 'var(--color-primary-background-default)',
            color: 'var(--color-primary-text-default)',
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
          fontFamily: 'Golos Text Medium, sans-serif',
          fontSize: '14px',
          fontWeight: 500,
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
  palette: {
    error: { main: '#FF849A' },
    primary: {
      contrastText: '#FFF',
      dark: '#3031A5',
      light: '#8282E9',
      main: '#6F70E7',
    },
  },
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
