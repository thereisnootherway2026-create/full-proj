import { forwardRef } from 'react'
import { X } from 'lucide-react'
import IconButton from './IconButton'

// The one chip pattern: pill-shaped toggles and quick picks (Depuis, Évolution,
// follow-up presets, documents, suggestions, most-used actes).
//   unselected -> quiet grey     selected -> dark (or green for "already used")
// Radio/checkbox/tab semantics are opt-in through `role`; otherwise it is a plain
// toggle (aria-pressed). Removable dark tags (diagnoses, exams) are `Tag`.
const OFF = 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
const ON = {
  dark: 'bg-blue-50 text-blue-700 border border-blue-300 font-medium',
  blue: 'bg-blue-50 text-blue-700 border border-blue-300 font-medium',
  success: 'bg-green-100 text-green-800 ring-1 ring-inset ring-green-600',
}

const Chip = forwardRef(function Chip({ selected = false, tone = 'dark', size = 'sm', icon: Icon, role, className = '', children, ...rest }, ref) {
  const aria = role === 'radio' || role === 'checkbox' ? { role, 'aria-checked': selected } : role === 'tab' ? { role, 'aria-selected': selected } : { 'aria-pressed': selected }
  return (
    <button ref={ref} type="button" {...aria} {...rest}
      className={`inline-flex items-center gap-1 rounded-full font-medium transition-colors ${SIZES[size]} ${selected ? ON[tone] : OFF} ${className}`}>
      {Icon && <Icon className="h-3 w-3 flex-shrink-0" />}
      {children}
    </button>
  )
})

export default Chip

// A value already chosen, with a remove control (a diagnosis, an exam, a selected
// suggestion). `tone`: dark (default) or success (green = confirmed/active).
// With `onSelect` the label itself is a button (e.g. to jump to where it came from).
const TAG_SKIN = {
  dark: { box: 'bg-blue-600 text-white shadow-sm', remove: 'onDark' },
  success: { box: 'bg-green-100 text-green-800 ring-1 ring-inset ring-green-600', remove: 'onSuccess' },
}

export function Tag({ children, onRemove, onSelect, label, title, tone = 'dark' }) {
  const skin = TAG_SKIN[tone]
  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full py-1 pl-3 pr-1.5 text-[12.5px] font-medium ${skin.box}`}>
      {onSelect
        ? <button type="button" onClick={onSelect} title={title} className="min-w-0 truncate text-left hover:underline">{children}</button>
        : <span className="min-w-0 truncate" title={title}>{children}</span>}
      <IconButton size="xs" look={skin.remove} label={`Retirer ${label}`} onClick={onRemove}><X className="h-3 w-3" /></IconButton>
    </span>
  )
}
