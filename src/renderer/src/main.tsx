import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AutomationProvider } from './context/AutomationContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AutomationProvider>
      <App />
    </AutomationProvider>
  </React.StrictMode>
)

