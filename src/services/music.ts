/**
 * Motor de música de fondo sintetizada con Web Audio API.
 * Cuatro temas: circus, 8bit, gameshow, hype.
 * Sin dependencias externas — todo sintetizado en tiempo real.
 */

export type MusicType = 'none' | 'circus' | '8bit' | 'gameshow' | 'hype'

let ctx: AudioContext | null = null
let gainNode: GainNode | null = null
let playing = false
let stopHandle: { stop: () => void } | null = null

export function startMusic(type: MusicType): void {
  stopMusic()
  if (!type || type === 'none') return

  ctx = new AudioContext()
  gainNode = ctx.createGain()
  gainNode.gain.value = 0.25
  gainNode.connect(ctx.destination)
  playing = true

  const themes: Record<string, () => void> = { circus, '8bit': bit8, gameshow, hype }
  themes[type]?.()
}

export function stopMusic(): void {
  playing = false
  stopHandle?.stop()
  stopHandle = null
  try { ctx?.close() } catch { /* ignore */ }
  ctx = null
  gainNode = null
}

// ── Circus ──────────────────────────────────────────────────────────────────

function circus(): void {
  const c = ctx!, g = gainNode!
  const melody = [523,659,784,1047,784,659,523,659,784,659,523,784,1047,784,659,523]
  const bass   = [130,130,196,196,130,130,196,196,130,130,196,196,130,130,196,196]
  const dur = 0.22
  const loop = () => {
    if (!playing) return
    const t = c.currentTime
    melody.forEach((f, i) => {
      const o = c.createOscillator(), og = c.createGain()
      o.connect(og); og.connect(g); o.type = 'triangle'; o.frequency.value = f
      const tt = t + i * dur
      og.gain.setValueAtTime(0, tt)
      og.gain.linearRampToValueAtTime(0.18, tt + 0.03)
      og.gain.exponentialRampToValueAtTime(0.001, tt + dur * 0.85)
      o.start(tt); o.stop(tt + dur)
    })
    bass.forEach((f, i) => {
      const o = c.createOscillator(), og = c.createGain()
      o.connect(og); og.connect(g); o.type = 'sine'; o.frequency.value = f
      const tt = t + i * dur
      og.gain.setValueAtTime(0.08, tt)
      og.gain.exponentialRampToValueAtTime(0.001, tt + dur * 0.7)
      o.start(tt); o.stop(tt + dur)
    })
    const id = setTimeout(loop, melody.length * dur * 1000 - 50)
    stopHandle = { stop: () => clearTimeout(id) }
  }
  loop()
}

// ── 8-bit ────────────────────────────────────────────────────────────────────

function bit8(): void {
  const c = ctx!, g = gainNode!
  const mel = [330,330,330,262,330,392,196,262,196,165,220,247,233,220,196,330,392,440,349,392,330,262,294,247]
  const dur = 0.14
  const loop = () => {
    if (!playing) return
    const t = c.currentTime
    mel.forEach((f, i) => {
      const o = c.createOscillator(), og = c.createGain()
      o.connect(og); og.connect(g); o.type = 'square'; o.frequency.value = f
      const tt = t + i * dur
      og.gain.setValueAtTime(0.1, tt)
      og.gain.setValueAtTime(0.1, tt + dur * 0.7)
      og.gain.setValueAtTime(0, tt + dur * 0.71)
      o.start(tt); o.stop(tt + dur)
    })
    const id = setTimeout(loop, mel.length * dur * 1000 - 50)
    stopHandle = { stop: () => clearTimeout(id) }
  }
  loop()
}

// ── Gameshow ─────────────────────────────────────────────────────────────────

function gameshow(): void {
  const c = ctx!, g = gainNode!
  const pat: { f: number; d: number }[] = [
    {f:440,d:.15},{f:0,d:.05},{f:440,d:.15},{f:0,d:.05},{f:392,d:.15},{f:0,d:.05},{f:440,d:.3},{f:0,d:.1},
    {f:523,d:.15},{f:0,d:.05},{f:494,d:.15},{f:0,d:.05},{f:466,d:.15},{f:0,d:.05},{f:440,d:.5},{f:0,d:.2},
  ]
  const loop = () => {
    if (!playing) return
    let t = c.currentTime, total = 0
    pat.forEach(({ f, d }) => {
      if (f) {
        const o = c.createOscillator(), og = c.createGain()
        o.connect(og); og.connect(g); o.type = 'triangle'; o.frequency.value = f
        og.gain.setValueAtTime(0.15, t + total)
        og.gain.exponentialRampToValueAtTime(0.001, t + total + d * 0.85)
        o.start(t + total); o.stop(t + total + d)
        const ob = c.createOscillator(), ogb = c.createGain()
        ob.connect(ogb); ogb.connect(g); ob.type = 'sine'; ob.frequency.value = f / 2
        ogb.gain.setValueAtTime(0.06, t + total)
        ogb.gain.exponentialRampToValueAtTime(0.001, t + total + d)
        ob.start(t + total); ob.stop(t + total + d)
      }
      total += d
    })
    const id = setTimeout(loop, total * 1000 - 50)
    stopHandle = { stop: () => clearTimeout(id) }
  }
  loop()
}

// ── Hype ─────────────────────────────────────────────────────────────────────

function hype(): void {
  const c = ctx!, g = gainNode!
  const stabs = [392,0,0,392,0,523,0,587,659,0,587,0,523,392,0,0]
  const dur = 0.1
  const loop = () => {
    if (!playing) return
    const t = c.currentTime
    stabs.forEach((f, i) => {
      if (!f) return
      ;[f, f * 0.5].forEach(freq => {
        const o = c.createOscillator(), og = c.createGain()
        o.connect(og); og.connect(g); o.type = 'sawtooth'; o.frequency.value = freq
        const tt = t + i * dur
        og.gain.setValueAtTime(0.1, tt)
        og.gain.exponentialRampToValueAtTime(0.001, tt + dur * 0.6)
        o.start(tt); o.stop(tt + dur)
      })
    });
    [0, 4, 8, 12].forEach(i => {
      const o = c.createOscillator(), og = c.createGain()
      o.connect(og); og.connect(g); o.type = 'sine'
      o.frequency.setValueAtTime(180, t + i * dur)
      o.frequency.exponentialRampToValueAtTime(40, t + i * dur + 0.12)
      og.gain.setValueAtTime(0.25, t + i * dur)
      og.gain.exponentialRampToValueAtTime(0.001, t + i * dur + 0.18)
      o.start(t + i * dur); o.stop(t + i * dur + 0.2)
    })
    const id = setTimeout(loop, stabs.length * dur * 1000 - 40)
    stopHandle = { stop: () => clearTimeout(id) }
  }
  loop()
}
