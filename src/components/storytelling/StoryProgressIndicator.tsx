import React, { useState, useEffect } from 'react'

interface StoryProgressIndicatorProps {
  sectionIds: Array<{ id: string; label: string }>
}

export const StoryProgressIndicator: React.FC<StoryProgressIndicatorProps> = ({ sectionIds }) => {
  const [activeSection, setActiveSection] = useState(sectionIds[0]?.id || '')

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY + 200
      for (let i = sectionIds.length - 1; i >= 0; i--) {
        const el = document.getElementById(sectionIds[i].id)
        if (el && el.offsetTop <= scrollY) {
          setActiveSection(sectionIds[i].id)
          break
        }
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [sectionIds])

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div className="hidden lg:flex fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-md rounded-full px-4 py-1.5 items-center gap-1.5 text-[11px] font-mono select-none">
      {sectionIds.map((item, idx) => {
        const isActive = activeSection === item.id
        return (
          <button
            key={item.id}
            onClick={() => scrollToSection(item.id)}
            className={`px-2.5 py-1 rounded-full transition-all cursor-pointer ${
              isActive
                ? 'bg-slate-900 text-white font-bold'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <span>{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}
