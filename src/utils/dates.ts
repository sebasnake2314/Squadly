/**
 * Utilidades de fechas — sin dependencias de DOM ni Firebase.
 * Todas las fechas son strings ISO YYYY-MM-DD en hora local.
 */

/**
 * Date → YYYY-MM-DD en hora local.
 * (toISOString es UTC: en Latam adelanta el día desde las ~19-21h)
 */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Fecha de hoy en formato YYYY-MM-DD */
export function today(): string {
  return ymd(new Date())
}

/** Fecha de mañana en formato YYYY-MM-DD */
export function tomorrow(): string {
  return dateOffset(1)
}

/** Fecha relativa a hoy: n=1 → mañana, n=-1 → ayer */
export function dateOffset(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return ymd(d)
}

/** Formatea una fecha YYYY-MM-DD en español: "lunes 15 de mayo" */
export function fmtDate(str: string): string {
  return new Date(str + 'T12:00:00').toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

// ---- Días hábiles ----

/** Días de getDay() (0=domingo … 6=sábado). Salas sin configurar → lunes a viernes. */
export const DEFAULT_WORK_DAYS: readonly number[] = [1, 2, 3, 4, 5]

/** Normaliza workDays de la sala; Firebase puede devolver un objeto en vez de array. */
export function getRoomWorkDays(workDays?: number[] | Record<string, number> | null): number[] {
  const arr = Array.isArray(workDays) ? workDays : workDays && typeof workDays === 'object' ? Object.values(workDays) : []
  const days = [...new Set(arr.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))].sort()
  return days.length ? days : [...DEFAULT_WORK_DAYS]
}

export function isWorkDay(str: string, workDays: readonly number[]): boolean {
  return workDays.includes(new Date(str + 'T12:00:00').getDay())
}

/** n-ésimo día hábil después (n>0) o antes (n<0) de str */
export function addWorkDays(str: string, n: number, workDays: readonly number[]): string {
  const d = new Date(str + 'T12:00:00')
  const step = n < 0 ? -1 : 1
  let left = Math.abs(n)
  while (left > 0) {
    d.setDate(d.getDate() + step)
    if (workDays.includes(d.getDay())) left--
  }
  return ymd(d)
}

export function nextWorkDay(str: string, workDays: readonly number[]): string {
  return addWorkDays(str, 1, workDays)
}

/**
 * Día libre (1..freeDays) en el que está hoy alguien que facilitó el día `facDate`, o 0 si ya no.
 * Solo cuentan días hábiles; un día no hábil muestra el estado del próximo día hábil.
 */
export function freeDayIndex(facDate: string, freeDays: number, workDays: readonly number[], tod = today()): number {
  const effToday = isWorkDay(tod, workDays) ? tod : nextWorkDay(tod, workDays)
  if (freeDays <= 0 || facDate >= effToday) return 0
  let k = 0
  let d = facDate
  while (d < effToday) {
    d = addWorkDays(d, 1, workDays)
    k++
    if (k > freeDays) return 0
  }
  return k
}

/** Calcula la fecha de vencimiento de la tarea según la configuración de la sala */
export function getTaskDueDate(config: {
  dueMode?: string
  dueCustomDate?: string | null
  workDays?: number[] | null
}): string {
  const mode = config.dueMode || 'today'
  if (mode === 'today') return today()
  if (mode === 'tomorrow') return nextWorkDay(today(), getRoomWorkDays(config.workDays))
  if (mode === 'custom' && config.dueCustomDate) return config.dueCustomDate
  return today()
}

// ---- Helpers de configuración de sala ----

export function getRoomFreeDays(freeDays?: number | null): number {
  return freeDays == null ? 2 : Math.max(0, Math.trunc(Number(freeDays)) || 0)
}

export function getRoomMinParticipants(minParticipants?: number | null): number {
  return Math.max(2, minParticipants == null ? 2 : Math.trunc(Number(minParticipants)) || 2)
}
