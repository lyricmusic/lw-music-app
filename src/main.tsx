import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'

import { App } from '@/app/App'

import '@/app/styles/index.css'

const rootElement: HTMLElement = document.getElementById('root')!
const root = ReactDOM.createRoot(rootElement)
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
)
