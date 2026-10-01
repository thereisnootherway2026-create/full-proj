import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { computeIMC, validateVital } from '../../lib/vitals/validateVital'

export default memo(function VitalsGrid({ vitals, setVital, applyLast, lastVitals, when, age }) {
  const v = vitals
  const prefilled = useRef(false)

  const num = (val) => {
    const n = parseFloat(String(val ?? '').replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }

  const editInt = (key) => (e) => {
    const clean = e.target.value.replace(/\D/g, '')
    setVital(key)({ target: { value: clean } })
  }

  const editDec = (key) => (e) => {
    let clean = e.target.value.replace(/[^0-9.,]/g, '')
    const parts = clean.split(/[.,]/)
    if (parts.length > 2) {
      clean = parts[0] + (clean.includes(',') ? ',' : '.') + parts.slice(1).join('')
    }
    setVital(key)({ target: { value: clean } })
  }

  const setVal = (key, val) => applyLast(key, val)

  // Auto-prefill height from last vitals if missing
  useEffect(() => {
    if (prefilled.current || !lastVitals) return
    prefilled.current = true
    const h = lastVitals.height
    if (h == null || h === '' || String(v.height ?? '').trim() !== '') return
    if (validateVital('taille', String(h), { ageYears: age }).level !== 'ok') return
    applyLast('height', h)
  }, [lastVitals, v.height, age, applyLast])

  // Threshold calculations (TA > 140/90, T >= 38, SpO2 < 95, EVA >= 7)
  const sys = num(v.bloodPressureSystolic)
  const dia = num(v.bloodPressureDiastolic)
  const isTaAbnormal = (sys != null && sys > 140) || (dia != null && dia > 90)

  const fc = num(v.heartRate)
  const isFcAbnormal = fc != null && (fc > 100 || fc < 50)

  const temp = num(v.temperature)
  const isTempAbnormal = temp != null && temp >= 38

  const spo2 = num(v.oxygenSaturation)
  const isSpo2Abnormal = spo2 != null && spo2 > 0 && spo2 < 95

  const fr = num(v.respiratoryRate)
  const isFrAbnormal = fr != null && (fr > 24 || fr < 10)

  const weight = num(v.weight)
  const height = num(v.height)
  const imc = computeIMC(v.weight, v.height)

  const glyc = num(v.bloodSugar)
  const isGlycAbnormal = glyc != null && (glyc > 1.26 || glyc < 0.7)

  const eva = parseInt(v.painScore, 10)
  const hasEva = !isNaN(eva) && eva >= 0 && eva <= 10
  const isEvaAbnormal = hasEva && eva >= 7

  const badgeAmber = (
    <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9.5px] font-semibold text-amber-800 bg-amber-50 border border-amber-200/90">
      ▲ Inhabituel
    </span>
  )

  const [lastSys, lastDia] = String(lastVitals?.blood_pressure || '').split('/')

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 sm:p-5 space-y-4">
      {/* Header: Label top-right */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
        <span className="text-[12px] font-bold uppercase tracking-wider text-slate-700">
          Constantes
        </span>
        <span className="text-[11.5px] font-medium text-slate-500">
          Mesures d'aujourd'hui {when ? `· Référence\u202F: ${when}` : ''}
        </span>
      </div>

      {/* ROW 1: SIGNES VITAUX — 5 compact inline fields in ONE responsive row */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Signes vitaux
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {/* 1. TA */}
          <div className={`rounded-xl border p-2.5 transition-colors min-w-[130px] ${
            isTaAbnormal ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200/80 bg-white'
          }`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold uppercase text-slate-500">TA</span>
              {isTaAbnormal ? badgeAmber : (
                lastSys && (
                  <button
                    type="button"
                    onClick={() => { setVal('bloodPressureSystolic', lastSys.trim()); if (lastDia) setVal('bloodPressureDiastolic', lastDia.trim()) }}
                    className="text-[10px] text-slate-400 hover:text-[#1A56DB]"
                    title={`Rappeler dernière TA (${lastVitals?.blood_pressure})`}
                  >
                    Dern. {lastVitals?.blood_pressure}
                  </button>
                )
              )}
            </div>
            <div className="flex items-baseline gap-1 font-mono">
              <input
                type="text"
                inputMode="numeric"
                value={v.bloodPressureSystolic || ''}
                onChange={editInt('bloodPressureSystolic')}
                placeholder="120"
                className="w-11 min-w-0 bg-transparent text-[16px] font-bold text-slate-900 placeholder:text-slate-400 outline-none"
              />
              <span className="text-slate-400 font-light text-sm">/</span>
              <input
                type="text"
                inputMode="numeric"
                value={v.bloodPressureDiastolic || ''}
                onChange={editInt('bloodPressureDiastolic')}
                placeholder="80"
                className="w-11 min-w-0 bg-transparent text-[16px] font-bold text-slate-900 placeholder:text-slate-400 outline-none"
              />
              <span className="ml-auto text-[11px] text-slate-400 font-sans">mmHg</span>
            </div>
          </div>

          {/* 2. FC */}
          {/* 2. FC */}
          <div className={`rounded-xl border p-2.5 transition-colors min-w-[130px] ${
            isFcAbnormal ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200/80 bg-white'
          }`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold uppercase text-slate-500">FC</span>
              {isFcAbnormal && badgeAmber}
            </div>
            <div className="flex items-baseline justify-between font-mono">
              <input
                type="text"
                inputMode="numeric"
                value={v.heartRate || ''}
                onChange={editInt('heartRate')}
                placeholder="72"
                className="w-16 min-w-0 bg-transparent text-[16px] font-bold text-slate-900 placeholder:text-slate-400 outline-none"
              />
              <span className="text-[11px] text-slate-400 font-sans">bpm</span>
            </div>
          </div>

          {/* 3. Température */}
          <div className={`rounded-xl border p-2.5 transition-colors min-w-[130px] ${
            isTempAbnormal ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200/80 bg-white'
          }`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold uppercase text-slate-500">T°</span>
              {isTempAbnormal && badgeAmber}
            </div>
            <div className="flex items-baseline justify-between font-mono">
              <input
                type="text"
                inputMode="decimal"
                value={v.temperature || ''}
                onChange={editDec('temperature')}
                placeholder="37,0"
                className="w-16 min-w-0 bg-transparent text-[16px] font-bold text-slate-900 placeholder:text-slate-400 outline-none"
              />
              <span className="text-[11px] text-slate-400 font-sans">°C</span>
            </div>
          </div>

          {/* 4. SpO2 */}
          <div className={`rounded-xl border p-2.5 transition-colors min-w-[130px] ${
            isSpo2Abnormal ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200/80 bg-white'
          }`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold uppercase text-slate-500">SpO₂</span>
              {isSpo2Abnormal && badgeAmber}
            </div>
            <div className="flex items-baseline justify-between font-mono">
              <input
                type="text"
                inputMode="numeric"
                value={v.oxygenSaturation || ''}
                onChange={editInt('oxygenSaturation')}
                placeholder="98"
                className="w-16 min-w-0 bg-transparent text-[16px] font-bold text-slate-900 placeholder:text-slate-400 outline-none"
              />
              <span className="text-[11px] text-slate-400 font-sans">%</span>
            </div>
          </div>

          {/* 5. FR */}
          <div className={`rounded-xl border p-2.5 transition-colors min-w-[130px] ${
            isFrAbnormal ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200/80 bg-white'
          }`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold uppercase text-slate-500">FR</span>
              {isFrAbnormal && badgeAmber}
            </div>
            <div className="flex items-baseline justify-between font-mono">
              <input
                type="text"
                inputMode="numeric"
                value={v.respiratoryRate || ''}
                onChange={editInt('respiratoryRate')}
                placeholder="16"
                className="w-16 min-w-0 bg-transparent text-[16px] font-bold text-slate-900 placeholder:text-slate-400 outline-none"
              />
              <span className="text-[11px] text-slate-400 font-sans">/min</span>
            </div>
          </div>
        </div>
      </div>

      {/* ROW 2: MORPHOLOGIE & MÉTABOLISME */}
      <div className="space-y-1.5 pt-1 border-t border-slate-100">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Morphologie & métabolisme
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {/* 1. Poids */}
          <div className="rounded-xl border border-slate-200/80 bg-white p-2.5 min-w-[130px]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold uppercase text-slate-500">Poids</span>
            </div>
            <div className="flex items-baseline justify-between font-mono">
              <input
                type="text"
                inputMode="decimal"
                value={v.weight || ''}
                onChange={editDec('weight')}
                placeholder="70,5"
                className="w-16 min-w-0 bg-transparent text-[16px] font-bold text-slate-900 placeholder:text-slate-400 outline-none"
              />
              <span className="text-[11px] text-slate-400 font-sans">kg</span>
            </div>
          </div>

          {/* 2. Taille */}
          <div className="rounded-xl border border-slate-200/80 bg-white p-2.5 min-w-[130px]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold uppercase text-slate-500">Taille</span>
              {lastVitals?.height && (
                <button
                  type="button"
                  onClick={() => setVal('height', String(lastVitals.height))}
                  className="text-[10px] text-slate-400 hover:text-[#1A56DB]"
                  title={`Utiliser dernière taille (${lastVitals.height} cm)`}
                >
                  Dern. {lastVitals.height}
                </button>
              )}
            </div>
            <div className="flex items-baseline justify-between font-mono">
              <input
                type="text"
                inputMode="numeric"
                value={v.height || ''}
                onChange={editInt('height')}
                placeholder="170"
                className="w-16 min-w-0 bg-transparent text-[16px] font-bold text-slate-900 placeholder:text-slate-400 outline-none"
              />
              <span className="text-[11px] text-slate-400 font-sans">cm</span>
            </div>
          </div>

          {/* 3. IMC (Auto-calculated with "Calculé" badge) */}
          <div className={`rounded-xl border p-2.5 min-w-[130px] transition-colors ${
            imc != null
              ? 'border-blue-200 bg-blue-50/30'
              : 'border-slate-200/80 bg-slate-50/70 opacity-80'
          }`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold uppercase text-slate-500">IMC</span>
              {imc != null ? (
                <span className="rounded bg-blue-100 px-1.5 py-0.2 text-[9.5px] font-semibold text-[#1A56DB]">
                  Calculé
                </span>
              ) : (
                <span className="text-[10px] text-slate-400 font-sans">requis</span>
              )}
            </div>
            <div className="flex items-baseline justify-between font-mono">
              <span className={`text-[16px] font-bold ${imc != null ? 'text-slate-900' : 'text-slate-400'}`}>
                {imc != null ? String(imc).replace('.', ',') : '—'}
              </span>
              <span className="text-[11px] text-slate-400 font-sans">kg/m²</span>
            </div>
          </div>

          {/* 4. Glycémie */}
          <div className={`rounded-xl border p-2.5 transition-colors min-w-[130px] ${
            isGlycAbnormal ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200/80 bg-white'
          }`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold uppercase text-slate-500">Glycémie</span>
              {isGlycAbnormal && badgeAmber}
            </div>
            <div className="flex items-baseline justify-between font-mono">
              <input
                type="text"
                inputMode="decimal"
                value={v.bloodSugar || ''}
                onChange={editDec('bloodSugar')}
                placeholder="1,05"
                className="w-16 min-w-0 bg-transparent text-[16px] font-bold text-slate-900 placeholder:text-slate-400 outline-none"
              />
              <span className="text-[11px] text-slate-400 font-sans">g/L</span>
            </div>
          </div>

          {/* 5. Douleur EVA */}
          <div className={`rounded-xl border p-2.5 transition-colors min-w-[130px] ${
            isEvaAbnormal ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200/80 bg-white'
          }`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold uppercase text-slate-500">Douleur EVA</span>
              {isEvaAbnormal && badgeAmber}
            </div>
            <div className="flex items-baseline justify-between mb-1 font-mono">
              <span className="text-[16px] font-bold text-slate-900">
                {hasEva ? eva : '—'}
              </span>
              <span className="text-[11px] text-slate-400 font-sans">/ 10</span>
            </div>
            <div
              role="radiogroup"
              aria-label="Échelle visuelle analogique de la douleur"
              className="flex flex-wrap gap-0.5 justify-between"
              onKeyDown={(e) => {
                const current = hasEva ? eva : 0
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                  e.preventDefault()
                  const next = hasEva ? Math.min(10, current + 1) : 0
                  setVal('painScore', String(next))
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                  e.preventDefault()
                  const prev = hasEva ? Math.max(0, current - 1) : 0
                  setVal('painScore', String(prev))
                }
              }}
            >
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => {
                const isSelected = hasEva && eva === score
                return (
                  <button
                    key={score}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    tabIndex={isSelected ? 0 : -1}
                    onClick={() => setVal('painScore', isSelected ? '' : String(score))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setVal('painScore', isSelected ? '' : String(score))
                      }
                    }}
                    className={`h-5 w-4 rounded text-[10px] font-bold transition-all flex items-center justify-center border ${
                      isSelected
                        ? 'bg-[#1A56DB] text-white border-[#1A56DB] font-bold shadow-2xs'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {score}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})
