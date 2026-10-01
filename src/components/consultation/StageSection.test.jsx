import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import StageSection from './StageSection'

describe('StageSection component (Round 9 Single-Viewport Model)', () => {
  it('renders null when isExpanded is false (collapsed summary card completely removed)', () => {
    const html = renderToStaticMarkup(
      <StageSection
        id="subjectif"
        index={1}
        title="Motif & symptômes"
        isExpanded={false}
        summary="Douleur lombaire"
      >
        <p>Section Content</p>
      </StageSection>
    )

    expect(html).toBe('')
    expect(html).not.toContain('Éditer')
    expect(html).not.toContain('Douleur lombaire')
  })

  it('renders full section when isExpanded is true', () => {
    const html = renderToStaticMarkup(
      <StageSection
        id="subjectif"
        index={1}
        title="Motif & symptômes"
        isExpanded={true}
        status="en_cours"
      >
        <p>Section Content</p>
      </StageSection>
    )

    expect(html).toContain('id="subjectif"')
    expect(html).toContain('1 · Motif &amp; symptômes')
    expect(html).toContain('EN COURS')
    expect(html).toContain('Section Content')
  })

  it('renders status chip inside expanded section header only', () => {
    const htmlValide = renderToStaticMarkup(
      <StageSection
        id="objectif"
        index={2}
        title="Examen clinique"
        isExpanded={true}
        status="valide"
        isValidated={true}
      >
        <p>Examen</p>
      </StageSection>
    )
    expect(htmlValide).toContain('VALIDÉ')

    const htmlCompleter = renderToStaticMarkup(
      <StageSection
        id="plan"
        index={3}
        title="Évaluation & conduite"
        isExpanded={true}
        status="a_completer"
        isValidated={false}
      >
        <p>Plan</p>
      </StageSection>
    )
    expect(htmlCompleter).toContain('À COMPLÉTER')
  })

  it('verifies single-mounted section model: only the active section produces markup', () => {
    const activeSection = 2

    const markupSection1 = renderToStaticMarkup(
      <StageSection id="s1" index={1} title="Motif" isExpanded={activeSection === 1}>
        <div>Section 1 Body</div>
      </StageSection>
    )

    const markupSection2 = renderToStaticMarkup(
      <StageSection id="s2" index={2} title="Examen" isExpanded={activeSection === 2}>
        <div>Section 2 Body</div>
      </StageSection>
    )

    const markupSection3 = renderToStaticMarkup(
      <StageSection id="s3" index={3} title="Plan" isExpanded={activeSection === 3}>
        <div>Section 3 Body</div>
      </StageSection>
    )

    expect(markupSection1).toBe('')
    expect(markupSection2).toContain('Section 2 Body')
    expect(markupSection3).toBe('')
  })
})

describe('Pill navigation and state calculations', () => {
  const computePillStates = (note) => {
    const s1Completed = Boolean(note.motif?.trim())
    const s1RequiredEmpty = !s1Completed

    const s2HasContent = Boolean(
      note.examen?.trim() ||
      Object.values(note.vitals || {}).some((v) => v !== undefined && v !== null && String(v).trim() !== '')
    )

    const s3HasContent = Boolean(
      (note.diagnostics || []).filter(Boolean).length > 0 ||
      note.conduite?.trim() ||
      (note.traitements || []).some((t) => t.medicament?.trim()) ||
      (note.examens || []).length > 0 ||
      (note.documents || []).length > 0 ||
      note.followUpDate
    )

    return { s1Completed, s1RequiredEmpty, s2HasContent, s3HasContent }
  }

  it('marks Section 1 as required-empty when motif is blank', () => {
    const emptyNote = { motif: '   ', vitals: {}, examens: [] }
    const states = computePillStates(emptyNote)
    expect(states.s1RequiredEmpty).toBe(true)
    expect(states.s1Completed).toBe(false)
  })

  it('marks Section 1 as completed when motif is filled', () => {
    const filledNote = { motif: 'Céphalées et fièvre', vitals: {}, examens: [] }
    const states = computePillStates(filledNote)
    expect(states.s1RequiredEmpty).toBe(false)
    expect(states.s1Completed).toBe(true)
  })

  it('detects content in Section 2 from vitals or examen text', () => {
    const noteWithVital = { vitals: { temperature: '38.5' } }
    expect(computePillStates(noteWithVital).s2HasContent).toBe(true)

    const noteWithExam = { vitals: {}, examen: 'Auscultation normale' }
    expect(computePillStates(noteWithExam).s2HasContent).toBe(true)

    const noteWithoutExam = { vitals: {}, examen: '' }
    expect(computePillStates(noteWithoutExam).s2HasContent).toBe(false)
  })

  it('detects content in Section 3 from treatments, diagnostics or follow-up', () => {
    const noteEmpty = {}
    expect(computePillStates(noteEmpty).s3HasContent).toBe(false)

    const noteWithDiag = { diagnostics: ['Rhinopharyngite'] }
    expect(computePillStates(noteWithDiag).s3HasContent).toBe(true)

    const noteWithTreatment = { traitements: [{ medicament: 'Paracétamol 1g' }] }
    expect(computePillStates(noteWithTreatment).s3HasContent).toBe(true)

    const noteWithFollowUp = { followUpDate: '2026-10-15' }
    expect(computePillStates(noteWithFollowUp).s3HasContent).toBe(true)
  })
})
