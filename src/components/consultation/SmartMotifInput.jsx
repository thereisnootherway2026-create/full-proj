import { useState, useRef, useEffect, useMemo, useCallback, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, X, CornerDownLeft, Search } from 'lucide-react'
import { searchMotifs } from '../../data/motifSuggestions'

const TONE_CLASSES = {
  blue: 'bg-blue-50 text-blue-700 border-blue-200/60',
  amber: 'bg-amber-50 text-amber-800 border-amber-200/60',
  purple: 'bg-purple-50 text-purple-700 border-purple-200/60',
  rose: 'bg-rose-50 text-rose-700 border-rose-200/60',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200/60',
  slate: 'bg-slate-100 text-slate-700 border-slate-200/60',
}

function HighlightMatch({ text, query }) {
  if (!query || !query.trim()) return <span>{text}</span>
  const q = query.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const normText = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  
  const idx = normText.indexOf(q)
  if (idx === -1) return <span>{text}</span>

  const before = text.slice(0, idx)
  const match = text.slice(idx, idx + q.length)
  const after = text.slice(idx + q.length)

  return (
    <span>
      {before}
      <span className="font-semibold text-blue-600 bg-blue-50/80 rounded px-0.5">{match}</span>
      {after}
    </span>
  )
}

export default memo(function SmartMotifInput({
  value = '',
  onChange,
  placeholder = 'Motif principal de la consultation…',
  autoFocus = false,
  className = '',
}) {
  const containerRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Search results are computed strictly when user has typed text
  const suggestions = useMemo(() => {
    const q = (value || '').trim()
    if (!q) return []
    return searchMotifs(q, 8)
  }, [value])

  const hasSuggestions = suggestions.length > 0 && isOpen && value.trim().length > 0

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Keep selectedIndex in bounds when suggestions change
  useEffect(() => {
    setSelectedIndex(0)
  }, [suggestions])

  // Scroll active item into view
  useEffect(() => {
    if (!hasSuggestions || !listRef.current) return
    const activeEl = listRef.current.children[selectedIndex]
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex, hasSuggestions])

  const selectSuggestion = useCallback((motifLabel) => {
    onChange?.(motifLabel)
    setIsOpen(false)
  }, [onChange])

  const handleKeyDown = (e) => {
    if (!isOpen || !suggestions.length) {
      if (e.key === 'ArrowDown' && suggestions.length > 0) {
        setIsOpen(true)
        e.preventDefault()
      }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (suggestions[selectedIndex]) {
        e.preventDefault()
        selectSuggestion(suggestions[selectedIndex].label)
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setIsOpen(false)
    }
  }

  const handleClear = () => {
    onChange?.('')
    setIsOpen(false)
    inputRef.current?.focus()
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            onChange?.(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => {
            if (value && value.trim().length > 0) {
              setIsOpen(true)
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={`w-full rounded-xl border border-slate-200/90 bg-white pl-4 pr-10 py-2.5 sm:py-3 text-[14px] sm:text-[14.5px] font-normal text-slate-800 placeholder:text-slate-400 placeholder:font-normal focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 shadow-xs transition-all ${className}`}
        />

        {Boolean(value && value.trim().length > 0) && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 p-1 rounded-md text-gray-300 hover:text-gray-500 hover:bg-slate-100 transition-colors"
            title="Effacer le motif"
            aria-label="Effacer"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Floating Smart Suggestions Popover */}
      <AnimatePresence>
        {hasSuggestions && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.99 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
            className="absolute left-0 right-0 top-full z-50 mt-1.5 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl ring-1 ring-slate-900/5 overflow-hidden"
          >
            {/* Header info */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100 text-[11px] text-slate-500 font-medium">
              <span className="flex items-center gap-1.5 text-blue-700 font-semibold">
                <Sparkles className="h-3 w-3 text-blue-600" />
                Suggestions intelligentes
              </span>
              <span className="text-[10.5px] text-slate-400">
                <kbd className="px-1 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-mono">↑↓</kbd> naviguer · <kbd className="px-1 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-mono">Entrée</kbd> choisir
              </span>
            </div>

            {/* List of matched items */}
            <div ref={listRef} className="max-h-[290px] overflow-y-auto py-1 space-y-0.5">
              {suggestions.map((item, idx) => {
                const isSelected = idx === selectedIndex
                const toneClass = TONE_CLASSES[item.tone] || TONE_CLASSES.slate

                return (
                  <div
                    key={item.label}
                    onClick={() => selectSuggestion(item.label)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl text-left cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-blue-50/80 text-blue-950 font-medium'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <div className="text-[13.5px] truncate">
                        <HighlightMatch text={item.label} query={value} />
                      </div>
                      {item.matchedReason && (
                        <span className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-normal truncate">
                          {item.matchedReason}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-medium border ${toneClass}`}>
                        {item.category}
                      </span>
                      {isSelected && (
                        <CornerDownLeft className="h-3.5 w-3.5 text-blue-500 hidden sm:block" />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Free text fallback hint */}
            <div className="border-t border-slate-100 px-3 py-1.5 mt-0.5 flex items-center justify-between text-[11px] text-slate-400 bg-slate-50/60 rounded-b-xl">
              <span className="truncate">
                Appuyez sur <span className="font-semibold text-slate-600">Échap</span> pour fermer ou conservez votre saisie libre
              </span>
              <span className="font-semibold text-slate-500 shrink-0 ml-2">
                « {value} »
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})
