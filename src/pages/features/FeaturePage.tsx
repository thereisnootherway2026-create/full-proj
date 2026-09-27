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

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  show: { opacity: 1, y: 0, transition: { duration: 0.8, ease } },
};

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#00685f] mb-6">{children}</p>
);

/* Each word lights up as the paragraph scrolls through the viewport. */
const ScrollWord = ({ word, progress, range }: { word: string; progress: MotionValue<number>; range: [number, number] }) => {
  const opacity = useTransform(progress, range, [0.15, 1]);
  return (
    <motion.span style={{ opacity }} className="inline-block mr-[0.28em]">
      {word}
    </motion.span>
  );
};

const ScrollStory = ({ text }: { text: string }) => {
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.85', 'end 0.45'] });
  const words = text.split(' ');
  return (
    <p ref={ref} className="font-headline text-3xl md:text-5xl font-semibold leading-[1.25] text-[#0f172a] tracking-tight">
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

  const timelineRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: timelineProgress } = useScroll({ target: timelineRef, offset: ['start 0.7', 'end 0.6'] });
  const lineScale = useSpring(timelineProgress, { stiffness: 120, damping: 30 });

  const { scrollYProgress: pageProgress } = useScroll();
  const progressBar = useSpring(pageProgress, { stiffness: 150, damping: 30 });

  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress: heroProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroY = useTransform(heroProgress, [0, 1], [0, 120]);
  const heroOpacity = useTransform(heroProgress, [0, 0.8], [1, 0]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [feature.slug]);

  const index = features.findIndex((f) => f.slug === feature.slug);
  const next = features[(index + 1) % features.length];
  const chapter = String(index + 1).padStart(2, '0');

  const backToFeatures = () => navigate('/', { state: { scrollTo: 'features' } });

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-[#fbfdfd] text-[#191c1e] font-body overflow-x-hidden">
        <motion.div className="fixed top-0 left-0 right-0 h-1 bg-[#00685f] origin-left z-[60]" style={{ scaleX: progressBar }} />

        {/* Navigation */}
        <nav className="fixed top-0 w-full z-50 bg-white/70 backdrop-blur-xl border-b border-slate-100">
          <div className="flex justify-between items-center px-4 md:px-8 py-4 max-w-6xl mx-auto">
            <button onClick={() => navigate('/')} className="flex items-center gap-2 group">
              <span className="material-symbols-outlined text-[#00685f] text-3xl transition-transform duration-300 group-hover:rotate-90">add</span>
              <span className="text-xl font-semibold text-blue-800 font-headline tracking-tight">MacroMedica</span>
            </button>
            <div className="flex items-center gap-2 md:gap-4">
              <button
                onClick={backToFeatures}
                className="hidden sm:inline-flex items-center gap-1 px-4 py-2 text-sm text-slate-600 font-semibold hover:text-[#00685f] transition-colors"
              >
                <span className="material-symbols-outlined text-base">arrow_back</span>
                Fonctionnalités
              </button>
              <button
                onClick={() => navigate('/login')}
                className="px-5 py-2.5 rounded-lg bg-[#00685f] text-white text-sm font-bold hover:bg-[#008378] transition-colors"
              >
                Essai Gratuit
              </button>
            </div>
          </div>
        </nav>

        {/* 1 — Hero */}
        <section ref={heroRef} className="relative min-h-screen flex items-center justify-center px-6 pt-24">
          <div className="absolute inset-0 pointer-events-none overflow-hidden flex items-center justify-center">
            <motion.div
              className="shrink-0 w-[720px] h-[720px] rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(20,184,166,0.16) 0%, rgba(59,130,246,0.06) 45%, transparent 70%)' }}
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>

          <motion.div style={{ y: heroY, opacity: heroOpacity }} className="relative text-center max-w-3xl">
            <motion.div
              initial={{ opacity: 0, scale: 0.6, rotate: -12 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ duration: 0.9, ease }}
              className="mx-auto mb-10 w-20 h-20 rounded-3xl bg-[#00685f] text-white flex items-center justify-center shadow-xl shadow-teal-900/20"
            >
              <span className="material-symbols-outlined text-4xl">{feature.icon}</span>
            </motion.div>
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.7, ease }}
              className="text-xs font-bold uppercase tracking-[0.3em] text-slate-400 mb-6"
            >
              Fonctionnalité {chapter} / {String(features.length).padStart(2, '0')}
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.9, ease }}
              className="font-['Outfit'] font-black text-5xl md:text-7xl tracking-tight text-[#0f172a] mb-8"
            >
              {feature.title}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45, duration: 0.9, ease }}
              className="text-xl md:text-2xl text-[#3d4947] leading-relaxed"
            >
              {feature.tagline}
            </motion.p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
            className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-slate-400"
          >
            <span className="text-[11px] font-bold uppercase tracking-[0.25em]">L'histoire</span>
            <motion.span
              className="material-symbols-outlined"
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            >
              keyboard_arrow_down
            </motion.span>
          </motion.div>
        </section>

        {/* 2 — Before */}
        <section className="px-6 py-32 md:py-44">
          <div className="max-w-4xl mx-auto">
            <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.5 }}>
              <Eyebrow>Chapitre 1 · Avant</Eyebrow>
            </motion.div>
            <ScrollStory text={feature.before.story} />

            <motion.ul
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.6 }}
              variants={{ show: { transition: { staggerChildren: 0.15 } } }}
              className="mt-16 flex flex-wrap gap-3"
            >
              {feature.before.pains.map((pain) => (
                <motion.li
                  key={pain}
                  variants={fadeUp}
                  className="relative px-5 py-2.5 rounded-full border border-slate-200 bg-white text-slate-500 font-medium"
                >
                  {pain}
                  <motion.span
                    className="absolute left-4 right-4 top-1/2 h-px bg-rose-400 origin-left"
                    variants={{ hidden: { scaleX: 0 }, show: { scaleX: 1, transition: { delay: 0.6, duration: 0.5, ease } } }}
                  />
                </motion.li>
              ))}
            </motion.ul>
          </div>
        </section>

        {/* 3 — With MacroMedica */}
        <section className="px-6 py-32 md:py-40 bg-white border-y border-slate-100">
          <div className="max-w-4xl mx-auto">
            <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.5 }} className="mb-20">
              <Eyebrow>Chapitre 2 · Avec MacroMedica</Eyebrow>
              <h2 className="font-headline text-4xl md:text-5xl font-light text-[#0f172a] tracking-tight">
                Trois étapes. <span className="font-bold text-[#00685f]">C'est tout.</span>
              </h2>
            </motion.div>

            <div ref={timelineRef} className="relative">
              <div className="absolute left-[23px] top-2 bottom-2 w-px bg-slate-200" />
              <motion.div className="absolute left-[23px] top-2 bottom-2 w-px bg-[#00685f] origin-top" style={{ scaleY: lineScale }} />

              <div className="space-y-20">
                {feature.steps.map((step, i) => (
                  <motion.div
                    key={step.title}
                    initial={{ opacity: 0, x: 40 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, amount: 0.6 }}
                    transition={{ duration: 0.8, ease }}
                    className="relative pl-20"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      whileInView={{ scale: 1 }}
                      viewport={{ once: true, amount: 0.6 }}
                      transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
                      className="absolute left-0 top-0 w-12 h-12 rounded-full bg-white border-2 border-[#00685f] text-[#00685f] font-headline font-bold flex items-center justify-center"
                    >
                      {i + 1}
                    </motion.div>
                    <h3 className="font-headline text-2xl md:text-3xl font-bold text-[#0f172a] mb-3">{step.title}</h3>
                    <p className="text-lg text-[#3d4947] leading-relaxed max-w-xl">{step.text}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 4 — Outcome */}
        <section className="px-6 py-32 md:py-44">
          <div className="max-w-5xl mx-auto">
            <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.5 }} className="text-center mb-20">
              <Eyebrow>Chapitre 3 · Après</Eyebrow>
              <h2 className="font-headline text-4xl md:text-5xl font-light text-[#0f172a] tracking-tight">
                Le résultat, <span className="font-bold text-[#00685f]">au quotidien.</span>
              </h2>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.4 }}
              variants={{ show: { transition: { staggerChildren: 0.15 } } }}
              className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8 text-center"
            >
              {feature.outcomes.map((o) => (
                <motion.div key={o.label} variants={fadeUp}>
                  <div className="font-['Outfit'] font-black text-6xl md:text-7xl text-[#0f172a] tracking-tight mb-3">
                    <CountUp outcome={o} />
                  </div>
                  <p className="text-[#3d4947] font-medium">{o.label}</p>
                </motion.div>
              ))}
            </motion.div>

            <motion.figure
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 0.9, ease }}
              className="mt-32 max-w-3xl mx-auto text-center"
            >
              <span className="material-symbols-outlined text-5xl text-[#14b8a6]/40">format_quote</span>
              <blockquote className="font-headline text-2xl md:text-4xl font-medium text-[#0f172a] leading-snug mt-2">
                {feature.quote.text}
              </blockquote>
              <figcaption className="mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">{feature.quote.author}</figcaption>
            </motion.figure>
          </div>
        </section>

        {/* 5 — Next */}
        <section className="px-6 pb-24">
          <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
            <motion.button
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.7, ease }}
              whileHover={{ y: -4 }}
              onClick={() => navigate(`/fonctionnalites/${next.slug}`)}
              className="group text-left rounded-[28px] p-8 md:p-10 bg-white border border-slate-100 shadow-[0_4px_24px_rgba(0,104,95,0.06)] hover:shadow-[0_24px_48px_-12px_rgba(0,104,95,0.2)] transition-shadow"
            >
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-400 mb-6">Fonctionnalité suivante</p>
              <div className="flex items-center gap-4 mb-3 min-w-0">
                <span className="material-symbols-outlined text-3xl text-[#00685f] shrink-0">{next.icon}</span>
                <h3 className="font-headline text-2xl md:text-3xl font-bold text-[#0f172a]">{next.title}</h3>
              </div>
              <p className="text-[#3d4947] mb-6">{next.tagline}</p>
              <span className="inline-flex items-center gap-1 font-bold text-[#00685f]">
                Continuer
                <span className="material-symbols-outlined transition-transform group-hover:translate-x-1">arrow_forward</span>
              </span>
            </motion.button>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.7, delay: 0.1, ease }}
              className="rounded-[28px] p-8 md:p-10 bg-[#00685f] text-white flex flex-col justify-between"
            >
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-white/60 mb-6">Prêt à commencer ?</p>
                <h3 className="font-headline text-2xl md:text-3xl font-bold mb-3">Essayez MacroMedica gratuitement.</h3>
                <p className="text-white/80 mb-8">Aucune carte bancaire. Votre cabinet prêt en quelques minutes.</p>
              </div>
              <button
                onClick={() => navigate('/login')}
                className="self-start px-6 py-3 rounded-lg bg-white text-[#00685f] font-bold hover:bg-teal-50 transition-colors"
              >
                Essai Gratuit
              </button>
            </motion.div>
          </div>

          <div className="text-center mt-16">
            <button onClick={backToFeatures} className="text-sm font-semibold text-slate-500 hover:text-[#00685f] transition-colors">
              ← Voir toutes les fonctionnalités
            </button>
          </div>
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
