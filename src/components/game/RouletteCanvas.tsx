/**
 * RouletteCanvas -- rueda giratoria en canvas + modos alternativos (cartas, slots, bomba).
 * Llama a onDone() cuando la animacion termina.
 */
import { useEffect, useRef, useCallback } from 'react'
import type { Member, GameMode } from '../../types'

interface Props {
  members: Member[]
  winner: Member
  gameMode: GameMode
  onDone: () => void
}

export function RouletteCanvas({ members, winner, gameMode, onDone }: Props) {
  // Estabilizar onDone en un ref para que cambios de referencia no reinicien efectos
  const onDoneRef = useRef(onDone)
  useEffect(() => { onDoneRef.current = onDone }, [onDone])
  const stableOnDone = useCallback(() => onDoneRef.current(), [])

  if (gameMode === 'cartas') return <CardsMode winner={winner} onDone={stableOnDone} />
  if (gameMode === 'slots')  return <SlotsMode  members={members} winner={winner} onDone={stableOnDone} />
  if (gameMode === 'bomba')  return <BombMode   members={members} winner={winner} onDone={stableOnDone} />
  return <RuletaMode members={members} winner={winner} onDone={stableOnDone} />
}

// ----------------------------------------------------------------
// Ruleta (canvas)
// ----------------------------------------------------------------

function RuletaMode({ members, winner, onDone }: { members: Member[]; winner: Member; onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const c2d = canvas.getContext('2d') as CanvasRenderingContext2D
    if (!c2d) return

    const n = members.length
    if (n === 0) { onDone(); return }

    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const W = canvas.width
    const H = canvas.height
    const cx = W / 2
    const cy = H / 2
    const r = Math.min(cx, cy) - 12

    const winnerIdx = members.findIndex(m => m.fbKey === winner.fbKey)
    const sliceAngle = (2 * Math.PI) / n

    const palette = [
      '#6c63ff','#ff6584','#43e97b','#f7971e','#4facfe',
      '#f093fb','#ffecd2','#a8edea','#fbc2eb','#d4fc79',
    ]

    const targetAngle = -Math.PI / 2 - sliceAngle * winnerIdx - sliceAngle / 2
    const totalRotation = Math.PI * 2 * 6 + targetAngle
    const duration = 4000
    const start = performance.now()

    function easeOut(t: number) {
      return 1 - Math.pow(1 - t, 4)
    }

    function drawWheel(angle: number) {
      c2d.clearRect(0, 0, W, H)

      members.forEach((m, i) => {
        const startA = angle + i * sliceAngle
        const endA = startA + sliceAngle
        const mid = startA + sliceAngle / 2

        c2d.beginPath()
        c2d.moveTo(cx, cy)
        c2d.arc(cx, cy, r, startA, endA)
        c2d.closePath()
        c2d.fillStyle = palette[i % palette.length]
        c2d.fill()
        c2d.strokeStyle = 'rgba(0,0,0,.15)'
        c2d.lineWidth = 1
        c2d.stroke()

        c2d.save()
        c2d.translate(cx, cy)
        c2d.rotate(mid)
        c2d.textAlign = 'right'
        c2d.fillStyle = '#fff'
        c2d.font = `bold ${Math.max(11, Math.min(16, 180 / n))}px sans-serif`
        c2d.shadowColor = 'rgba(0,0,0,.4)'
        c2d.shadowBlur = 3
        const label = m.name.length > 12 ? m.name.slice(0, 11) + '...' : m.name
        c2d.fillText(label, r - 10, 5)
        c2d.restore()
      })

      c2d.beginPath()
      c2d.arc(cx, cy, 20, 0, Math.PI * 2)
      c2d.fillStyle = '#fff'
      c2d.fill()
      c2d.strokeStyle = 'rgba(0,0,0,.2)'
      c2d.lineWidth = 2
      c2d.stroke()

      c2d.beginPath()
      c2d.moveTo(cx, cy - r - 4)
      c2d.lineTo(cx - 10, cy - r + 18)
      c2d.lineTo(cx + 10, cy - r + 18)
      c2d.closePath()
      c2d.fillStyle = '#fff'
      c2d.shadowColor = 'rgba(0,0,0,.5)'
      c2d.shadowBlur = 6
      c2d.fill()
      c2d.shadowBlur = 0
    }

    function tick(now: number) {
      const elapsed = now - start
      const t = Math.min(elapsed / duration, 1)
      const angle = easeOut(t) * totalRotation

      drawWheel(angle)

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        drawWheel(targetAngle + Math.PI * 2 * 6)
        timeoutId = setTimeout(onDone, 600)
      }
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // Dependencias vacias: la animacion corre una sola vez con los valores capturados al montar.
  // members, winner y onDone son estables en el snapshot del spin (ver GameTab).

  return (
    <div className="roulette-wrap">
      <canvas ref={canvasRef} width={320} height={320} className="roulette-canvas" />
      <div className="spinning-label">Sorteando…</div>
    </div>
  )
}

// ----------------------------------------------------------------
// Cartas
// ----------------------------------------------------------------

function CardsMode({ winner, onDone }: { winner: Member; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2200)
    return () => clearTimeout(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="cards-mode">
      <div className="card-flip">
        <div className="card-front">🃏</div>
        <div className="card-back" style={{ background: winner.color ?? '#6c63ff' }}>
          <div style={{ fontSize: 36 }}>{winner.emoji ?? '👤'}</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginTop: 8 }}>{winner.name}</div>
        </div>
      </div>
      <div className="spinning-label">Eligiendo…</div>
    </div>
  )
}

// ----------------------------------------------------------------
// Slots
// ----------------------------------------------------------------

function SlotsMode({ members, winner, onDone }: { members: Member[]; winner: Member; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500)
    return () => clearTimeout(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const reel = [...members, winner, ...members.slice(0, 3)]

  return (
    <div className="slots-mode">
      <div className="slots-reel-wrap">
        <div
          className="slots-reel"
          style={{ animationDuration: '2.2s' }}
        >
          {reel.map((m, i) => (
            <div key={`${m.fbKey}-${i}`} className="slots-item">
              <span style={{ fontSize: 28 }}>{m.emoji ?? '👤'}</span>
              <span style={{ fontSize: 12, fontWeight: 700 }}>{m.name}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="spinning-label">Girando…</div>
    </div>
  )
}

// ----------------------------------------------------------------
// Bomba
// ----------------------------------------------------------------

function BombMode({ members, winner, onDone }: { members: Member[]; winner: Member; onDone: () => void }) {
  const allWithWinner = members.filter(m => m.fbKey !== winner.fbKey)
  allWithWinner.push(winner)

  useEffect(() => {
    const total = allWithWinner.length * 400 + 800
    const t = setTimeout(onDone, total)
    return () => clearTimeout(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bomb-mode">
      <div style={{ fontSize: 72 }} className="bomb-emoji">💣</div>
      <div className="bomb-sequence">
        {allWithWinner.map((m, i) => (
          <div
            key={m.fbKey}
            className="bomb-name"
            style={{ animationDelay: `${i * 400}ms` }}
          >
            {m.name}
          </div>
        ))}
      </div>
      <div className="spinning-label">La bomba elige…</div>
    </div>
  )
}
