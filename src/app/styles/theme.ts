import { createTheme } from '@mui/material/styles'

export const appTheme = createTheme({
  components: {
    MuiAutocomplete: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            '& fieldset': { borderColor: '#6D4A8F' },
            '&:hover fieldset': { borderColor: '#B88CFF' },
            '&.Mui-focused fieldset': { borderColor: '#B88CFF' },
            backgroundColor: '#32204B',
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
            '&:hover': { backgroundColor: '#3B2158' },
            border: '2px solid #8F6CB5',
            color: '#F8F3FF',
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
          '&.Mui-focused': { backgroundColor: '#32204B' },
          '&:after, &:before, &:hover:not(.Mui-disabled):before': {
            borderBottom: 'none',
          },
          '&:hover': { backgroundColor: '#3B2756' },
          backgroundColor: '#32204B',
          border: 'none',
          borderRadius: '16px',
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: { '&.Mui-focused': { color: '#C9A7FF' }, color: '#CDBCE2' },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-notchedOutline': { borderColor: '#6D4A8F' },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: '#B88CFF',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#B88CFF',
          },
          backgroundColor: '#32204B',
          borderRadius: '14px',
          color: '#F8F3FF',
        },
      },
    },
    MuiList: {
      styleOverrides: { root: { paddingBottom: 0, paddingTop: 0 } },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          '&:hover': { backgroundColor: '#3B2158' },
          paddingBottom: 0,
          paddingLeft: '20px',
          paddingRight: '20px',
          paddingTop: 0,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: '#24143D',
          backgroundImage: 'none',
          border: '1px solid #4A2B6D',
          color: '#F8F3FF',
          margin: '16px',
          maxHeight: 'calc(100dvh - 32px)',
          width: 'calc(100% - 32px)',
        },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          flexWrap: 'wrap',
          gap: '8px',
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontSize: 'clamp(1.25rem, 5vw, 1.5rem)',
          overflowWrap: 'anywhere',
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundColor: '#24143D',
          backgroundImage: 'none',
          border: '1px solid #4A2B6D',
          color: '#F8F3FF',
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          lineHeight: 1.35,
          maxWidth: 'calc(100vw - 32px)',
          overflowWrap: 'anywhere',
          whiteSpace: 'normal',
        },
      },
    },
    MuiTypography: {
      styleOverrides: {
        h1: {
          fontFamily: 'Golos Text, sans-serif',
          fontSize: 'clamp(2rem, 8vw, 2.5rem)',
          fontWeight: 700,
          lineHeight: 1,
          marginBottom: 'clamp(18px, 5vw, 24px)',
        },
        h2: { fontFamily: 'Golos Text, sans-serif', fontWeight: 700 },
        h3: { fontFamily: 'Golos Text, sans-serif', fontWeight: 700 },
        h4: { fontFamily: 'Golos Text, sans-serif', fontWeight: 700 },
        h5: { fontFamily: 'Golos Text, sans-serif', fontWeight: 700 },
        h6: { fontFamily: 'Golos Text, sans-serif', fontWeight: 700 },
      },
    },
  },
  palette: {
    mode: 'dark',
    background: { default: '#12071F', paper: '#24143D' },
    error: { main: '#FF849A' },
    primary: {
      contrastText: '#FFF',
      dark: '#3031A5',
      light: '#8282E9',
      main: '#6F70E7',
    },
    text: { primary: '#F8F3FF', secondary: '#CDBCE2' },
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
