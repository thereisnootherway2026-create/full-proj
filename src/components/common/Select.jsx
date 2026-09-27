import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  portal = false,
  'aria-label': ariaLabel,
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [actualPlacement, setActualPlacement] = useState(placement === 'auto' ? 'bottom' : placement)
  const [menuPosition, setMenuPosition] = useState(null)
  const rootRef = useRef(null)
  const menuRef = useRef(null)
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
      const isInTrigger = rootRef.current?.contains(e.target)
      const isInMenu = menuRef.current?.contains(e.target)
      if (!isInTrigger && !isInMenu) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const positionPortalMenu = () => {
    const rect = rootRef.current?.getBoundingClientRect()
    if (!rect) return

    const viewportPadding = 8
    const preferredHeight = 240
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding
    const spaceAbove = rect.top - viewportPadding
    const isTop = spaceBelow < preferredHeight && spaceAbove > spaceBelow
    const availableHeight = Math.max(120, Math.min(preferredHeight, isTop ? spaceAbove : spaceBelow))

    setActualPlacement(isTop ? 'top' : 'bottom')
    setMenuPosition({
      top: isTop ? Math.max(viewportPadding, rect.top - availableHeight - viewportPadding) : rect.bottom + viewportPadding,
      left: Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - rect.width - viewportPadding)),
      width: Math.min(rect.width, window.innerWidth - viewportPadding * 2),
      maxHeight: availableHeight,
    })
  }

  useEffect(() => {
    if (!open || !portal) return undefined

    positionPortalMenu()
    window.addEventListener('resize', positionPortalMenu)
    window.addEventListener('scroll', positionPortalMenu, true)
    return () => {
      window.removeEventListener('resize', positionPortalMenu)
      window.removeEventListener('scroll', positionPortalMenu, true)
    }
  }, [open, portal])

  const openMenu = () => {
    if (disabled) return
    if (portal) {
      positionPortalMenu()
    } else if (placement === 'auto' && rootRef.current) {
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
    if (opt.disabled) return
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
      if (normalizedOptions[active] && !normalizedOptions[active].disabled) choose(normalizedOptions[active])
    }
  }

  const isTop = actualPlacement === 'top'
  const SelectedIcon = selected?.icon || Icon
  const menu = (
    <motion.ul
      ref={menuRef}
      id={listId}
      role="listbox"
      initial={reduceMotion ? false : { opacity: 0, y: isTop ? 6 : -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: isTop ? 4 : -4, scale: 0.98 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      style={portal ? menuPosition : undefined}
      className={cn(
        "z-[160] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_12px_32px_-8px_rgba(15,23,42,0.18)] scrollbar-thin",
        portal ? 'fixed' : cn('absolute left-0 right-0 max-h-60', isTop ? 'bottom-full mb-2 origin-bottom' : 'top-full mt-2 origin-top'),
        menuClassName
      )}
    >
      {normalizedOptions.length === 0 && (
        <li className="px-3 py-2.5 text-sm text-slate-400">{emptyText}</li>
      )}
      {normalizedOptions.map((opt, i) => {
        const isSelected = opt.value === value
        const isDisabled = Boolean(opt.disabled)
        const OptIcon = opt.icon
        return (
          <li
            key={opt.value}
            role="option"
            aria-selected={isSelected}
            aria-disabled={isDisabled}
            onMouseEnter={() => !isDisabled && setActive(i)}
            onClick={() => choose(opt)}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
              isDisabled
                ? "cursor-not-allowed bg-rose-50/70 text-rose-700 opacity-80"
                : "cursor-pointer",
              !isDisabled && isSelected
                ? "bg-blue-50/80 text-blue-700 font-medium"
                : !isDisabled && active === i
                ? "bg-slate-50 text-slate-900"
                : !isDisabled ? "text-slate-700" : ""
            )}
          >
            {opt.color ? (
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-xs" style={{ backgroundColor: opt.color }} />
            ) : OptIcon ? (
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: opt.color ? `${opt.color}15` : '#f1f5f9', color: opt.color || '#64748b' }}>
                <OptIcon className="h-3.5 w-3.5" />
              </span>
            ) : null}
            {avatars && (
              <span className={cn("flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold", isSelected ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600")}>
                {initialsOf(opt.label)}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 truncate">
                {isDisabled && opt.description && (
                  <span className="flex-shrink-0 text-[11.5px] font-bold text-rose-600">{opt.description}</span>
                )}
                <span className={cn("truncate font-medium text-[13.5px]", isDisabled ? "text-rose-800" : "text-slate-900")}>{opt.label}</span>
              </span>
              {!isDisabled && opt.description && <span className="block truncate text-[11.5px] font-normal mt-0.5 text-slate-500">{opt.description}</span>}
            </span>
            {opt.badge && <span className={cn("flex-shrink-0 px-1.5 py-0.5 rounded text-[10.5px] font-semibold tracking-wide border", isSelected ? "bg-blue-100/70 border-blue-200 text-blue-800" : "bg-slate-100 border-slate-200/60 text-slate-600")}>{opt.badge}</span>}
            {isSelected && <Check className="h-4 w-4 flex-shrink-0 text-blue-600 ml-1" strokeWidth={2.5} />}
          </li>
        )
      })}
    </motion.ul>
  )

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
          portal ? createPortal(menu, document.body) : menu
        )}
      </AnimatePresence>
    </div>
  )
}
