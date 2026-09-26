import { useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'

// The app's dropdown (replaces the browser's native <select>). Same field look as the other inputs
// (rounded, 44px, blue focus ring); the menu opens with a short animation and supports the keyboard
// (arrows, Enter, Escape). Supports rich option metadata (color indicator, badge, icon, description),
// smart positioning (top/bottom/auto) and custom trigger styles.
const initialsOf = (label) =>
  String(label || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '?'

export default function Select({
  value,
  onChange,
  options = [],
  placeholder = 'Sélectionner…',
  icon: Icon,
  avatars = false,
  emptyText = 'Aucun choix disponible',
  disabled = false,
  className = '',
  buttonClassName = '',
  menuClassName = '',
  placement = 'auto',
  'aria-label': ariaLabel,
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [actualPlacement, setActualPlacement] = useState(placement === 'auto' ? 'bottom' : placement)
  const rootRef = useRef(null)
  const listId = useId()
  const reduceMotion = useReducedMotion()

  // Normalize options to object format if passed as string array
  const normalizedOptions = options.map((opt) =>
    typeof opt === 'string' ? { value: opt, label: opt } : opt
  )

  const selectedIndex = normalizedOptions.findIndex((o) => o.value === value)
  const selected = selectedIndex >= 0 ? normalizedOptions[selectedIndex] : null

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const openMenu = () => {
    if (disabled) return
    if (placement === 'auto' && rootRef.current) {
      const rect = rootRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      if (spaceBelow < 260 && spaceAbove > 200) {
        setActualPlacement('top')
      } else {
        setActualPlacement('bottom')
      }
    } else if (placement !== 'auto') {
      setActualPlacement(placement)
    }
    setActive(selectedIndex >= 0 ? selectedIndex : 0)
    setOpen(true)
  }

  const choose = (opt) => {
    onChange(opt.value)
    setOpen(false)
  }

  const onKeyDown = (e) => {
    if (disabled) return
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        openMenu()
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(normalizedOptions.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (normalizedOptions[active]) choose(normalizedOptions[active])
    }
  }

  const isTop = actualPlacement === 'top'
  const SelectedIcon = selected?.icon || Icon

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={cn(
          "flex h-[44px] w-full items-center gap-2 rounded-[10px] border bg-white px-3 text-left text-[14px] font-medium outline-none transition-all disabled:cursor-not-allowed disabled:opacity-50",
          open
            ? "border-blue-500 ring-2 ring-blue-100 shadow-xs"
            : "border-[#E5E7EB] hover:border-[#D1D5DB] focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-100",
          buttonClassName
        )}
      >
        {selected?.color ? (
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-xs"
            style={{ backgroundColor: selected.color }}
          />
        ) : SelectedIcon ? (
          <SelectedIcon className="h-4 w-4 flex-shrink-0 text-slate-400" />
        ) : null}

        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[13.5px]",
            selected ? "text-[#111827] font-medium" : "text-[#9CA3AF]"
          )}
        >
          {selected ? selected.label : placeholder}
        </span>

        {selected?.badge && (
          <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200/60">
            {selected.badge}
          </span>
        )}

        <ChevronDown
          className={cn(
            "h-4 w-4 flex-shrink-0 text-slate-400 transition-transform duration-200",
            open && "rotate-180 text-blue-600"
          )}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            id={listId}
            role="listbox"
            initial={reduceMotion ? false : { opacity: 0, y: isTop ? 6 : -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: isTop ? 4 : -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className={cn(
              "absolute left-0 right-0 z-[100] max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_12px_32px_-8px_rgba(15,23,42,0.18)] scrollbar-thin",
              isTop ? "bottom-full mb-2 origin-bottom" : "top-full mt-2 origin-top",
              menuClassName
            )}
          >
            {normalizedOptions.length === 0 && (
              <li className="px-3 py-2.5 text-sm text-slate-400">{emptyText}</li>
            )}
            {normalizedOptions.map((opt, i) => {
              const isSelected = opt.value === value
              const OptIcon = opt.icon
              return (
                <li
                  key={opt.value}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(opt)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                    isSelected
                      ? "bg-blue-50/80 text-blue-700 font-medium"
                      : active === i
                      ? "bg-slate-50 text-slate-900"
                      : "text-slate-700"
                  )}
                >
                  {opt.color ? (
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-xs"
                      style={{ backgroundColor: opt.color }}
                    />
                  ) : OptIcon ? (
                    <span
                      className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md"
                      style={{
                        backgroundColor: opt.color ? `${opt.color}15` : '#f1f5f9',
                        color: opt.color || '#64748b',
                      }}
                    >
                      <OptIcon className="h-3.5 w-3.5" />
                    </span>
                  ) : null}

                  {avatars && (
                    <span
                      className={cn(
                        "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                        isSelected ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600"
                      )}
                    >
                      {initialsOf(opt.label)}
                    </span>
                  )}

                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-900 text-[13.5px]">
                      {opt.label}
                    </span>
                    {opt.description && (
                      <span className="block truncate text-[11.5px] font-normal text-slate-500 mt-0.5">
                        {opt.description}
                      </span>
                    )}
                  </span>

                  {opt.badge && (
                    <span
                      className={cn(
                        "flex-shrink-0 px-1.5 py-0.5 rounded text-[10.5px] font-semibold tracking-wide border",
                        isSelected
                          ? "bg-blue-100/70 border-blue-200 text-blue-800"
                          : "bg-slate-100 border-slate-200/60 text-slate-600"
                      )}
                    >
                      {opt.badge}
                    </span>
                  )}

                  {isSelected && (
                    <Check className="h-4 w-4 flex-shrink-0 text-blue-600 ml-1" strokeWidth={2.5} />
                  )}
                </li>
              )
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}
