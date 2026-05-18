/**
 * Utilidades de fechas — sin dependencias de DOM ni Firebase.
 * Todas las fechas son strings ISO YYYY-MM-DD en hora local.
 */

/** Fecha de hoy en formato YYYY-MM-DD */
export function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Fecha de mañana en formato YYYY-MM-DD */
export function tomorrow(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** Fecha relativa a hoy: n=1 → mañana, n=-1 → ayer */
export function dateOffset(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Formatea una fecha YYYY-MM-DD en español: "lunes 15 de mayo" */
export function fmtDate(str: string): string {
  return new Date(str + 'T12:00:00').toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

/** Calcula la fecha de vencimiento de la tarea según la configuración de la sala */
export function getTaskDueDate(config: {
  dueMode?: string
  dueCustomDate?: string | null
}): string {
  const mode = config.dueMode || 'today'
  if (mode === 'today') return today()
  if (mode === 'tomorrow') return dateOffset(1)
  if (mode === 'custom' && config.dueCustomDate) return config.dueCustomDate
  return today()
}

/**
 * Fecha en la que un miembro vuelve a ser elegible,
 * después de haber facilitado en `facilitationDate` con `freeDays` días libres.
 */
export function availableAgainDate(facilitationDate: string, freeDays: number): string {
  const d = new Date(facilitationDate + 'T12:00:00')
  d.setDate(d.getDate() + freeDays + 1)
  return d.toISOString().slice(0, 10)
}

// ---- Helpers de configuración de sala ----

export function getRoomFreeDays(freeDays?: number | null): number {
  return freeDays == null ? 2 : Math.max(0, Math.trunc(Number(freeDays)) || 0)
}

export function getRoomMinParticipants(minParticipants?: number | null): number {
  return Math.max(2, minParticipants == null ? 2 : Math.trunc(Number(minParticipants)) || 2)
}
