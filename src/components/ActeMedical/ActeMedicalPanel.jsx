import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"

const ACTES = [
  { label: "Suture simple", code: "KMBD001", tarif: 250 },
  { label: "Pansement", code: "KMBD002", tarif: 80 },
  { label: "Injection IM/IV", code: "KMBD003", tarif: 45 },
  { label: "Vaccination", code: "KMBD004", tarif: 120 },
  { label: "Electrocardiogramme", code: "KMBD005", tarif: 180 },
  { label: "Bilan biologique sanguin", code: "KMBD006", tarif: 320 },
  { label: "Consultation courte", code: "KMBD007", tarif: 150 },
]

const HISTORIQUE = [
  { id: 1, nom: "Electrocardiogramme", code: "KMBD005", date: "03/08/2026", tarif: 180, reste: 36, status: "rembourse" },
  { id: 2, nom: "Bilan biologique sanguin", code: "KMBD006", date: "21/07/2026", tarif: 320, reste: 64, status: "rembourse" },
  { id: 3, nom: "Injection IM/IV", code: "KMBD003", date: "10/07/2026", tarif: 45, reste: 9, status: "attente" },
  { id: 4, nom: "Pansement", code: "KMBD002", date: "28/06/2026", tarif: 80, reste: 16, status: "attente" },
]

// ─── Icons ────────────────────────────────────────────────────────────────────
function IcoClose() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function IcoClock() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5.75" stroke="currentColor" strokeWidth="1.35" />
      <path d="M7 4.25v3l1.75 1.25" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IcoSave() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="4.5" y="1.5" width="7" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3.5" y="8.5" width="9" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function IcoUpload() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M12 16V7M8 10.5l4-4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 18h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function IcoCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" fill="#22C55E" />
      <path d="M5 8l2 2 4-4" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IcoDoc() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="2" y="1" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.5 4.5h5M4.5 7h5M4.5 9.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

// ─── Button helpers ───────────────────────────────────────────────────────────
function PrimaryBtn({ children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex", alignItems: "center", gap: "6px",
        background: disabled ? "#93C5FD" : "#2563EB",
        color: "#fff", fontSize: "14px", fontWeight: 500,
        padding: "10px 18px", borderRadius: "10px", border: "none",
        boxShadow: disabled ? "none" : "0 2px 8px rgba(37,99,235,0.25)",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.15s ease", fontFamily: "inherit",
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.background = "#1D4ED8"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(37,99,235,0.35)"; e.currentTarget.style.transform = "translateY(-1px)" } }}
      onMouseLeave={(e) => { if (!disabled) { e.currentTarget.style.background = "#2563EB"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(37,99,235,0.25)"; e.currentTarget.style.transform = "none" } }}
      onMouseDown={(e) => { if (!disabled) { e.currentTarget.style.transform = "scale(0.98)"; e.currentTarget.style.boxShadow = "0 1px 4px rgba(37,99,235,0.2)" } }}
      onMouseUp={(e) => { if (!disabled) { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(37,99,235,0.35)" } }}
    >
      {children}
    </button>
  )
}

function CancelBtn({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: "6px",
        background: "#fff", color: "#1E293B", fontSize: "14px", fontWeight: 500,
        padding: "10px 18px", borderRadius: "10px", border: "1px solid #E2E8F0",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)", cursor: "pointer",
        transition: "all 0.15s ease", fontFamily: "inherit",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "#FEF2F2"; e.currentTarget.style.borderColor = "#FECACA"; e.currentTarget.style.color = "#DC2626"; e.currentTarget.style.transform = "translateY(-1px)" }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#E2E8F0"; e.currentTarget.style.color = "#1E293B"; e.currentTarget.style.transform = "none" }}
      onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.98)" }}
      onMouseUp={(e) => { e.currentTarget.style.transform = "translateY(-1px)" }}
    >
      {children}
    </button>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatusChip({ status }) {
  const ok = status === "rembourse"
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      background: ok ? "#F0FDF4" : "#FFFBEB",
      color: ok ? "#16A34A" : "#D97706",
      borderRadius: "6px", padding: "3px 8px",
      fontSize: "11px", fontWeight: 500,
    }}>
      {ok ? "Rembours\u00e9" : "En attente"}
    </span>
  )
}

function CoverageCard({ tarif, taux }) {
  const pris = Math.round(tarif * taux / 100)
  const reste = tarif - pris
  return (
    <div style={{ border: "1px solid #E2E8F0", borderRadius: "12px", padding: "14px 16px", background: "#FAFBFF", display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "12px", fontWeight: 500, color: "#64748B" }}>Prise en charge mutuelle CNSS/CNOPS</span>
        <span style={{ fontSize: "13px", fontWeight: 600, color: "#2563EB" }}>{taux}%</span>
      </div>
      <div style={{ height: "6px", background: "#E2E8F0", borderRadius: "99px", overflow: "hidden" }}>
        <div style={{ height: "100%", width: taux + "%", background: "#2563EB", borderRadius: "99px", transition: "width 0.4s ease" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
        <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: "8px", padding: "10px 12px" }}>
          <p style={{ fontSize: "11px", fontWeight: 500, color: "#16A34A", margin: "0 0 4px" }}>Pris en charge</p>
          <p style={{ fontSize: "15px", fontWeight: 700, color: "#1E293B", margin: 0 }}>{pris.toLocaleString("fr-FR")} MAD</p>
        </div>
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "8px", padding: "10px 12px" }}>
          <p style={{ fontSize: "11px", fontWeight: 500, color: "#DC2626", margin: "0 0 4px" }}>Reste \u00e0 charge patient</p>
          <p style={{ fontSize: "15px", fontWeight: 700, color: "#DC2626", margin: 0 }}>{reste.toLocaleString("fr-FR")} MAD</p>
        </div>
      </div>
    </div>
  )
}

