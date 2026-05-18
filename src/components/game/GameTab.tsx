/**
 * GameTab -- tab de Sorteo completo.
 * Muestra estado actual, boton de sortear, animacion y confirmacion del ganador.
 */
import { useReducer, useCallback } from 'react'
import { pickRandomWinner, saveWinner, setSpinningState } from '../../services/game'
import { startMusic, stopMusic } from '../../services/music'
import { getEligible, getTodayFacilitator, canCurrentUserSpin } from '../../services/status'
import { getRoomMinParticipants } from '../../utils/dates'
import { WinnerOverlay } from './WinnerOverlay'
import { RouletteCanvas } from './RouletteCanvas'
import type { Member } from '../../types'
import type { RoomContext } from '../../services/status'

type SpinPhase = 'idle' | 'spinning' | 'done'

type SpinState = {
  phase: SpinPhase
  winner: Member | null
  spinMembers: Member[]
  saving: boolean
  error: string | null
}

type SpinAction =
  | { type: 'START'; winner: Member; spinMembers: Member[] }
  | { type: 'ANIMATION_DONE' }
  | { type: 'CONFIRM_START' }
  | { type: 'CONFIRM_OK' }
  | { type: 'ERROR'; message: string }
  | { type: 'REVERT' }

function spinReducer(state: SpinState, action: SpinAction): SpinState {
  switch (action.type) {
    case 'START':
      return { ...state, phase: 'spinning', winner: action.winner, spinMembers: action.spinMembers, error: null }
    case 'ANIMATION_DONE':
      return { ...state, phase: 'done' }
    case 'CONFIRM_START':
      return { ...state, saving: true }
    case 'CONFIRM_OK':
      return { phase: 'idle', winner: null, spinMembers: [], saving: false, error: null }
    case 'ERROR':
      return { ...state, saving: false, error: action.message }
    case 'REVERT':
      return { phase: 'idle', winner: null, spinMembers: [], saving: false, error: null }
    default:
      return state
  }
}

interface Props {
  ctx: RoomContext
  roomId: string
  isAdmin: boolean
}

export function GameTab({ ctx, roomId, isAdmin }: Props) {
  const [state, dispatch] = useReducer(spinReducer, {
    phase: 'idle',
    winner: null,
    spinMembers: [],
    saving: false,
    error: null,
  })

  const eligible = getEligible(ctx, null)
  const todayFacilitator = getTodayFacilitator(ctx)
  const canSpin = canCurrentUserSpin(ctx)
  const minPart = getRoomMinParticipants(ctx.room.minParticipants)
  const gameMode = ctx.room.gameMode ?? 'ruleta'
  const isConvocatoria = ctx.room.type === 'convocatoria'

  const handleSpin = useCallback(async () => {
    if (eligible.length < minPart) {
      dispatch({ type: 'ERROR', message: `Se necesitan al menos ${minPart} participantes elegibles para sortear.` })
      return
    }
    const picked = pickRandomWinner(eligible)
    if (!picked) return
    dispatch({ type: 'START', winner: picked, spinMembers: [...eligible] })
    await setSpinningState(roomId, true)
    startMusic(ctx.room.musicType ?? 'none')
  }, [eligible, minPart, roomId, ctx.room.musicType])

  const handleAnimationDone = useCallback(() => {
    stopMusic()
    dispatch({ type: 'ANIMATION_DONE' })
    setSpinningState(roomId, false)
  }, [roomId])

  const handleConfirm = async () => {
    if (!state.winner) return
    dispatch({ type: 'CONFIRM_START' })
    try {
      await saveWinner({
        roomId,
        room: ctx.room,
        winner: state.winner,
        gameMode,
        history: ctx.history,
      })
      dispatch({ type: 'CONFIRM_OK' })
    } catch {
      dispatch({ type: 'ERROR', message: 'No se pudo guardar el resultado.' })
    }
  }

  const handleRevert = async () => {
    stopMusic()
    dispatch({ type: 'REVERT' })
    await setSpinningState(roomId, false)
  }

  return (
    <div className="game-tab">
      {/* Estado actual */}
      {todayFacilitator && state.phase === 'idle' && (
        <div className="today-facilitator">
          <div className="today-facilitator-label">{isConvocatoria ? 'Convocado hoy' : 'Facilita hoy'}</div>
          <div className="today-facilitator-name">
            <span style={{ fontSize: 22 }}>{todayFacilitator.emoji ?? '👤'}</span>
            {todayFacilitator.name}
          </div>
        </div>
      )}

      {/* Animacion */}
      {state.phase === 'spinning' && state.winner && (
        <RouletteCanvas
          members={state.spinMembers}
          winner={state.winner}
          gameMode={gameMode}
          onDone={handleAnimationDone}
        />
      )}

      {/* Confirmacion del ganador */}
      {state.phase === 'done' && state.winner && (
        <WinnerOverlay
          winner={state.winner}
          onConfirm={handleConfirm}
          onRevert={handleRevert}
          saving={state.saving}
        />
      )}

      {/* Boton de sortear (solo en idle) */}
      {state.phase === 'idle' && (
        <div className="spin-area">
          <div className="eligible-info">
            <span className="eligible-count">{eligible.length}</span>
            <span className="eligible-label">
              {eligible.length === 1 ? 'participante elegible' : 'participantes elegibles'}
            </span>
          </div>

          {eligible.length > 0 && (
            <div className="eligible-list">
              {eligible.slice(0, 8).map(m => (
                <div key={m.fbKey} className="eligible-chip">
                  <span>{m.emoji ?? '👤'}</span>
                  <span>{m.name}</span>
                </div>
              ))}
              {eligible.length > 8 && (
                <div className="eligible-chip eligible-chip--more">
                  +{eligible.length - 8} mas
                </div>
              )}
            </div>
          )}

          {state.error && <div className="form-error" style={{ marginTop: 12 }}>{state.error}</div>}

          {canSpin && !todayFacilitator && (
            <button
              className="spin-btn"
              onClick={handleSpin}
              disabled={eligible.length < minPart}
            >
              {isConvocatoria ? 'Convocar' : 'Sortear'}
            </button>
          )}

          {todayFacilitator && isAdmin && (
            <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', marginTop: 12 }}>
              {isConvocatoria ? 'La convocatoria de hoy ya esta confirmada.' : 'El sorteo de hoy ya esta confirmado.'} Podes revertirlo desde el Historial.
            </div>
          )}

          {!canSpin && !isAdmin && (
            <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', marginTop: 12 }}>
              Solo el admin o el facilitador actual pueden sortear.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
