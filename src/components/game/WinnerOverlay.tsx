/**
 * WinnerOverlay -- muestra el ganador del sorteo y pide confirmacion.
 * Incluye animacion de confetti al aparecer.
 */
import { useEffect, useRef } from 'react'
import type { Member } from '../../types'

interface Props {
  winner: Member
  onConfirm: () => void
  onRevert: () => void
  saving: boolean
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  color: string
  angle: number
  spin: number
  size: number
  life: number
}

const COLORS = ['#6c63ff','#ff6584','#43e97b','#f7971e','#4facfe','#f093fb','#ffecd2','#fbc2eb']

function useConfetti(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D

    canvas.width  = canvas.offsetWidth
    canvas.height = canvas.offsetHeight

    const W = canvas.width
    const H = canvas.height

    // Lanzar particulas desde la parte superior
    const particles: Particle[] = Array.from({ length: 120 }, () => ({
      x: Math.random() * W,
      y: -10 - Math.random() * 40,
      vx: (Math.random() - 0.5) * 4,
      vy: 2 + Math.random() * 4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.2,
      size: 6 + Math.random() * 8,
      life: 1,
    }))

    function tick() {
      ctx.clearRect(0, 0, W, H)
      let alive = false

      for (const p of particles) {
        p.x  += p.vx
        p.y  += p.vy
        p.vy += 0.12        // gravedad
        p.vx *= 0.99        // resistencia
        p.angle += p.spin
        p.life -= 0.008

        if (p.life <= 0 || p.y > H + 20) continue
        alive = true

        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.angle)
        ctx.globalAlpha = Math.max(0, p.life)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
        ctx.restore()
      }

      if (alive) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [canvasRef])
}

export function WinnerOverlay({ winner, onConfirm, onRevert, saving }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useConfetti(canvasRef)

  return (
    <div className="winner-overlay">
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          pointerEvents: 'none', zIndex: 0,
        }}
      />
      <div className="winner-card" style={{ position: 'relative', zIndex: 1 }}>
        <div className="winner-label">Facilitador asignado</div>
        <div className="winner-avatar">
          {winner.image ? (
            <img src={winner.image} alt={winner.name} />
          ) : (
            <div
              className="winner-avatar-emoji"
              style={{ background: winner.color ?? '#6c63ff' }}
            >
              {winner.emoji ?? '👤'}
            </div>
          )}
        </div>
        <div className="winner-name">{winner.name}</div>
        <div className="winner-actions">
          <button className="btn-secondary" onClick={onRevert} disabled={saving}>
            Volver a sortear
          </button>
          <button className="btn-primary" onClick={onConfirm} disabled={saving}>
            {saving ? 'Guardando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}
