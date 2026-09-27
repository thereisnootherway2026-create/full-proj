import React, { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  MotionConfig,
  animate,
  motion,
  useInView,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import { features, getFeature, type Feature, type FeatureOutcome } from '../../data/features';

const ease = [0.22, 1, 0.36, 1] as const;

const reveal = {
  initial: { opacity: 0, y: 32 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.5 },
  transition: { duration: 0.8, ease },
};

/* Each word lights up as the sentence scrolls through the viewport. */
const ScrollWord = ({ word, progress, range }: { word: string; progress: MotionValue<number>; range: [number, number] }) => {
  const opacity = useTransform(progress, range, [0.12, 1]);
  return (
    <motion.span style={{ opacity }} className="inline-block mr-[0.28em]">
      {word}
    </motion.span>
  );
};

const ScrollStory = ({ text }: { text: string }) => {
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.85', 'end 0.5'] });
  const words = text.split(' ');
  return (
    <p ref={ref} className="font-headline text-4xl md:text-6xl font-semibold leading-[1.2] text-[#0f172a] tracking-tight">
      {words.map((w, i) => (
        <ScrollWord key={i} word={w} progress={scrollYProgress} range={[i / words.length, (i + 1) / words.length]} />
      ))}
    </p>
  );
};

const CountUp = ({ outcome }: { outcome: FeatureOutcome }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, outcome.value, {
      duration: 1.6,
      ease: 'easeOut',
      onUpdate: (v) => setValue(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, outcome.value]);

  return (
    <span ref={ref}>
      {value}
      <span className="text-[#14b8a6]">{outcome.suffix}</span>
    </span>
  );
};

const FeatureStory = ({ feature }: { feature: Feature }) => {
  const navigate = useNavigate();

  const stepsRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: stepsProgress } = useScroll({ target: stepsRef, offset: ['start 0.7', 'end 0.6'] });
  const lineScale = useSpring(stepsProgress, { stiffness: 120, damping: 30 });

  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress: heroProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroY = useTransform(heroProgress, [0, 1], [0, 120]);
  const heroOpacity = useTransform(heroProgress, [0, 0.8], [1, 0]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [feature.slug]);

  const index = features.findIndex((f) => f.slug === feature.slug);
  const next = features[(index + 1) % features.length];

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-[#fbfdfd] text-[#191c1e] font-body overflow-x-hidden">
        <nav className="fixed top-0 w-full z-50 bg-white/70 backdrop-blur-xl">
          <div className="flex items-center px-4 md:px-8 py-4 max-w-5xl mx-auto">
            <button
              onClick={() => navigate('/', { state: { scrollTo: 'features' } })}
              aria-label="Retour aux fonctionnalités"
              className="flex items-center gap-2 text-slate-500 hover:text-[#00685f] transition-colors"
            >
              <span className="material-symbols-outlined">arrow_back</span>
              <span className="font-headline font-semibold text-blue-800">MacroMedica</span>
            </button>
          </div>
        </nav>

        {/* Hero */}
        <section ref={heroRef} className="relative min-h-screen flex items-center justify-center px-6">
          <div className="absolute inset-0 pointer-events-none overflow-hidden flex items-center justify-center">
            <motion.div
              className="shrink-0 w-[720px] h-[720px] rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(20,184,166,0.16) 0%, rgba(59,130,246,0.06) 45%, transparent 70%)' }}
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>

          <motion.div style={{ y: heroY, opacity: heroOpacity }} className="relative text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.6, rotate: -12 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ duration: 0.9, ease }}
              className="mx-auto mb-10 w-20 h-20 rounded-3xl bg-[#00685f] text-white flex items-center justify-center shadow-xl shadow-teal-900/20"
            >
              <span className="material-symbols-outlined text-4xl">{feature.icon}</span>
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.9, ease }}
              className="font-['Outfit'] font-black text-5xl md:text-7xl tracking-tight text-[#0f172a] mb-6"
            >
              {feature.title}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.9, ease }}
              className="text-xl md:text-2xl text-slate-500"
            >
              {feature.tagline}
            </motion.p>
          </motion.div>

          <motion.span
            className="material-symbols-outlined absolute bottom-10 left-1/2 -ml-3 text-slate-300"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, y: [0, 8, 0] }}
            transition={{ opacity: { delay: 1 }, y: { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } }}
          >
            keyboard_arrow_down
          </motion.span>
        </section>

        {/* Story */}
        <section className="px-6 py-32 md:py-48">
          <div className="max-w-4xl mx-auto">
            <ScrollStory text={feature.story} />
          </div>
        </section>

        {/* Steps */}
        <section className="px-6 py-24">
          <div ref={stepsRef} className="relative max-w-3xl mx-auto">
            <div className="absolute left-[23px] top-6 bottom-6 w-px bg-slate-200" />
            <motion.div className="absolute left-[23px] top-6 bottom-6 w-px bg-[#00685f] origin-top" style={{ scaleY: lineScale }} />
            <div className="space-y-24">
              {feature.steps.map((step, i) => (
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 40 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, amount: 0.8 }}
                  transition={{ duration: 0.8, ease }}
                  className="relative flex items-center gap-8"
                >
                  <motion.span
                    initial={{ scale: 0 }}
                    whileInView={{ scale: 1 }}
                    viewport={{ once: true, amount: 0.8 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
                    className="relative shrink-0 w-12 h-12 rounded-full bg-white border-2 border-[#00685f] text-[#00685f] font-headline font-bold flex items-center justify-center"
                  >
                    {i + 1}
                  </motion.span>
                  <h3 className="font-headline text-3xl md:text-4xl font-bold text-[#0f172a] tracking-tight">{step}</h3>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Outcomes */}
        <section className="px-6 py-32 md:py-44">
          <div className="max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-16 text-center">
            {feature.outcomes.map((o, i) => (
              <motion.div key={o.label} {...reveal} transition={{ ...reveal.transition, delay: i * 0.15 }}>
                <div className="font-['Outfit'] font-black text-7xl md:text-8xl text-[#0f172a] tracking-tight mb-3">
                  <CountUp outcome={o} />
                </div>
                <p className="text-slate-500 font-medium">{o.label}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Next */}
        <section className="px-6 pb-24">
          <motion.div {...reveal} className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6 border-t border-slate-100 pt-12">
            <button
              onClick={() => navigate(`/fonctionnalites/${next.slug}`)}
              className="group flex items-center gap-3 text-left"
            >
              <span className="font-headline text-2xl font-bold text-[#0f172a] group-hover:text-[#00685f] transition-colors">{next.title}</span>
              <span className="material-symbols-outlined text-[#00685f] transition-transform group-hover:translate-x-1">arrow_forward</span>
            </button>
            <button
              onClick={() => navigate('/login')}
              className="px-6 py-3 rounded-lg bg-[#00685f] text-white font-bold hover:bg-[#008378] transition-colors"
            >
              Essai Gratuit
            </button>
          </motion.div>
        </section>
      </div>
    </MotionConfig>
  );
};

const FeaturePage = () => {
  const { slug } = useParams();
  const feature = getFeature(slug);
  if (!feature) return <Navigate to="/" replace />;
  // key remounts the story so scroll-driven animations reset between features
  return <FeatureStory key={feature.slug} feature={feature} />;
};

export default FeaturePage;
