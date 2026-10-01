import {
  CalendarDays,
  ChartColumnBig,
  Clock3,
  CreditCard,
  FilePenLine,
  FolderHeart,
  LayoutDashboard,
  Settings2,
  Stethoscope,
  UsersRound,
  X,
  ChevronLeft,
  ChevronRight,
  Bot,
  ListChecks
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { startOfWeek, endOfWeek, format } from 'date-fns'
import { getSidebarForRole } from '../../lib/sidebarConfig'
import { getPatients, getConsultations, getRdv } from '../../lib/api'
import { fetchAgendaConfig } from '../../lib/agendaConfig'
import { fetchAgendaRange } from '../../lib/appointmentService'
import { useSidebar } from '../../ui/sidebar'
import { Tooltip as TooltipPrimitive } from 'radix-ui'
import { useEffect } from 'react'
import { useAppContext } from '../../context/AppContext'

const iconMap = {
  'calendar-days': CalendarDays,
  'chart-column-big': ChartColumnBig,
  'clock-3': Clock3,
  'credit-card': CreditCard,
  'file-pen-line': FilePenLine,
  'folder-heart': FolderHeart,
  'layout-dashboard': LayoutDashboard,
  'settings-2': Settings2,
  stethoscope: Stethoscope,
  'users-round': UsersRound,
  'bot': Bot,
  'list-checks': ListChecks,
}

const CustomHoverTooltip = ({ children, content }) => (
  <TooltipPrimitive.Provider delayDuration={0}>
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side="right"
          sideOffset={16}
          className="z-[100] text-base font-medium bg-white text-gray-900 shadow-lg rounded-lg px-3 py-2 border-0 animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  </TooltipPrimitive.Provider>
)

function SidebarLink({ item, onClick, onPrefetch, isCollapsed }) {
  const Icon = iconMap[item.icon]

  const linkContent = (
    <NavLink
      to={item.to}
      end={item.to.endsWith('/dashboard')}
      onClick={onClick}
      onMouseEnter={onPrefetch}
      onFocus={onPrefetch}
      onPointerDown={onPrefetch}
      className={({ isActive }) =>
        `group interactive relative flex items-center transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] outline-none box-border ${
          isCollapsed ? 'justify-center w-full px-2 py-2' : 'gap-2.5 px-4 py-2.5 w-full'
        } ${
          isActive
            ? (isCollapsed ? '' : 'text-white bg-white/5')
            : (`text-[#94A3B8] ${isCollapsed ? '' : 'hover:bg-white/5 hover:text-white'}`)
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={`flex items-center justify-center transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] shrink-0 ${
              isCollapsed
                ? `h-10 w-10 mx-auto rounded-xl overflow-hidden ${
                    isActive
                      ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30 scale-110'
                      : 'bg-transparent text-[#94A3B8] group-hover:bg-white/10 group-hover:text-white'
                  }`
                : `h-8 w-8 rounded-lg ${isActive ? 'text-white' : 'text-[#94A3B8]'}`
            }`}
          >
            <Icon size={18} className={isCollapsed ? "h-5 w-5" : "h-[18px] w-[18px]"} />
          </span>

          <span
            className={`overflow-hidden whitespace-nowrap transition-all duration-400 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
              isCollapsed
                ? 'max-w-0 opacity-0 -translate-x-3 delay-0'
                : 'max-w-[200px] opacity-100 translate-x-0 delay-100'
            }`}
            style={{
              fontSize: 'var(--type-nav)',
              fontWeight: isActive ? 'var(--weight-nav-active)' : 'var(--weight-nav)',
              lineHeight: 'var(--leading-nav)',
              letterSpacing: 'var(--tracking-nav)'
            }}
          >
            {item.label}
          </span>
        </>
      )}
    </NavLink>
  )

  if (isCollapsed) {
    return <CustomHoverTooltip content={item.label}>{linkContent}</CustomHoverTooltip>
  }

  return linkContent
}

function DashboardSidebar({ mobile = false, onClose }) {
  const { state, toggleSidebar } = useSidebar()
  const { profile, cabinet } = useAppContext()
  const queryClient = useQueryClient()
  const isCollapsed = !mobile && state === 'collapsed'

  useEffect(() => {
    if (!mobile) {
      localStorage.setItem('sidebar-collapsed', isCollapsed ? 'true' : 'false')
    }
  }, [isCollapsed, mobile])

  const cabinetName = cabinet?.nom || 'Administration'
  const userName = profile?.nom_complet || 'Utilisateur'
  const userInitials = userName.slice(0, 2).toUpperCase()

  const prefetchPatients = () => {
    const cabinetId = profile?.cabinet_id
    if (!cabinetId) return

    queryClient.prefetchQuery({ queryKey: ['patients', cabinetId], queryFn: getPatients, staleTime: 5 * 60 * 1000 })
    queryClient.prefetchQuery({ queryKey: ['consultations', cabinetId], queryFn: getConsultations, staleTime: 5 * 60 * 1000 })
    queryClient.prefetchQuery({ queryKey: ['rdv', cabinetId], queryFn: getRdv, staleTime: 5 * 60 * 1000 })
  }

  const prefetchAgenda = () => {
    const cabinetId = profile?.cabinet_id
    if (!cabinetId) return

    const weekStartKey = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
    const weekEndKey = format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')

    queryClient.prefetchQuery({
      queryKey: ['agenda-config', cabinetId],
      queryFn: () => fetchAgendaConfig(cabinetId),
      staleTime: 5 * 60 * 1000,
    })

    queryClient.prefetchQuery({
      queryKey: ['agenda-range', cabinetId, 'week', weekStartKey, weekEndKey],
      queryFn: () => fetchAgendaRange(cabinetId, weekStartKey, weekEndKey),
      staleTime: 5 * 60 * 1000,
    })
  }

  useEffect(() => {
    if (profile?.cabinet_id) {
      prefetchAgenda()
    }
  }, [profile?.cabinet_id])

  return (
    <aside
      className={`relative flex h-full flex-col bg-[#0d1117] text-white overflow-x-hidden border-r border-[#1e293b] transition-[width,min-width,max-width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
        mobile ? 'w-full' : isCollapsed ? 'w-[64px] min-w-[64px] max-w-[64px] shrink-0' : 'w-[255px] min-w-[255px] max-w-[255px] shrink-0'
      }`}
    >
      <div
        className={`relative flex flex-row items-center border-b border-white/10 h-[64px] transition-all duration-300 ease-in-out box-border ${
          isCollapsed ? 'px-1' : 'px-6'
        }`}
      >
        <div className={`flex flex-1 items-center overflow-hidden transition-all duration-300 ease-in-out ${isCollapsed ? 'justify-start' : 'gap-3'}`}>
          <div
            className={`overflow-hidden transition-all duration-200 ease-in-out ${
              isCollapsed
                ? 'opacity-0 -translate-x-3 w-0 max-w-0'
                : 'opacity-100 translate-x-0 max-w-[160px] w-auto delay-100'
            }`}
          >
            <p className="whitespace-nowrap text-[17px] font-[700] tracking-tight">MacroMedica</p>
          </div>
        </div>
        
        {!mobile && (
          <button
            onClick={toggleSidebar}
            className="ml-auto shrink-0 z-50 flex h-7 w-7 items-center justify-center rounded-lg bg-transparent text-white/40 transition-all duration-180 ease-in-out hover:bg-white/[0.07] hover:text-white active:bg-white/[0.12]"
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        )}

        {mobile && (
          <button
            type="button"
            onClick={onClose}
            className="ml-auto shrink-0 rounded-xl border border-white/10 p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <div
        className={`flex-1 space-y-8 overflow-y-auto overflow-x-hidden pt-4 pb-6 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          isCollapsed ? 'px-0' : 'px-4'
        }`}
      >
        {getSidebarForRole(profile?.role || 'docteur').map((section) => (
          <div key={section.label}>
            <div
              className={`relative flex items-center transition-all duration-150 ease-in-out ${
                isCollapsed ? 'my-4 h-[2px] justify-center px-0 opacity-100' : 'mb-2 h-6 px-3'
              }`}
            >
              <div
                className={`w-full border-t border-white/10 transition-all duration-150 ease-in-out ${
                  isCollapsed ? 'max-w-[24px] opacity-100' : 'max-w-0 opacity-0'
                }`}
              />
              <p
                className={`absolute left-3 whitespace-nowrap text-[11px] font-[600] uppercase tracking-[0.06em] text-[#94a3b8] transition-all duration-150 ease-in-out ${
                  isCollapsed ? 'delay-0 w-0 overflow-hidden opacity-0' : 'delay-150 w-auto opacity-100'
                }`}
              >
                {section.label}
              </p>
            </div>

            <div className="space-y-2">
              {section.items.map((item) => (
                <SidebarLink
                  key={item.to}
                  item={item}
                  onClick={onClose}
                  onPrefetch={
                    item.to === '/patients'
                      ? prefetchPatients
                      : item.to === '/agenda'
                      ? prefetchAgenda
                      : undefined
                  }
                  isCollapsed={isCollapsed}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="relative h-[160px] shrink-0 overflow-hidden border-t border-white/10">
        
        <div
          className={`absolute inset-0 flex flex-col justify-center p-5 transition-all duration-200 ease-in-out ${
            isCollapsed ? 'pointer-events-none -translate-x-3 opacity-0 delay-0' : 'translate-x-0 opacity-100 delay-100'
          }`}
        >
          <div className="w-[215px] rounded-[24px] bg-white/5 p-5">
            <p className="text-[11px] font-[600] uppercase tracking-[0.06em] text-[#94a3b8] mb-2">Administration</p>
            <p className="whitespace-nowrap text-[14px] font-[500] text-white truncate">{cabinetName}</p>
            <p className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-[400] leading-[1.5] text-[#94a3b8] capitalize">
              Role: {profile?.role || 'Docteur'}
            </p>
          </div>
        </div>

        <div
          className={`absolute inset-0 flex justify-center pt-8 transition-all duration-200 ease-in-out ${
            isCollapsed ? 'translate-x-0 opacity-100 delay-100' : 'pointer-events-none translate-x-3 opacity-0 delay-0'
          }`}
        >
          <CustomHoverTooltip content={userName}>
            <div className="flex h-10 w-10 shrink-0 cursor-default items-center justify-center rounded-full bg-blue-600 text-[13px] font-bold text-white uppercase shadow-md transition hover:bg-blue-500">
              {userInitials}
            </div>
          </CustomHoverTooltip>
        </div>
      </div>
    </aside>
  )
}

export default DashboardSidebar
