import { useEffect, useRef, useState } from 'react'
import { BloodPressureField, ComputedField, VitalField } from './ConsultationFields'
import { vitalFlag } from '../../lib/vitalsRanges'
import { computeIMC, validateVital } from '../../lib/vitals/validateVital'

const GROUP = { bloodPressureSystolic: 'bloodPressure', bloodPressureDiastolic: 'bloodPressure' }
const groupOf = (key) => GROUP[key] || key

// Today's vitals. Fixed field order (nothing jumps while typing), two rows at
// desktop width. Hierarchy is visual: missing = dashed and quiet, normal =
// recedes, abnormal = red left border + tag, impossible (validateVital error) =
// red with the reason, unusual (warn) = amber until "Confirmer".
// A value copied with "Utiliser" carries a "Valeur reportée" tag until edited.
// Taille is prefilled from the last valid measurement ("dernière valeur");
// Poids is never prefilled: it is measured at every visit.
export default function VitalsGrid({ vitals, setVital, applyLast, lastVitals, when, age, review = {}, onConfirm }) {
  const v = vitals
  const [reported, setReported] = useState({})
  const prefilled = useRef(false)
  const flag = (key) => vitalFlag(key, v, age)
  const last = (raw, suffix) => (raw != null && raw !== '' ? { text: `${raw}${suffix}`, when } : null)
  const [lastSys, lastDia] = String(lastVitals?.blood_pressure || '').split('/')
  const tag = when || 'visite précédente'
  const imc = computeIMC(v.weight, v.height)

  const clear = (group) => setReported((r) => {
    if (!(group in r)) return r
    const next = { ...r }
    delete next[group]
    return next
  })
  const edit = (key) => (e) => { clear(groupOf(key)); return setVital(key)(e) }
  const use = (group, apply) => () => { apply(); setReported((r) => ({ ...r, [group]: tag })) }
  const fix = (key) => (value) => { clear(key); applyLast(key, value) }
  const confirm = (key) => () => onConfirm?.(key)

  // One-time Taille prefill, only from a plausible last value (never copies an
  // impossible one such as the "20 cm" test data).
  useEffect(() => {
    if (prefilled.current || !lastVitals) return
    prefilled.current = true
    const h = lastVitals.height
    if (h == null || h === '' || String(v.height ?? '').trim() !== '') return
    if (validateVital('taille', String(h), { ageYears: age }).level !== 'ok') return
    applyLast('height', h)
    setReported((r) => ({ ...r, height: 'dernière valeur' }))
  }, [lastVitals, v.height, age, applyLast])

  const common = (key) => ({ check: review[key], onConfirm: confirm(key) })

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">
      <BloodPressureField systolic={v.bloodPressureSystolic} diastolic={v.bloodPressureDiastolic}
        onSystolicChange={edit('bloodPressureSystolic')} onDiastolicChange={edit('bloodPressureDiastolic')}
        flag={flag('bloodPressure')} reported={reported.bloodPressure} previousSystolic={lastSys}
        last={lastVitals?.blood_pressure ? { text: `${lastVitals.blood_pressure}`, when } : null}
        onUseLast={use('bloodPressure', () => { if (lastSys && lastDia) { applyLast('bloodPressureSystolic', lastSys.trim()); applyLast('bloodPressureDiastolic', lastDia.trim()) } })}
        check={review.bloodPressure} onConfirm={confirm('bloodPressure')} />
      <VitalField label="FC" unit="bpm" value={v.heartRate} onChange={edit('heartRate')} placeholder="ex. 72" {...common('heartRate')} onApplySuggestion={fix('heartRate')}
        flag={flag('heartRate')} reported={reported.heartRate} previous={lastVitals?.heart_rate} last={last(lastVitals?.heart_rate, ' bpm')}
        onUseLast={use('heartRate', () => applyLast('heartRate', lastVitals.heart_rate))} />
      <VitalField label="Température" unit="°C" value={v.temperature} onChange={edit('temperature')} placeholder="ex. 37" {...common('temperature')} onApplySuggestion={fix('temperature')}
        flag={flag('temperature')} reported={reported.temperature} previous={lastVitals?.temperature} last={last(lastVitals?.temperature, ' °C')}
        onUseLast={use('temperature', () => applyLast('temperature', lastVitals.temperature))} />
      <VitalField label="SpO₂" unit="%" value={v.oxygenSaturation} onChange={edit('oxygenSaturation')} placeholder="ex. 98" {...common('oxygenSaturation')} onApplySuggestion={fix('oxygenSaturation')}
        flag={flag('oxygenSaturation')} reported={reported.oxygenSaturation} previous={lastVitals?.spo2} last={last(lastVitals?.spo2, ' %')}
        onUseLast={use('oxygenSaturation', () => applyLast('oxygenSaturation', lastVitals.spo2))} />
      <VitalField label="FR" unit="/min" value={v.respiratoryRate} onChange={edit('respiratoryRate')} placeholder="ex. 16" {...common('respiratoryRate')} onApplySuggestion={fix('respiratoryRate')}
        reported={reported.respiratoryRate} previous={lastVitals?.fr} last={last(lastVitals?.fr, ' /min')}
        onUseLast={use('respiratoryRate', () => applyLast('respiratoryRate', lastVitals.fr))} />
      {/* Poids: measured each visit, so the last value is a hint only (no "Utiliser"). */}
      <VitalField label="Poids" unit="kg" value={v.weight} onChange={edit('weight')} placeholder="ex. 70" {...common('weight')} onApplySuggestion={fix('weight')}
        reported={reported.weight} previous={lastVitals?.weight} last={last(lastVitals?.weight, ' kg')} />
      <VitalField label="Taille" unit="cm" value={v.height} onChange={edit('height')} placeholder="ex. 170" {...common('height')} onApplySuggestion={fix('height')}
        reported={reported.height} previous={lastVitals?.height} last={last(lastVitals?.height, ' cm')}
        onUseLast={use('height', () => applyLast('height', lastVitals.height))} />
      <ComputedField label="IMC" value={imc} unit="kg/m²" hint={imc == null ? 'poids et taille valides requis' : 'calculé'} />
      <VitalField label="Glycémie capillaire" unit="g/L" value={v.bloodSugar} onChange={edit('bloodSugar')} placeholder="ex. 1,05" {...common('bloodSugar')} onApplySuggestion={fix('bloodSugar')}
        reported={reported.bloodSugar} previous={lastVitals?.blood_sugar} last={last(lastVitals?.blood_sugar, ' g/L')}
        onUseLast={use('bloodSugar', () => applyLast('bloodSugar', lastVitals.blood_sugar))} />
      <VitalField label="Douleur (EVA)" unit="/10" value={v.painScore} onChange={edit('painScore')} placeholder="0 à 10" {...common('painScore')}
        reported={reported.painScore} previous={lastVitals?.douleur_eva} last={last(lastVitals?.douleur_eva, '/10')} />
    </div>
  )
}
