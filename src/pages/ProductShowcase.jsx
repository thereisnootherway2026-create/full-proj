
import { Users, Calendar, DollarSign, Clock3, Activity, Stethoscope, Pill, CheckCircle2, AlertCircle, Plus } from 'lucide-react'
import { motion } from 'framer-motion'

function StatCard({ icon: Icon, iconWrap, iconColor, label, value, suffix = '' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
      className="flex items-center justify-between rounded-[21px] border border-[#e2e8f0] bg-white px-7 py-6 shadow-[0_5px_16px_rgba(15,23,42,0.045)] transition hover:-translate-y-[2px]"
    >
      <div className="flex items-center gap-4">
        <div className={`flex h-[64px] w-[64px] items-center justify-center rounded-full ${iconWrap}`}>
          <Icon className={iconColor} size={30} strokeWidth={2.1} />
        </div>
        <div>
          <p className="text-lg font-semibold text-slate-900 leading-tight">
            {value}
            {suffix && <span className="text-xl font-semibold text-slate-600 ml-1">{suffix}</span>}
          </p>
          <p className="text-sm font-medium text-slate-500 mt-1">
            {label}
          </p>
        </div>
      </div>
    </motion.div>
  )
}

function WaitingRoomPatient({ initials, name, time, reason, status, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.32, 0.72, 0, 1] }}
      className="flex items-start gap-4 rounded-[18px] border border-[#e2e8f0] bg-white p-5 shadow-[0_4px_12px_rgba(15,23,42,0.035)] transition hover:-translate-y-[1px]"
    >
      <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 flex items-center justify-center text-white font-bold text-lg">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className="truncate text-xl font-bold text-slate-900">
          {name}
        </p>
        <p className="text-sm font-medium text-slate-500 mt-1">
          {time} · {reason}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          {status}
        </span>
      </div>
    </motion.div>
  )
}

function TaskItem({ icon: Icon, iconColor, title, description, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.32, 0.72, 0, 1] }}
      className="flex items-start gap-3 rounded-[16px] border border-[#e2e8f0] bg-white p-4 shadow-[0_3px_10px_rgba(15,23,42,0.03)] transition hover:-translate-y-[1px]"
    >
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
        <Icon className={iconColor} size={19} strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-base font-semibold text-slate-900 leading-tight">
          {title}
        </p>
        <p className="text-sm text-slate-500 mt-0.5">
          {description}
        </p>
      </div>
      <CheckCircle2 className="w-6 h-6 text-emerald-500 flex-shrink-0" />
    </motion.div>
  )
}

export default function ProductShowcase() {
  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-[1600px]">
        {/* Hero Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-50 text-blue-700 text-sm font-semibold border border-blue-200 mb-5">
            <Activity size={15} strokeWidth={2.5} />
            <span>MacroMedica · Modern Clinic Management</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-slate-900 mb-3 leading-tight">
            Manage your clinic in one place
          </h1>
          <p className="text-xl text-slate-600 max-w-3xl mx-auto">
            Streamline patient consultations, appointment scheduling, and daily clinic operations with a single, intuitive workspace.
          </p>
        </motion.div>

        {/* Main Showcase Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left & Middle: Stats + Waiting Room (2/3 width) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatCard
                icon={Users}
                iconWrap="bg-blue-100"
                iconColor="text-blue-600"
                label="Patients en salle d'attente"
                value="7"
              />
              <StatCard
                icon={Calendar}
                iconWrap="bg-emerald-100"
                iconColor="text-emerald-600"
                label="RDV du jour"
                value="18"
              />
              <StatCard
                icon={DollarSign}
                iconWrap="bg-amber-100"
                iconColor="text-amber-600"
                label="Revenu du jour"
                value="12,580"
                suffix="DH"
              />
            </div>

            {/* Waiting Room List */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1, ease: [0.32, 0.72, 0, 1] }}
              className="rounded-[26px] border border-[#e2e8f0] bg-white p-7 shadow-[0_5px_16px_rgba(15,23,42,0.045)]"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-full bg-blue-100 flex items-center justify-center">
                    <Users size={23} className="text-blue-600" strokeWidth={2} />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900">Salle d'attente</h2>
                </div>
                <button className="flex items-center gap-2 px-4 py-2 rounded-[12px] bg-[#2563eb] text-white text-sm font-semibold hover:bg-blue-700 transition-all shadow-[0_4px_12px_rgba(37,99,235,0.2)]">
                  <Plus size={17} />
                  <span>Ajouter patient</span>
                </button>
              </div>
              <div className="space-y-4">
                <WaitingRoomPatient
                  initials="SA"
                  name="Sarah Amrani"
                  time="09:30"
                  reason="Consultation annuelle"
                  status="En attente"
                  delay={0.15}
                />
                <WaitingRoomPatient
                  initials="YB"
                  name="Youssef Benali"
                  time="09:45"
                  reason="Suivi diabète"
                  status="Prêt"
                  delay={0.25}
                />
                <WaitingRoomPatient
                  initials="LF"
                  name="Lina Fathi"
                  time="10:15"
                  reason="Analyses sanguines"
                  status="En attente"
                  delay={0.35}
                />
              </div>
            </motion.div>
          </div>

          {/* Right: Task Panel (1/3 width) */}
          <div className="lg:col-span-1">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2, ease: [0.32, 0.72, 0, 1] }}
              className="rounded-[26px] border border-[#e2e8f0] bg-white p-7 shadow-[0_5px_16px_rgba(15,23,42,0.045)] h-full"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="h-11 w-11 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Activity size={23} className="text-emerald-600" strokeWidth={2} />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">Priorités du jour</h2>
              </div>
              <div className="space-y-3.5">
                <TaskItem
                  icon={Stethoscope}
                  iconColor="text-blue-600"
                  title="Terminer consultation Amrani"
                  description="Compléter la note médicale et la prescription"
                  delay={0.25}
                />
                <TaskItem
                  icon={Pill}
                  iconColor="text-amber-600"
                  title="Renvoyer ordonnance Benali"
                  description="Par email et SMS"
                  delay={0.35}
                />
                <TaskItem
                  icon={AlertCircle}
                  iconColor="text-red-600"
                  title="Vérifier résultats Fathi"
                  description="Analyses sanguines reçues"
                  delay={0.45}
                />
                <TaskItem
                  icon={Clock3}
                  iconColor="text-slate-600"
                  title="Planifier RDV de suivi"
                  description="Pour 3 patients"
                  delay={0.55}
                />
              </div>
            </motion.div>
          </div>
        </div>

        {/* Subheader */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4, ease: [0.32, 0.72, 0, 1] }}
          className="mt-12 text-center"
        >
          <p className="text-slate-500 text-sm">
            Built for modern clinics · Optimized for daily use · Designed for doctors and staff
          </p>
        </motion.div>
      </div>
    </div>
  )
}
