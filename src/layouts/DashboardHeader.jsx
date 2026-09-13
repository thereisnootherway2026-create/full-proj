import { Bell, Search, User, Settings, LogOut, Menu, Loader2, Calendar, Stethoscope } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useScroll, useTransform } from 'framer-motion'
import { useAppContext } from '../context/AppContext'

// The page background everywhere is bg-gray-50 (#f9fafb) — the header
// starts as a distinct white bar and smoothly interpolates into that same
// color as the page scrolls, so it visually "sinks into" the background
// instead of staying a hard-edged floating card.
const HEADER_BG_TOP = '#ffffff'
const HEADER_BG_SCROLLED = '#f9fafb'
const HEADER_BORDER_TOP = '#e5e7eb'
const MERGE_DISTANCE = 48 // px of scroll over which the merge completes

function DashboardHeader({ onMenuClick, search, setSearch, searchResults, searchLoading, showSearch = true, scrollContainerRef }) {
  const navigate = useNavigate()
  const { profile, currentUser, logout } = useAppContext()

  const { scrollY } = useScroll({ container: scrollContainerRef })
  const backgroundColor = useTransform(scrollY, [0, MERGE_DISTANCE], [HEADER_BG_TOP, HEADER_BG_SCROLLED])
  const borderColor = useTransform(scrollY, [0, MERGE_DISTANCE], [HEADER_BORDER_TOP, HEADER_BG_SCROLLED])
  const boxShadowOpacity = useTransform(scrollY, [0, MERGE_DISTANCE], [1, 0])
  const boxShadow = useTransform(boxShadowOpacity, (v) => `0 1px 2px 0 rgba(0, 0, 0, ${0.05 * v})`)

  const [showNotifications, setShowNotifications] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  const searchRef = useRef(null)
  const inputRef = useRef(null)

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setIsOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Open dropdown when results come in
  useEffect(() => {
    if (search?.length >= 1 && searchResults && (searchResults.patients?.length || searchResults.rdv?.length || searchResults.consultations?.length)) {
      setIsOpen(true)
    }
  }, [searchResults, search])

  const userName = profile?.nom_complet || currentUser?.name || 'Utilisateur'
  const userRole = profile?.role || currentUser?.role || 'Staff'
  const initials = userName.slice(0, 2).toUpperCase()

  const hasAnyResults = searchResults && (searchResults.patients?.length || searchResults.rdv?.length || searchResults.consultations?.length)
  const showDropdown = isOpen && search?.length >= 1

  const handleResultClick = (path) => {
    navigate(path)
    setSearch('')
    setIsOpen(false)
  }

  return (
    <motion.header
      style={{ backgroundColor, borderBottomColor: borderColor, boxShadow }}
      className="sticky top-0 z-50 flex h-[64px] items-center justify-between border-b px-6 py-2"
    >
      <div className="flex shrink-0 items-center lg:hidden">
        <button type="button" onClick={onMenuClick} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400">
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* ── Search Left-Aligned & Styled — dashboard only ── */}
      <div className="flex-1 flex justify-start md:pl-2">
        {showSearch && (
        <div ref={searchRef} className="relative w-full max-w-lg">
          <label className="flex h-9 items-center gap-3 rounded border border-gray-300 bg-white px-4 shadow-sm transition-all focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
            <Search className="h-4 w-4 text-slate-500" />
            <input
              ref={inputRef}
              type="text"
              value={search || ''}
              onChange={(e) => { setSearch(e.target.value); if (e.target.value.length >= 1) setIsOpen(true) }}
              placeholder="Rechercher un patient (Nom, CIN, téléphone...)"
              className="h-full w-full border-0 bg-transparent text-[13px] font-semibold text-slate-700 outline-none placeholder:text-slate-400"
            />
          </label>
        </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-6">
        <button type="button" className="relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f3f4f6] text-slate-600">
          <Bell className="h-5 w-5" />
          <span className="absolute top-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-red-500" />
        </button>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:flex flex-col items-end gap-1">
            <p className="text-[13px] font-bold text-black leading-tight">{userName}</p>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
              userRole === 'medecin' 
                ? 'bg-blue-100 text-blue-800' 
                : userRole === 'secretaire' 
                  ? 'bg-amber-100 text-amber-800' 
                  : 'bg-blue-100 text-blue-800'
            }`}>
              {userRole === 'medecin' ? 'Médecin' : userRole === 'secretaire' ? 'Secrétaire' : 'Admin'}
            </span>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2563eb] text-[12px] font-bold text-white uppercase">
            {initials}
          </div>
        </div>
      </div>
    </motion.header>
  )
}

export default DashboardHeader