function FormField({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <label style={{ fontSize: "12px", fontWeight: 500, color: "#64748B", letterSpacing: "0.01em" }}>{label}</label>
      {children}
    </div>
  )
}

const IS = (extra) => ({
  width: "100%", padding: "10px 12px", borderRadius: "10px",
  border: "1px solid #E2E8F0", fontSize: "14px", color: "#1E293B",
  background: "#fff", outline: "none", fontFamily: "inherit",
  boxSizing: "border-box", transition: "border-color 0.15s, box-shadow 0.15s",
  ...extra,
})

const onFocus = (e) => { e.target.style.borderColor = "#93C5FD"; e.target.style.boxShadow = "0 0 0 2px #BFDBFE" }
const onBlur  = (e) => { e.target.style.borderColor = "#E2E8F0"; e.target.style.boxShadow = "none" }

// ─── Main export ──────────────────────────────────────────────────────────────
export default function ActeMedicalPanel({ isOpen, onClose, patient }) {
  // Support both `isOpen` (new API) and `open` (legacy) prop names
  const open = isOpen ?? false

  const p = patient || { nom: "Elbachir Ilyas", age: 46, mutuelle: "CNSS/CNOPS 80%", tauxCouverture: 0.80 }
  // Normalise coverage: accept 0-1 decimal or 0-100 integer
  const taux = p.tauxCouverture != null
    ? (p.tauxCouverture <= 1 ? Math.round(p.tauxCouverture * 100) : p.tauxCouverture)
    : (p.taux ?? 80)

  const [activeTab, setActiveTab]       = useState("nouvel")
  const [selectedCode, setSelectedCode] = useState("")
  const [tarif, setTarif]               = useState("")
  const [codeReadonly, setCodeReadonly] = useState("")
  const [date, setDate]                 = useState(() => new Date().toISOString().split("T")[0])
  const [notes, setNotes]               = useState("")
  const [dragOver, setDragOver]         = useState(false)
  const [files, setFiles]               = useState([])
  const [showToast, setShowToast]       = useState(false)
  const fileRef                         = useRef(null)

  useEffect(() => {
    if (open) {
      setActiveTab("nouvel")
      setSelectedCode("")
      setTarif("")
      setCodeReadonly("")
      setDate(new Date().toISOString().split("T")[0])
      setNotes("")
      setFiles([])
      setShowToast(false)
    }
  }, [open])

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape" && open) onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onClose])

  const handleActeChange = (e) => {
    const code = e.target.value
    setSelectedCode(code)
    const found = ACTES.find((a) => a.code === code)
    if (found) { setCodeReadonly(found.code); setTarif(found.tarif) }
    else        { setCodeReadonly("");         setTarif("") }
  }

  const handleSave = () => {
    setShowToast(true)
    setTimeout(() => { setShowToast(false); setTimeout(onClose, 200) }, 1500)
  }

  const addFiles = (fl) => setFiles((prev) => [...prev, ...Array.from(fl)])
  const canSave  = Boolean(selectedCode && tarif)

  const SVG_CHEVRON = "url(\"data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2394A3B8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")"

  const panel = (
    <AnimatePresence>
      {open && (
        <>
          {/* Overlay */}
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", zIndex: 1000 }}
          />

          {/* Panel */}
          <motion.div
            key="panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{
              position: "fixed", top: 0, right: 0, bottom: 0, width: "440px",
              background: "#fff", boxShadow: "-4px 0 24px rgba(0,0,0,0.08)",
              zIndex: 1001, display: "flex", flexDirection: "column",
              fontFamily: "'Inter', -apple-system, sans-serif", overflow: "hidden",
            }}
          >
            {/* Header */}
            <div style={{ padding: "20px 24px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexShrink: 0 }}>
              <div>
                <h2 style={{ fontSize: "17px", fontWeight: 600, color: "#1E293B", margin: 0, lineHeight: 1.3 }}>Acte m\u00e9dical</h2>
                <p style={{ fontSize: "12px", color: "#94A3B8", margin: "3px 0 0", fontWeight: 400 }}>
                  {p.prenom ? p.prenom + " " + p.nom : p.nom} \u00b7 {p.age} ans \u00b7 {p.mutuelle ?? p.couverture}
                </p>
              </div>
              <button
                onClick={onClose}
                title="Fermer"
                style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "8px", border: "none", background: "transparent", color: "#94A3B8", cursor: "pointer", transition: "all 0.15s", flexShrink: 0 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#F1F5F9"; e.currentTarget.style.color = "#1E293B" }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#94A3B8" }}
              >
                <IcoClose />
              </button>
            </div>

            {/* Divider */}
            <div style={{ height: "1px", background: "#F1F5F9", margin: "16px 0 0", flexShrink: 0 }} />

            {/* Tabs */}
            <div style={{ display: "flex", padding: "0 24px", borderBottom: "1px solid #F1F5F9", flexShrink: 0 }}>
              {[
                { id: "nouvel",     label: "Nouvel acte",  icon: null },
                { id: "historique", label: "Historique",   icon: <IcoClock /> },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    padding: "12px 4px", marginRight: "20px",
                    background: "none", border: "none",
                    borderBottom: activeTab === t.id ? "2px solid #1E293B" : "2px solid transparent",
                    cursor: "pointer", fontSize: "14px",
                    fontWeight: activeTab === t.id ? 500 : 400,
                    color: activeTab === t.id ? "#1E293B" : "#94A3B8",
                    fontFamily: "inherit", transition: "color 0.15s", outline: "none",
                  }}
                  onMouseEnter={(e) => { if (activeTab !== t.id) e.currentTarget.style.color = "#64748B" }}
                  onMouseLeave={(e) => { if (activeTab !== t.id) e.currentTarget.style.color = "#94A3B8" }}
                >
                  {t.icon && <span>{t.icon}</span>}
                  {t.label}
                </button>
              ))}
            </div>

            {/* Scrollable body */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>

              {/* Nouvel acte tab */}
              {activeTab === "nouvel" && (
                <>
                  {/* Type d'acte */}
                  <FormField label="Type d'acte">
                    <select
                      value={selectedCode}
                      onChange={handleActeChange}
                      onFocus={onFocus}
                      onBlur={onBlur}
                      style={IS({
                        appearance: "none", WebkitAppearance: "none",
                        cursor: "pointer", paddingRight: "36px",
                        backgroundImage: SVG_CHEVRON,
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "right 12px center",
                      })}
                    >
                      <option value="">S\u00e9lectionner un acte\u2026</option>
                      {ACTES.map((a) => (
                        <option key={a.code} value={a.code}>
                          {a.label} \u2014 {a.code} \u2014 {a.tarif} MAD
                        </option>
                      ))}
                    </select>
                  </FormField>

                  {/* Code + Tarif */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <FormField label="Code CNSS">
                      <input
                        readOnly
                        value={codeReadonly}
                        placeholder="Auto-rempli"
                        style={IS({ background: "#F8FAFC", color: "#94A3B8", cursor: "default" })}
                      />
                    </FormField>
                    <FormField label="Tarif conventionn\u00e9 (MAD)">
                      <input
                        type="number"
                        value={tarif}
                        onChange={(e) => setTarif(e.target.value)}
                        placeholder="0"
                        style={IS()}
                        onFocus={onFocus}
                        onBlur={onBlur}
                      />
                    </FormField>
                  </div>

                  {/* Date */}
                  <FormField label="Date de r\u00e9alisation">
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      style={IS()}
                      onFocus={onFocus}
                      onBlur={onBlur}
                    />
                  </FormField>

                  {/* Coverage card */}
                  {Number(tarif) > 0 && <CoverageCard tarif={Number(tarif)} taux={taux} />}

                  {/* Notes */}
                  <FormField label="Notes cliniques (optionnel)">
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Observations, remarques cliniques\u2026"
                      rows={3}
                      style={IS({ resize: "vertical", lineHeight: 1.5, minHeight: "80px" })}
                      onFocus={onFocus}
                      onBlur={onBlur}
                    />
                  </FormField>

                  {/* Dropzone */}
                  <FormField label="Pi\u00e8ces jointes">
                    <div
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files) }}
                      onClick={() => fileRef.current && fileRef.current.click()}
                      style={{
                        border: "2px dashed " + (dragOver ? "#93C5FD" : "#E2E8F0"),
                        borderRadius: "10px", padding: "20px",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: "6px",
                        cursor: "pointer", background: dragOver ? "#EFF6FF" : "#FAFBFC",
                        transition: "all 0.15s",
                      }}
                    >
                      <span style={{ color: "#94A3B8" }}><IcoUpload /></span>
                      <p style={{ fontSize: "13px", color: "#64748B", textAlign: "center", margin: 0 }}>
                        Glisser un fichier ou{" "}
                        <span style={{ color: "#2563EB", fontWeight: 500 }}>cliquer pour parcourir</span>
                      </p>
                      <input
                        ref={fileRef}
                        type="file"
                        multiple
                        style={{ display: "none" }}
                        onChange={(e) => addFiles(e.target.files)}
                      />
                    </div>

                    {files.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "6px" }}>
                        {files.map((f, i) => (
                          <div
                            key={i}
                            style={{
                              display: "flex", alignItems: "center", justifyContent: "space-between",
                              padding: "6px 10px", background: "#F8FAFC", borderRadius: "8px",
                              fontSize: "12px", color: "#64748B",
                            }}
                          >
                            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <IcoDoc /> {f.name}
                            </span>
                            <button
                              onClick={(e) => { e.stopPropagation(); setFiles((prev) => prev.filter((_, j) => j !== i)) }}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8", padding: "2px", display: "flex", alignItems: "center" }}
                            >
                              <IcoClose />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </FormField>
                </>
              )}

              {/* Historique tab */}
              {activeTab === "historique" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {HISTORIQUE.map((a) => (
                    <div
                      key={a.id}
                      style={{
                        border: "1px solid #E2E8F0", borderRadius: "12px", padding: "14px 16px",
                        background: "#fff", display: "flex", justifyContent: "space-between",
                        alignItems: "center", transition: "box-shadow 0.15s, border-color 0.15s", cursor: "default",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 2px 10px rgba(0,0,0,0.06)"; e.currentTarget.style.borderColor = "#CBD5E1" }}
                      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderColor = "#E2E8F0" }}
                    >
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <span style={{ fontSize: "14px", fontWeight: 500, color: "#1E293B" }}>{a.nom}</span>
                          <StatusChip status={a.status} />
                        </div>
                        <span style={{ fontSize: "12px", color: "#94A3B8" }}>{a.code} \u00b7 {a.date}</span>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0, marginLeft: "12px" }}>
                        <p style={{ fontSize: "14px", fontWeight: 600, color: "#1E293B", margin: 0 }}>{a.tarif.toLocaleString("fr-FR")} MAD</p>
                        <p style={{ fontSize: "12px", color: "#94A3B8", margin: "2px 0 0" }}>Reste: {a.reste} MAD</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {activeTab === "nouvel" && (
              <div style={{ padding: "16px 24px", borderTop: "1px solid #F1F5F9", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, background: "#fff" }}>
                <CancelBtn onClick={onClose}>
                  <span style={{ color: "#64748B", display: "flex" }}><IcoClose /></span>
                  Annuler
                </CancelBtn>
                <PrimaryBtn onClick={handleSave} disabled={!canSave}>
                  <IcoSave />
                  Enregistrer l&apos;acte
                </PrimaryBtn>
              </div>
            )}

            {/* Toast */}
            <AnimatePresence>
              {showToast && (
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 20, opacity: 0 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  style={{
                    position: "absolute", bottom: "20px", left: "50%", transform: "translateX(-50%)",
                    background: "#1E293B", color: "#fff", fontSize: "13px", fontWeight: 500,
                    padding: "10px 16px", borderRadius: "10px",
                    display: "flex", alignItems: "center", gap: "8px",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.18)", zIndex: 10, whiteSpace: "nowrap",
                  }}
                >
                  <IcoCheck />
                  Acte enregistr\u00e9 avec succ\u00e8s
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  return createPortal(panel, document.body)
}