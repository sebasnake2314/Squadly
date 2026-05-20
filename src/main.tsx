import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { app as teamsApp } from '@microsoft/teams-js'
import './app.css'
import { App } from './app/App'
import { isInTeams, handleRedirectResult } from './services/auth'

const root = document.getElementById('root')
if (!root) throw new Error('No se encontró el elemento #root en el HTML.')

;(async () => {
  if (isInTeams()) await teamsApp.initialize()
  await handleRedirectResult()

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})()
