/**
 * Página intermedia para el flujo OAuth dentro del popup de Teams.
 * Teams abre esta página via authentication.authenticate({ url: '/auth-start.html' }).
 *
 * Microsoft (MSAL):
 *   MSAL redirige a Microsoft y vuelve a ESTA página — nunca pasa por
 *   firebaseapp.com/__/auth/handler, evitando el problema de window.opener.
 *   Al recibir el resultado, usamos signInWithCredential con el id_token de MSAL.
 *
 * Google (fallback):
 *   Firebase signInWithRedirect — vuelve a esta página via /__/auth/handler
 *   en modo redirect (sin opener), luego getRedirectResult.
 */
import { PublicClientApplication } from '@azure/msal-browser'
import { app as teamsApp, authentication } from '@microsoft/teams-js'
import {
  OAuthProvider,
  signInWithCredential,
  signInWithRedirect,
  getRedirectResult,
} from 'firebase/auth'
import { auth, provider as googleProvider } from './services/firebase'

const AZURE_CLIENT_ID = 'd07d0a4d-a31f-4108-b061-253e026d2e0f'
const REDIRECT_URI = `${window.location.origin}/auth-start.html`

async function handleMicrosoft() {
  const msalApp = new PublicClientApplication({
    auth: {
      clientId: AZURE_CLIENT_ID,
      authority: 'https://login.microsoftonline.com/common',
      redirectUri: REDIRECT_URI,
    },
    cache: { cacheLocation: 'sessionStorage' },
  })
  await msalApp.initialize()

  const result = await msalApp.handleRedirectPromise()

  if (result) {
    const credential = new OAuthProvider('microsoft.com').credential({
      idToken: result.idToken,
      accessToken: result.accessToken,
    })
    await signInWithCredential(auth, credential)
    authentication.notifySuccess('ok')
    return
  }

  // Primera visita — redirigir a Microsoft
  await msalApp.loginRedirect({ scopes: ['openid', 'profile', 'email'] })
}

async function handleGoogle() {
  const result = await getRedirectResult(auth)
  if (result?.user) {
    authentication.notifySuccess('ok')
    return
  }
  await signInWithRedirect(auth, googleProvider)
}

async function main() {
  await teamsApp.initialize()

  const providerName = new URLSearchParams(window.location.search).get('provider') ?? 'microsoft'

  if (providerName === 'microsoft') {
    await handleMicrosoft()
  } else {
    await handleGoogle()
  }
}

main().catch(err => {
  try {
    authentication.notifyFailure(err instanceof Error ? err.message : String(err))
  } catch { /* ignorar si el SDK de Teams también falla */ }
})
