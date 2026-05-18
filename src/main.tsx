import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './app.css'
import { App } from './app/App'

const root = document.getElementById('root')
if (!root) throw new Error('No se encontró el elemento #root en el HTML.')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
