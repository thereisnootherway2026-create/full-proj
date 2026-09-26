import { useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'

import {
  FEATURE_STORIES,
  SLUG_RESOLVER,
  FeatureStoryData,
} from '../components/storytelling/storyData'

import { StorytellingHeader } from '../components/storytelling/StorytellingHeader'
import { FeatureStoryHero } from '../components/storytelling/FeatureStoryHero'
import { ScrollProductStory } from '../components/storytelling/ScrollProductStory'
import { InteractiveProductShowcase } from '../components/storytelling/InteractiveProductShowcase'
import { RealCabinetScenario } from '../components/storytelling/RealCabinetScenario'
import { BeforeAfterComparison } from '../components/storytelling/BeforeAfterComparison'
import { OneScreenDecision } from '../components/storytelling/OneScreenDecision'
import { FeatureStoryCTA } from '../components/storytelling/FeatureStoryCTA'
import { StoryProgressIndicator } from '../components/storytelling/StoryProgressIndicator'

export default function FeaturesPage() {
  const { slug } = useParams<{ slug?: string }>()
  const navigate = useNavigate()
  const workflowRef = useRef<HTMLDivElement>(null)

  // Resolve slug alias or default to 'salle-attente'
  const resolvedSlug = slug
    ? SLUG_RESOLVER[slug] || (FEATURE_STORIES[slug] ? slug : 'salle-attente')
    : 'salle-attente'

  const currentStory: FeatureStoryData =
    FEATURE_STORIES[resolvedSlug] || FEATURE_STORIES['salle-attente']

  // Always scroll to top when switching features
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [resolvedSlug])

  const scrollToWorkflow = () => {
    if (workflowRef.current) {
      workflowRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const storySections = [
    { id: 'sec-intro', label: '01 INTRO' },
    { id: 'sec-flux', label: '02 LE FLUX' },
    { id: 'sec-demo', label: '03 DÉMONSTRATION' },
    { id: 'sec-scenario', label: '04 CAS RÉEL' },
    { id: 'sec-decision', label: '05 DÉCISION' },
  ]

  return (
    <div className="min-h-screen bg-[#fafbfc] text-slate-900 font-body relative overflow-x-hidden selection:bg-teal-100 selection:text-teal-900">
      {/* ── Subtle Canvas Pattern ─────────────────────────────────────────── */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.25]"
          style={{
            backgroundImage: 'radial-gradient(#00685f 0.65px, transparent 0.65px)',
            backgroundSize: '24px 24px',
            maskImage: 'radial-gradient(ellipse 90% 70% at 50% 10%, black 40%, transparent 90%)',
            WebkitMaskImage: 'radial-gradient(ellipse 90% 70% at 50% 10%, black 40%, transparent 90%)',
          }}
        />
      </div>

      {/* ── Sticky Top Navigation Header ───────────────────────────────────── */}
      <StorytellingHeader currentSlug={currentStory.canonicalSlug} />

      {/* ── Subtle Floating Progress Indicator ─────────────────────────────── */}
      <StoryProgressIndicator sectionIds={storySections} />

      {/* ── Main Dynamic Content Container ─────────────────────────────────── */}
      <main>
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStory.canonicalSlug}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
          >
            {/* 1. SECTION 01 — HERO */}
            <div id="sec-intro">
              <FeatureStoryHero
                story={currentStory}
                onExploreWorkflow={scrollToWorkflow}
              />
            </div>

            {/* 2. SECTION 02 — SCROLL-DRIVEN PRODUCT STORY */}
            <div id="sec-flux" ref={workflowRef} className="scroll-mt-20">
              <ScrollProductStory story={currentStory} />
            </div>

            {/* 3. SECTION 03 — INTERACTIVE PRODUCT SHOWCASE */}
            <div id="sec-demo">
              <InteractiveProductShowcase story={currentStory} />
            </div>

            {/* 4. SECTION 04 — REAL-WORLD CABINET SCENARIO */}
            <div id="sec-scenario">
              <RealCabinetScenario
                scenario={currentStory.scenario}
                featureTitle={currentStory.title}
              />
            </div>

            {/* 5. SECTION 05 — BEFORE / AFTER & SECTION 06 — ONE SCREEN */}
            <div id="sec-decision">
              <BeforeAfterComparison items={currentStory.beforeAfter} />
              <OneScreenDecision story={currentStory} />
            </div>

            {/* 6. SECTION 07/09/14 — FINAL CTA & NAVIGATION */}
            <FeatureStoryCTA
              currentSlug={currentStory.canonicalSlug}
              nextSlug={currentStory.nextSlug}
              nextLabel={currentStory.nextLabel}
            />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}
