import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'

import { store } from '@/store'
import ReactDOM from 'react-dom/client'

import { App } from './App'

import './index.css'

const rootElement: HTMLElement = document.getElementById('root')!
const root = ReactDOM.createRoot(rootElement)
const originalConsoleError = console.error;
console.error = (...args) => {
  if (args.some(arg => typeof arg === 'string' && arg.includes('Ya.Metrika2 is not a constructor'))) {
    // Если сообщение содержит указанную строку, не выводим его
    return;
  }
  originalConsoleError(...args);
};
root.render(
  <BrowserRouter>
    <Provider store={store}>
      <App />
    </Provider>
  </BrowserRouter>,
)
