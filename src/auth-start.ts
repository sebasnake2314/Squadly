/**
 * Página intermedia para el flujo OAuth dentro del popup de Teams.
 * Teams abre esta página via authentication.authenticate({ url: '/auth-start.html' }).
 * 1ª carga: llama signInWithRedirect → navega al proveedor OAuth.
 * 2ª carga (de vuelta del OAuth): getRedirectResult persiste la sesión en
 *   localStorage compartido y llama notifySuccess → onAuthStateChanged dispara en la
 *   ventana principal.
 */
import { app as teamsApp, authentication } from '@microsoft/teams-js'
import { getRedirectResult, signInWithRedirect } from 'firebase/auth'
import { auth, microsoftProvider, provider as googleProvider } from './services/firebase'

async function main() {
  await teamsApp.initialize()

  const providerName = new URLSearchParams(window.location.search).get('provider') ?? 'microsoft'
  const authProvider = providerName === 'google' ? googleProvider : microsoftProvider

  let result = null
  try {
    result = await getRedirectResult(auth)
  } catch (err) {
    authentication.notifyFailure(err instanceof Error ? err.message : String(err))
    return
  }

  if (result?.user) {
    authentication.notifySuccess(result.user.uid)
    return
  }

  // Primera visita — redirigir al proveedor OAuth
  await signInWithRedirect(auth, authProvider)
}

main().catch(err => {
  try {
    authentication.notifyFailure(err instanceof Error ? err.message : String(err))
  } catch {
    // si el SDK de Teams también falla, ignorar
  }
})
