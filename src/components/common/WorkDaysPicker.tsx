/**
 * WorkDaysPicker — selector de días hábiles de la sala (L M X J V S D).
 * Siempre deja al menos un día seleccionado.
 */

const DAYS: { value: number; label: string; title: string }[] = [
  { value: 1, label: 'L', title: 'Lunes'     },
  { value: 2, label: 'M', title: 'Martes'    },
  { value: 3, label: 'X', title: 'Miercoles' },
  { value: 4, label: 'J', title: 'Jueves'    },
  { value: 5, label: 'V', title: 'Viernes'   },
  { value: 6, label: 'S', title: 'Sabado'    },
  { value: 0, label: 'D', title: 'Domingo'   },
]

interface Props {
  value: number[]
  onChange: (days: number[]) => void
  disabled?: boolean
}

export function WorkDaysPicker({ value, onChange, disabled }: Props) {
  const toggle = (day: number) => {
    if (value.includes(day)) {
      if (value.length > 1) onChange(value.filter(d => d !== day))
    } else {
      onChange([...value, day].sort())
    }
  }

  return (
    <div className="form-label">
      Dias habiles
      <div className="toggle-group">
        {DAYS.map(d => (
          <button
            key={d.value}
            type="button"
            title={d.title}
            className={`toggle-btn ${value.includes(d.value) ? 'active' : ''}`}
            onClick={() => toggle(d.value)}
            disabled={disabled}
          >
            {d.label}
          </button>
        ))}
      </div>
      <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400 }}>
        Solo se sortea en dias habiles, y solo ellos cuentan como dias libres
      </span>
    </div>
  )
}
