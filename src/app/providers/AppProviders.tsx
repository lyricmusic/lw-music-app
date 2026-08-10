import type { ReactNode } from 'react'
import { BrowserRouter } from 'react-router'
import { ToastContainer, Zoom } from 'react-toastify'

import { SessionProvider } from '@/entities/session'
import { GlobalStyles, ThemeProvider } from '@mui/material'

import { appTheme } from '../styles/theme'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider theme={appTheme}>
      <GlobalStyles
        styles={{ body: { backgroundColor: '#3F3F59', color: '#25263E' } }}
      />
      <ToastContainer
        autoClose={5000}
        closeOnClick
        draggable
        newestOnTop={false}
        pauseOnFocusLoss
        pauseOnHover
        position="top-right"
        theme="light"
        transition={Zoom}
      />
      <SessionProvider>
        <BrowserRouter>{children}</BrowserRouter>
      </SessionProvider>
    </ThemeProvider>
  )
}
