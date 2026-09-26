import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import FeatureCard3D from '../components/common/FeatureCard3D';

/* ─── FAQ Data ──────────────────────────────────────────────────────────────── */
const FAQ_ITEMS = [
  {
    q: 'Mes données sont-elles stockées au Maroc ?',
    a: 'Oui, toutes nos données sont hébergées dans des centres de données certifiés Tier III situés sur le territoire national, conformément aux recommandations de la CNDP.',
  },
  {
    q: 'Puis-je importer mon ancienne base de données ?',
    a: "Absolument. Nos ingénieurs vous assistent gratuitement lors de l'importation de vos fichiers Excel ou exportations d'autres logiciels médicaux.",
  },
  {
    q: 'Le logiciel fonctionne-t-il sans connexion internet ?',
    a: "MacroMedica nécessite une connexion internet pour la synchronisation, mais dispose d'un mode hors-ligne permettant de consulter les dossiers en cas de coupure temporaire.",
  },
];

/* ─── Feature Data ──────────────────────────────────────────────────────────── */
const FEATURES = [
  {
    slug: 'salle-attente',
    icon: 'meeting_room',
    badge: 'TEMPS RÉEL',
    title: "Salle d'Attente Interactive",
    description: "File active synchronisée entre l'accueil et le praticien : suivez l'avancement, le chrono et l'encaissement en direct.",
    highlightMetric: '0 retard imprévu',
  },
  {
    slug: 'gestion-rdv',
    icon: 'calendar_month',
    badge: 'PLANIFICATION',
    title: 'Agenda & Rappels SMS',
    description: "Créneaux paramétrables par motif, détection automatique des créneaux libérés et relances SMS automatiques.",
    highlightMetric: '-40% de no-shows',
  },
  {
    slug: 'ordonnances',
    icon: 'prescriptions',
    badge: 'POSTE MÉDICAL',
    title: 'Consultation & Cockpit',
    description: "Cockpit clinique unifié : constantes vitales, alertes allergies en rouge et ordonnances conformes au Maroc en 1 clic.",
    highlightMetric: 'Rx en 15 secondes',
  },
  {
    slug: 'facturation',
    icon: 'account_balance_wallet',
    badge: 'FINANCES MAD',
    title: 'Facturation & Caisse',
    description: "Encaissement en MAD, distinction espèces / chèque / CNOPS-CNSS, reçus certifiés et clôture de caisse sans erreur.",
    highlightMetric: 'Clôture en 2 minutes',
  },
  {
    slug: 'dossiers-patients',
    icon: 'folder_shared',
    badge: 'DOSSIER 360°',
    title: 'Dossiers Patients Unifiés',
    description: "Historique chronologique sans perte, imagerie haute résolution intégrée et suivi des pathologies chroniques.",
    highlightMetric: 'Accès en 1 clic',
  },
  {
    slug: 'taches',
    icon: 'checklist',
    badge: 'COORDINATION',
    title: 'Tâches & Urgences Cabinet',
    description: "Triage des priorités du secrétariat : relances de bilans de labo, signature de documents et suivi sans post-it.",
    highlightMetric: 'Zéro oubli secrétariat',
  },
];

/* ─── Pricing Data ──────────────────────────────────────────────────────────── */
const PLANS = [
  {
    name: 'Solo',
    price: '499 MAD',
    sub: 'Pour un cabinet individuel qui veut tout centraliser.',
    features: ['Agenda intelligent', 'Dossiers patients', 'Ordonnances illimitées', 'Facturation simple'],
    popular: false,
    cta: 'Choisir ce plan',
  },
  {
    name: 'Cabinet',
    price: '899 MAD',
    sub: 'Pour une équipe médicale avec coordination secrétariat + praticiens.',
    features: ['Utilisateurs multiples', "Salle d'attente en direct", 'Facturation complète', "Statistiques d'activité"],
    popular: true,
    cta: 'Essayer gratuitement',
  },
  {
    name: 'Réseau',
    price: 'Sur devis',
    sub: 'Pour groupes médicaux et cliniques multisites.',
    features: ['Multi-sites', 'Rôles avancés', 'Exports métier', 'Accompagnement dédié'],
    popular: false,
    cta: 'Nous contacter',
  },
];

/* ─── Stats Data ────────────────────────────────────────────────────────────── */
const STATS = [
  { target: 500,   label: 'Médecins Actifs', suffix: '+' },
  { target: 50000, label: 'Patients Suivis',  suffix: '+' },
  { target: 12,    label: 'Villes au Maroc',  suffix: '' },
  { target: 99.9,  label: 'Disponibilité',    suffix: '%' },
];

/* ─── Testimonials ──────────────────────────────────────────────────────────── */
const TESTIMONIALS = [
  {
    quote: "MacroMedica a transformé ma gestion quotidienne. Je passe moins de temps sur la paperasse et plus avec mes patients.",
    name: 'Dr. Ahmed Alami',
    role: 'Cardiologue, Casablanca',
    img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDVZ9FZC3DySjqycQQag5Aqhh9ptRCcIZRIxbB2mrfoN3zPGhEPTo_DG5h-lSr_8NCyytQaUy-2z2XEdYlZquxH4V-PQ5snWQFkAf37TnXVgiOPdrP6xPBNV8fn2uthCy_LLxej-7pDQPEjrvzycLj2W1PTNskh4r2CCZz8LdZqkkqdMU4AfQVczaO2USh2aGa6rRFSHDyVAqH2LNXlRzT0OuBInh7nUvDuYTE6DhG21GnBHwADjCSnwKZrx87KPtZHQr20hXtgJKY',
  },
  {
    quote: "La meilleure solution pour la facturation au Maroc. C'est intuitif, rapide et extrêmement fiable au quotidien.",
    name: 'Dr. Sara Bennani',
    role: 'Pédiatre, Rabat',
    img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCjaZmj2FMkBMxRVceMSwVB112miWzmbfZRJxE6zRsFXoSWCZdWUp0E-H_Q24Cz7LEdmu25CF1FfhmNY8qR5Poa97eOBs4u-TuTdeIrs2vn16zC6hiwy0oXuxbE0KuPn_QonRcyFEEecYOMkgl-mV2mgqmsklDjrJevRSesQg1AkU9KbiefSLg9ghHzfzjqYihYZChfP4me_I7t80G6DBoYedp4zf3Bb9BCmqjKqyrwHrgv0a35O3JYxuZhWYgcaG8Kt5khNpaHv9Q',
  },
  {
    quote: "Le support technique est exceptionnel. On sent qu'ils comprennent les réalités du terrain médical marocain.",
    name: 'Dr. Youssef Tazi',
    role: 'Généraliste, Tanger',
    img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBPPvVb87c1y7xy6CxdpPXBihBMSj7e-Mmyt0_F-RDJ-Y6WxTh7xJD35yS9MHXVACSYpe1ph9Y5lGyHCT2ZF6SWCyK4rU8uoDEYfEsuyq5_N4pahuGBc9mFoqwjbcGnpODkNonYu2v-qJzBwj5w0byFVnHMvvtMI8u8f8fU9wJULCzIDIlGiAeMr3EOaMd9i0ckdockhRh9iue851YaKuCvuKkhL51r7ho3epvE-s-qoJy2D-tpaXTFRCXLJ2xM1vV3ZRD_t9k79uU',
  },
];

const TRUST_LOGOS = ['Clinique Agdal', 'Hôpital Cheikh Zaid', 'Cabinet Dr. Alami', 'Groupe AKDITAL', 'Centre de Radiologie'];

const AVATAR_URLS = [
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBTjvP3BA0dkZ_MvcUTIB6PijFQgqZNbZHXIgk72yzj8ZGyt0MorLDfBGSbtTuHh2S5rES7tdMdUEq0MVskUW2VtSSnVwYU3g3wVIPnMKq_MRYZDN1o68D-xz9lm9-1RWJUqhSqfEyYUtJ4_-tT8gOJJig2qi9dlT5YYjY7lELCZwcPUvOd5xDT0FPEng_qT3_mAyyd-iptntS_OP9ck5wbLIzDwLPbIrfWrxB4ij8B_08jH-rto2b22T6WvnY0IaZ6KwxNiPIxJ4Y',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBY9J12AI-fNmK7fmy4C84kTn97TfSaXO1yVW_2dmT89WNRYiHWUVrekfC_9zMrxA2wc1qXjJkF1tRL2j6AYpBMYNqhm06yNzw6y1C7AtZzyy0Ztq17UZi-nzIiXE8UvtVdAQWGobl5sXoBvNwO20snFgxkpaKtO-C5S1PK8AeZclUBIk0xDOtIQq-EL8R87UHTslT_HaE3plZwvyTlEAJ7Sr12IMughoq1KgRn55frVXu6hKXqWcwHMmaTWWkW2MjXXehCoqo9J_Y',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAPxfzDhenGWv8buT3fsVRUXrUd7fQRGaCoWA8zNHGpo36LcDjXhZkGOonrJkaO1amE8-kOaR3ZdbHiAZPgY0VTUv9QuL5PRxdgY2P0e_5jd8O2CvNq5jMTF3IimqAuqc2vpFtW8y26Ons_y_kKY0aQ7Q6ZbNTqE15oBKXxNUUuAiQ9SPVbnxYxRO3qyu6mzhnLHfJATIA8q7JHGCpABMBKIyz91pbrpEXyIvJuRK759PeqdX0kW-1sgJEyNgZhpFEC8t8obg640As',
];

/* ─── Smooth scroll helper ──────────────────────────────────────────────────── */
const scrollTo = (id: string) => (e: React.MouseEvent) => {
  e.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
};

/* ─── StatCounter — animates a number on viewport entry ─────────────────────── */
function StatCounter({ target, suffix }: { target: number; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          let count = 0;
          const step = target / 50;
          const tick = () => {
            count += step;
            if (count < target) {
              el.textContent = Math.ceil(count).toLocaleString() + suffix;
              setTimeout(tick, 30);
            } else {
              el.textContent = (Number.isInteger(target) ? target.toLocaleString() : target.toString()) + suffix;
            }
          };
          tick();
          observer.unobserve(el);
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, suffix]);

  return <span ref={ref}>0</span>;
}

/* ─── FAQItem — click-to-toggle accordion ───────────────────────────────────── */
function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-slate-200 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-5 text-left cursor-pointer group"
      >
        <h4 className="text-lg font-bold text-slate-900 group-hover:text-landing-primary transition-colors pr-4">{q}</h4>
        <span
          className={`material-symbols-outlined text-slate-400 transition-transform duration-300 flex-shrink-0 ${open ? 'rotate-180' : ''}`}
        >
          expand_more
        </span>
      </button>
      <div
        className="grid transition-all duration-300 ease-in-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <p className="pb-5 text-slate-600 leading-relaxed">{a}</p>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   LANDING PAGE
   ═══════════════════════════════════════════════════════════════════════════════ */
const LandingPage = () => {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [ctaEmail, setCtaEmail] = useState('');

  const handleCtaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(`/login${ctaEmail.trim() ? `?email=${encodeURIComponent(ctaEmail.trim())}` : ''}`);
  };

  /* ── Scroll progress + reveal observers ─────────────────────────────────── */
  useEffect(() => {
    const handleScroll = () => {
      const h = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const pct = (window.scrollY / h) * 100;
      const bar = document.getElementById('scroll-progress');
      if (bar) bar.style.width = pct + '%';
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    const revealObs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) (e.target as HTMLElement).classList.add('active'); }),
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' },
    );
    document.querySelectorAll('.reveal, .reveal-left, .reveal-right').forEach((el) => revealObs.observe(el));

    const lineObs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { const l = document.getElementById('connecting-line'); if (l) l.style.width = '100%'; } }),
      { threshold: 0.3 },
    );
    const hw = document.getElementById('how-it-works');
    if (hw) lineObs.observe(hw);

    const featureObs = new IntersectionObserver(
      (entries) => entries.forEach((entry, i) => { if (entry.isIntersecting) { setTimeout(() => entry.target.classList.add('visible'), i * 100); featureObs.unobserve(entry.target); } }),
      { threshold: 0.15 },
    );
    document.querySelectorAll('.feature-card').forEach((c) => featureObs.observe(c));

    return () => { window.removeEventListener('scroll', handleScroll); revealObs.disconnect(); lineObs.disconnect(); featureObs.disconnect(); };
  }, []);

  /* ── Shared button styles ───────────────────────────────────────────────── */
  const btnPrimary = "inline-flex items-center gap-2 rounded-xl bg-landing-primary px-6 py-3 text-sm font-bold text-white shadow-lg shadow-landing-primary/20 transition-all duration-200 hover:bg-landing-primary-container hover:-translate-y-0.5 hover:shadow-xl cursor-pointer";
  const btnOutline = "inline-flex items-center gap-2 rounded-xl border-2 border-slate-900 px-6 py-3 text-sm font-bold text-slate-900 transition-all duration-200 hover:bg-slate-900 hover:text-white cursor-pointer";
  const btnOutlineWhite = "inline-flex items-center gap-2 rounded-xl border-2 border-white/80 px-6 py-3 text-sm font-bold text-white transition-all duration-200 hover:bg-white hover:text-landing-primary cursor-pointer";

  /* ── Nav links ──────────────────────────────────────────────────────────── */
  const navLinks = [
    { label: 'Fonctionnalités', to: 'features' },
    { label: 'Comment ça marche', to: 'how-it-works' },
    { label: 'Tarifs', to: 'pricing' },
    { label: 'Témoignages', to: 'testimonials' },
  ];

  return (
    <div className="font-body text-slate-900 relative">
      {/* ── Minimal keyframes ─────────────────────────────────────────────── */}
      <style>{`
        @keyframes textShimmer { 0% { background-position: 0% center; } 100% { background-position: -200% center; } }
        @keyframes gradientMove { 0% { background-position: 0% 0%; } 50% { background-position: 0% 100%; } 100% { background-position: 0% 0%; } }
        @keyframes drift1 { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(40px,-30px) scale(1.1)} 66%{transform:translate(-20px,40px) scale(.95)} }
        @keyframes drift2 { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(-50px,30px) scale(1.05)} 66%{transform:translate(30px,-40px) scale(.9)} }
        @keyframes drift3 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(60px,-20px) scale(1.08)} }
        @keyframes drift4 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-40px,50px) scale(1.06)} }
        @keyframes drift5 { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(-30px,-20px) scale(1.04)} 66%{transform:translate(50px,30px) scale(.96)} }
        @keyframes marquee { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        .animated-mesh-bg { background: linear-gradient(180deg,#f0fdf9 0%,#e8f8f5 15%,#f0fdf9 30%,#edfaf7 45%,#f7fffe 60%,#e6f7f4 75%,#f0fdf9 90%,#e0f7f3 100%); background-size:100% 400%; animation:gradientMove 30s ease infinite; }
        .reveal { opacity:0; transform:translateY(30px); transition:all .8s ease-out; }
        .reveal.active { opacity:1; transform:translateY(0); }
        .reveal-left { opacity:0; transform:translateX(-50px); transition:all 1s ease-out; }
        .reveal-right { opacity:0; transform:translateX(50px); transition:all 1s ease-out; }
        .reveal-left.active, .reveal-right.active { opacity:1; transform:translateX(0); }
        body { overflow-x: hidden; }
      `}</style>

      {/* ── Ambient blobs ─────────────────────────────────────────────────── */}
      <div className="animated-mesh-bg fixed inset-0 -z-10" />
      <div className="fixed inset-0 -z-[5] pointer-events-none overflow-hidden">
        <div className="absolute w-[700px] h-[700px] rounded-full blur-[60px] -top-[200px] -left-[200px]" style={{ background: 'radial-gradient(circle,rgba(0,104,95,.12),rgba(20,184,166,.06) 50%,transparent)', animation: 'drift1 20s ease-in-out infinite' }} />
        <div className="absolute w-[600px] h-[600px] rounded-full blur-[70px] -top-[100px] -right-[150px]" style={{ background: 'radial-gradient(circle,rgba(20,184,166,.1),rgba(45,212,191,.05) 50%,transparent)', animation: 'drift2 25s ease-in-out infinite' }} />
        <div className="absolute w-[500px] h-[500px] rounded-full blur-[80px] top-[35%] -left-[100px]" style={{ background: 'radial-gradient(circle,rgba(45,212,191,.12),rgba(94,234,212,.05) 50%,transparent)', animation: 'drift3 18s ease-in-out infinite' }} />
        <div className="absolute w-[650px] h-[650px] rounded-full blur-[90px] top-[55%] -right-[200px]" style={{ background: 'radial-gradient(circle,rgba(0,104,95,.1),rgba(15,118,110,.05) 50%,transparent)', animation: 'drift4 22s ease-in-out infinite' }} />
        <div className="absolute w-[800px] h-[800px] rounded-full blur-[100px] -bottom-[300px] left-[20%]" style={{ background: 'radial-gradient(circle,rgba(20,184,166,.14),rgba(0,104,95,.06) 50%,transparent)', animation: 'drift5 30s ease-in-out infinite' }} />
      </div>

      {/* ── Scroll progress ───────────────────────────────────────────────── */}
      <div className="fixed top-0 left-0 w-full h-[3px] z-[60] bg-transparent">
        <div className="h-full bg-landing-primary transition-all duration-150" id="scroll-progress" style={{ width: '0%' }} />
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
         NAV
         ════════════════════════════════════════════════════════════════════════ */}
      <nav className="sticky top-0 z-50 backdrop-blur-2xl bg-white/60 border-b border-slate-200/50">
        <div className="flex items-center justify-between px-6 lg:px-8 py-3.5 max-w-7xl mx-auto">
          {/* Logo */}
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex items-center gap-2 group cursor-pointer">
            <span className="material-symbols-outlined text-landing-primary text-3xl transition-transform duration-300 group-hover:scale-110 group-hover:rotate-90">add</span>
            <span className="text-xl font-headline font-bold text-slate-900 tracking-tight">MacroMedica</span>
          </button>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((l) => (
              <a key={l.to} href={`#${l.to}`} onClick={scrollTo(l.to)} className="text-sm font-medium text-slate-600 hover:text-landing-primary transition-colors cursor-pointer">
                {l.label}
              </a>
            ))}
          </div>

          {/* Desktop CTAs */}
          <div className="hidden md:flex items-center gap-3">
            <button onClick={() => navigate('/login')} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-landing-primary transition-colors cursor-pointer">Connexion</button>
            <button onClick={() => navigate('/login')} className={btnPrimary}>Essai Gratuit</button>
          </div>

          {/* Mobile hamburger */}
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden flex flex-col gap-1.5 cursor-pointer p-2" aria-label="Menu">
            <span className={`block w-6 h-0.5 bg-slate-700 transition-all duration-300 ${mobileMenuOpen ? 'rotate-45 translate-y-2' : ''}`} />
            <span className={`block w-6 h-0.5 bg-slate-700 transition-all duration-300 ${mobileMenuOpen ? 'opacity-0' : ''}`} />
            <span className={`block w-6 h-0.5 bg-slate-700 transition-all duration-300 ${mobileMenuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
          </button>
        </div>

        {/* Mobile menu panel */}
        <div className={`md:hidden overflow-hidden transition-all duration-300 bg-white/95 backdrop-blur-xl border-t border-slate-100 ${mobileMenuOpen ? 'max-h-80 py-4' : 'max-h-0'}`}>
          <div className="flex flex-col gap-1 px-6">
            {navLinks.map((l) => (
              <a key={l.to} href={`#${l.to}`} onClick={(e) => { scrollTo(l.to)(e); setMobileMenuOpen(false); }} className="py-3 text-sm font-medium text-slate-700 hover:text-landing-primary transition-colors cursor-pointer">
                {l.label}
              </a>
            ))}
            <hr className="my-2 border-slate-100" />
            <button onClick={() => { navigate('/login'); setMobileMenuOpen(false); }} className="py-3 text-sm font-semibold text-slate-600 text-left cursor-pointer">Connexion</button>
            <button onClick={() => { navigate('/login'); setMobileMenuOpen(false); }} className={`${btnPrimary} justify-center mt-1 mb-2`}>Essai Gratuit</button>
          </div>
        </div>
      </nav>

      {/* ════════════════════════════════════════════════════════════════════════
         HERO
         ════════════════════════════════════════════════════════════════════════ */}
      <section className="relative pt-16 lg:pt-24 pb-20 lg:pb-32 px-6 lg:px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Copy */}
          <div className="z-10 max-w-xl">
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-sans font-black leading-[0.95] tracking-tight text-slate-900 mb-8">
              La gestion <br />intelligente <br />
              <span
                className="inline-block"
                style={{
                  background: 'linear-gradient(90deg,#00685f 0%,#14b8a6 25%,#2dd4bf 50%,#14b8a6 75%,#00685f 100%)',
                  backgroundSize: '200% auto',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  animation: 'textShimmer 4s linear infinite',
                }}
              >
                de votre cabinet.
              </span>
            </h1>
            <p className="text-lg text-slate-600 mb-10 max-w-xl leading-relaxed">
              Centralisez vos patients, rendez-vous, facturation et tâches quotidiennes dans une plateforme conçue pour les praticiens modernes.
            </p>
            <div className="flex flex-wrap gap-4">
              <button onClick={() => navigate('/login')} className={btnPrimary}>
                Essayer gratuitement
                <span className="material-symbols-outlined text-lg">arrow_forward</span>
              </button>
              <button onClick={scrollTo('features')} className={btnOutline}>
                Voir la démonstration
              </button>
            </div>

            {/* Social proof */}
            <div className="mt-12 flex items-center gap-5 text-sm text-slate-600">
              <div className="flex -space-x-3">
                {AVATAR_URLS.map((url, i) => (
                  <img key={i} alt="Médecin" className="w-10 h-10 rounded-full border-[3px] border-white shadow-sm object-cover" src={url} />
                ))}
              </div>
              <p>Rejoint par <span className="text-landing-primary font-bold">+500 médecins</span> ce mois-ci</p>
            </div>
          </div>

          {/* Hero mockup — simplified browser frame with dashboard preview */}
          <div className="relative" style={{ animation: 'float 5s ease-in-out infinite' }}>
            <div className="absolute -inset-20 bg-teal-200/20 blur-[120px] rounded-full" />
            <div className="relative z-10 rounded-2xl overflow-hidden shadow-2xl border border-white/20 max-w-[640px] mx-auto">
              {/* Browser bar */}
              <div className="flex items-center gap-2 bg-slate-50 border-b border-slate-200 px-4 py-2.5">
                <div className="flex gap-[6px]">
                  <span className="w-[10px] h-[10px] rounded-full bg-red-400" />
                  <span className="w-[10px] h-[10px] rounded-full bg-amber-400" />
                  <span className="w-[10px] h-[10px] rounded-full bg-green-400" />
                </div>
                <div className="bg-slate-200 rounded-md px-3 py-1 text-[11px] text-slate-500 font-medium ml-3 flex-1 max-w-[200px]">
                  🔒 macromedica.app
                </div>
              </div>

              {/* Dashboard body */}
              <div className="flex bg-slate-50" style={{ height: '420px' }}>
                {/* Mini sidebar */}
                <div className="w-16 bg-[#0d1117] flex flex-col items-center py-5 flex-shrink-0">
                  <span className="text-2xl mb-8" style={{ color: '#14b8a6' }}>✦</span>
                  <div className="mt-auto w-8 h-8 rounded-full bg-gradient-to-r from-teal-700 to-emerald-500 flex items-center justify-center text-white text-[9px] font-bold">DB</div>
                </div>

                {/* Content */}
                <div className="flex-1 p-5 overflow-hidden">
                  {/* KPI row */}
                  <div className="grid grid-cols-3 gap-3 mb-5">
                    {[
                      { label: "Salle d'attente", value: '8', sub: 'patients', color: 'text-teal-800' },
                      { label: 'RDV du jour', value: '5', sub: 'consultations', color: 'text-emerald-700' },
                      { label: 'Revenu du jour', value: '650', sub: 'MAD', color: 'text-amber-700' },
                    ].map((s, i) => (
                      <div key={i} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-[0_1px_4px_rgba(0,0,0,.04)]">
                        <div className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">{s.label}</div>
                        <div className={`text-3xl font-black ${s.color} mt-1`}>
                          {s.value} {s.sub === 'MAD' && <span className="text-sm font-semibold text-slate-500">{s.sub}</span>}
                        </div>
                        {s.sub !== 'MAD' && <div className="text-[9px] text-slate-400 mt-0.5">{s.sub}</div>}
                      </div>
                    ))}
                  </div>

                  {/* Appointments list */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-[0_1px_4px_rgba(0,0,0,.04)]">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-bold text-slate-900">Salle d'attente</h3>
                      <span className="bg-teal-50 text-teal-800 px-3 py-1 rounded-full text-[10px] font-bold">8 patients</span>
                    </div>
                    {[
                      { initials: 'SK', name: 'Soufiane Kadiri', type: 'Consultation générale', color: 'emerald', status: 'EN ATTENTE' },
                      { initials: 'AB', name: 'Ahmed Benali',    type: 'Suivi diabète',         color: 'teal',    status: 'EN CONSULTATION' },
                      { initials: 'FC', name: 'Fatima Chraibi',  type: 'Bilan cardiaque',       color: 'emerald', status: 'EN ATTENTE' },
                    ].map((r, i) => (
                      <div key={i} className={`flex items-center gap-3 p-3 mb-2 last:mb-0 rounded-xl bg-slate-50 border-l-[3px] ${r.color === 'emerald' ? 'border-l-emerald-500' : 'border-l-teal-600'}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${r.color === 'emerald' ? 'bg-emerald-50 text-emerald-700' : 'bg-teal-50 text-teal-800'}`}>{r.initials}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-bold text-slate-900 truncate">{r.name}</div>
                          <div className="text-[9px] text-slate-500">{r.type}</div>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold whitespace-nowrap ${r.color === 'emerald' ? 'bg-emerald-100 text-emerald-700' : 'bg-teal-100 text-teal-800'}`}>{r.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════════
         TRUST BAR
         ════════════════════════════════════════════════════════════════════════ */}
      <div className="py-10 bg-white/30 backdrop-blur-sm overflow-hidden border-y border-slate-200/50">
        <div className="flex items-center gap-20 grayscale opacity-40" style={{ width: 'fit-content', animation: 'marquee 30s linear infinite' }}>
          {[...TRUST_LOGOS, ...TRUST_LOGOS].map((name, i) => (
            <span key={i} className="text-xl font-headline font-bold uppercase tracking-[0.15em] whitespace-nowrap text-slate-700">{name}</span>
          ))}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
         FEATURES
         ════════════════════════════════════════════════════════════════════════ */}
      <section className="py-24 lg:py-32 px-6 lg:px-8" id="features">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20 reveal">
            <h2 className="text-4xl lg:text-5xl font-headline font-light mb-5 text-slate-900">
              Conçu pour la <span className="font-bold text-landing-primary">Pratique Moderne</span>
            </h2>
            <p className="text-slate-600 text-lg max-w-2xl mx-auto">
              Chaque module est optimisé pour réduire la charge mentale et maximiser le temps passé avec vos patients.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {FEATURES.map((f, i) => (
              <FeatureCard3D
                key={i}
                slug={f.slug}
                icon={f.icon}
                badge={f.badge}
                title={f.title}
                description={f.description}
                highlightMetric={f.highlightMetric}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════════
         HOW IT WORKS
         ════════════════════════════════════════════════════════════════════════ */}
      <section className="py-24 lg:py-32 relative overflow-hidden" id="how-it-works">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 relative">
          <div className="text-center mb-20 reveal">
            <h2 className="text-4xl lg:text-5xl font-headline font-light text-slate-900">
              Prêt en <span className="font-bold text-landing-primary">3 Minutes</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-16 lg:gap-20 relative">
            {[
              { num: '01', title: 'Compte',  sub: null,         desc: 'Créez votre profil professionnel et configurez les détails de votre clinique.' },
              { num: '02', title: 'Import',   sub: '(Optionnel)', desc: 'Importez vos données patients existantes via nos outils de migration automatique.' },
              { num: '03', title: 'Gestion',  sub: null,         desc: 'Prenez le contrôle total de votre activité avec une interface intuitive.' },
            ].map((step, i) => (
              <div key={i} className="relative z-10 text-center reveal group flex flex-col items-center">
                <div className="h-14 flex items-end justify-center mb-6">
                  <h3 className="text-2xl md:text-3xl font-headline font-black text-slate-800 transition-all duration-500 group-hover:-translate-y-1 group-hover:text-landing-primary relative">
                    {step.title}
                    {step.sub && <span className="text-base md:text-lg font-medium text-slate-400 ml-2">{step.sub}</span>}
                    <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-[3px] bg-landing-primary transition-all duration-500 group-hover:w-full rounded-full opacity-0 group-hover:opacity-100" />
                  </h3>
                </div>
                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl border-4 border-landing-primary transition-all duration-500 group-hover:scale-110 group-hover:shadow-landing-primary/30 z-10">
                  <span className="text-2xl font-headline font-black text-landing-primary">{step.num}</span>
                </div>
                <p className="text-slate-600 text-base lg:text-lg max-w-xs">{step.desc}</p>
              </div>
            ))}

            {/* Connecting line */}
            <div className="absolute top-[112px] left-0 w-full h-[3px] bg-slate-200 -z-0 hidden md:block rounded-full">
              <div className="h-full bg-landing-primary transition-all duration-1000 rounded-full" id="connecting-line" style={{ width: '0%' }} />
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════════
         STATS
         ════════════════════════════════════════════════════════════════════════ */}
      <section className="py-20 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #004f45 0%, #00685f 50%, #003d37 100%)', borderTop: '1px solid rgba(255,255,255,.15)', borderBottom: '1px solid rgba(255,255,255,.15)' }}>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-white blur-[100px] rounded-full" />
          <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-white blur-[100px] rounded-full" />
        </div>
        <div className="max-w-7xl mx-auto px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 text-center">
            {STATS.map((s, i) => (
              <div key={i} className="reveal">
                <p className="text-4xl md:text-5xl font-headline font-bold text-white mb-2">
                  <StatCounter target={s.target} suffix={s.suffix} />
                </p>
                <p className="text-white/60 font-medium uppercase tracking-[0.12em] text-[10px]">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════════
         TESTIMONIALS
         ════════════════════════════════════════════════════════════════════════ */}
      <section className="py-24 lg:py-32 overflow-hidden" id="testimonials">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <h2 className="text-4xl lg:text-5xl font-headline font-light text-center mb-20 reveal text-slate-900">
            Approuvé par les <span className="font-bold text-landing-primary">Experts</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {TESTIMONIALS.map((t, i) => (
              <div
                key={i}
                className={`${i === 0 ? 'reveal-left' : i === 2 ? 'reveal-right' : 'reveal'} p-8 lg:p-10 rounded-3xl bg-white/70 backdrop-blur-xl border border-white/80 shadow-[0_4px_24px_rgba(0,104,95,.06)] relative ${i === 1 ? 'transform md:-translate-y-6' : ''}`}
              >
                <div className="flex gap-1 text-landing-primary mb-5">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <span key={j} className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  ))}
                </div>
                <p className="text-slate-600 italic mb-8 leading-relaxed text-[15px]">"{t.quote}"</p>
                <div className="flex items-center gap-3">
                  <img alt={t.name} className="w-11 h-11 rounded-full shadow-md object-cover" src={t.img} />
                  <div>
                    <p className="font-bold text-slate-900 text-sm">{t.name}</p>
                    <p className="text-xs text-slate-500">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════════
         PRICING
         ════════════════════════════════════════════════════════════════════════ */}
      <section className="py-24 lg:py-32 px-6 lg:px-8" id="pricing">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16 reveal">
            <h2 className="text-4xl lg:text-5xl font-headline font-extrabold text-slate-900 tracking-tight mb-4">
              Des tarifs transparents
            </h2>
            <p className="text-slate-500 text-base font-medium">
              Aucun frais caché. Annulable à tout moment.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-7 items-stretch max-w-[1000px] mx-auto">
            {PLANS.map((plan, i) => (
              <div
                key={i}
                className={`reveal flex flex-col rounded-3xl p-8 transition-all duration-300 hover:-translate-y-1 ${
                  plan.popular
                    ? 'bg-white/80 backdrop-blur-xl border-white/80 shadow-xl ring-2 ring-landing-primary relative transform md:-translate-y-3'
                    : 'bg-white/70 backdrop-blur-xl border border-white/80 shadow-[0_4px_24px_rgba(0,104,95,.06)]'
                }`}
              >
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-xl font-bold text-slate-900">{plan.name}</h3>
                  {plan.popular && (
                    <span className="bg-landing-primary text-white text-[10px] uppercase font-bold tracking-wider py-1 px-3 rounded-full">Populaire</span>
                  )}
                </div>
                <div className="mb-3">
                  <span className="text-4xl font-extrabold text-slate-900 tracking-tight">{plan.price}</span>
                </div>
                <p className="text-slate-500 text-[13px] leading-relaxed mb-6">{plan.sub}</p>
                <hr className="border-t border-slate-200 mb-6" />
                <ul className="flex flex-col gap-3.5 mb-8 flex-1">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-landing-primary text-base">check_circle</span>
                      <span className="text-[13px] font-medium text-slate-700">{f}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => navigate('/login')}
                  className={`mt-auto w-full py-3 rounded-xl text-[13px] font-bold transition-all duration-200 cursor-pointer ${
                    plan.popular
                      ? 'bg-landing-primary hover:bg-landing-primary-container text-white shadow-lg shadow-landing-primary/20'
                      : 'border border-slate-200 text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════════
         FAQ
         ════════════════════════════════════════════════════════════════════════ */}
      <section className="py-24 lg:py-32 px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-4xl font-headline font-light text-center mb-14 reveal text-slate-900">
            Questions <span className="font-bold text-landing-primary">Fréquentes</span>
          </h2>
          <div className="reveal bg-white/70 backdrop-blur-xl rounded-3xl border border-white/80 shadow-[0_4px_24px_rgba(0,104,95,.06)] p-6 lg:p-8">
            {FAQ_ITEMS.map((item, i) => (
              <FAQItem key={i} q={item.q} a={item.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════════
         FINAL CTA
         ════════════════════════════════════════════════════════════════════════ */}
      {/* ════════════════════════════════════════════════════════════════════════
         FINAL CTA
         ════════════════════════════════════════════════════════════════════════ */}
      <section className="py-20 lg:py-28 px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 45, scale: 0.96 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-7xl mx-auto rounded-[2.5rem] lg:rounded-[3rem] p-8 sm:p-12 lg:p-20 relative overflow-hidden text-center border border-emerald-500/25 shadow-[0_25px_80px_-15px_rgba(0,104,95,0.4)]"
          style={{
            background: 'linear-gradient(145deg, #021e1a 0%, #04332d 45%, #011512 100%)',
          }}
        >
          {/* Dot matrix texture overlay */}
          <div
            className="absolute inset-0 pointer-events-none opacity-40"
            style={{
              backgroundImage: 'radial-gradient(rgba(45,212,191,0.18) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />

          {/* Atmospheric blurred glow orbs with breathing animation */}
          <motion.div
            animate={{ scale: [1, 1.15, 1], opacity: [0.2, 0.3, 0.2] }}
            transition={{ repeat: Infinity, duration: 7, ease: 'easeInOut' }}
            className="absolute -top-32 -left-32 w-80 h-80 bg-emerald-500 blur-[110px] rounded-full pointer-events-none"
          />
          <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.15, 0.25, 0.15] }}
            transition={{ repeat: Infinity, duration: 8, ease: 'easeInOut', delay: 1 }}
            className="absolute -bottom-32 -right-32 w-80 h-80 bg-teal-400 blur-[120px] rounded-full pointer-events-none"
          />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-400/10 blur-[130px] rounded-full pointer-events-none" />

          {/* Floating feature pills (Visible on large screens) */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.7, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="hidden xl:flex items-center gap-3 absolute left-8 top-1/2 -translate-y-1/2 bg-white/5 border border-white/10 backdrop-blur-xl px-4 py-3 rounded-2xl shadow-xl max-w-[210px] text-left transform -rotate-2 hover:rotate-0 transition-transform"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-xl">sms</span>
            </div>
            <div>
              <div className="text-[11px] font-bold text-white">Rappels SMS</div>
              <div className="text-[10px] text-emerald-300/80 font-medium">-40% d'absentéisme</div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.7, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="hidden xl:flex items-center gap-3 absolute right-8 top-1/2 -translate-y-1/2 bg-white/5 border border-white/10 backdrop-blur-xl px-4 py-3 rounded-2xl shadow-xl max-w-[210px] text-left transform rotate-2 hover:rotate-0 transition-transform"
          >
            <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-300 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-xl">prescriptions</span>
            </div>
            <div>
              <div className="text-[11px] font-bold text-white">Ordonnances</div>
              <div className="text-[10px] text-teal-300/80 font-medium">Générées en 15s</div>
            </div>
          </motion.div>

          {/* Central content with staggered scroll reveal */}
          <div className="relative z-10 max-w-3xl mx-auto">
            {/* Live badge */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="inline-flex items-center gap-2.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 px-4 py-1.5 text-xs font-bold text-emerald-300 backdrop-blur-md mb-6 shadow-sm"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              <span>ESSAI GRATUIT 14 JOURS • SANS ENGAGEMENT</span>
            </motion.div>

            {/* Headline */}
            <motion.h2
              initial={{ opacity: 0, y: 22 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.65, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="text-4xl sm:text-5xl lg:text-6xl font-headline font-bold text-white tracking-tight mb-5 leading-[1.1]"
            >
              Prêt à moderniser <br />
              <span className="bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-100 bg-clip-text text-transparent font-extrabold">
                votre cabinet médical ?
              </span>
            </motion.h2>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.35 }}
              className="text-slate-300 text-sm sm:text-base lg:text-lg mb-8 max-w-2xl mx-auto leading-relaxed"
            >
              Rejoignez les praticiens et secrétaires au Maroc qui éliminent la paperasse, réduisent les rendez-vous manqués et automatisent leur gestion clinique au quotidien.
            </motion.p>

            {/* Interactive Quick-start Bar */}
            <motion.form
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
              onSubmit={handleCtaSubmit}
              className="flex flex-col sm:flex-row items-center gap-3 max-w-md mx-auto w-full mb-6"
            >
              <div className="relative flex-1 w-full">
                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-400/80 text-xl pointer-events-none">
                  mail
                </span>
                <input
                  type="email"
                  value={ctaEmail}
                  onChange={(e) => setCtaEmail(e.target.value)}
                  placeholder="Votre email professionnel..."
                  className="w-full rounded-xl bg-white/10 border border-white/20 pl-11 pr-4 py-3.5 text-sm text-white placeholder:text-slate-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/25 backdrop-blur-md transition-all shadow-inner"
                />
              </div>
              <button
                type="submit"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-400 px-6 py-3.5 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer whitespace-nowrap"
              >
                <span>Démarrer</span>
                <span className="material-symbols-outlined text-lg">arrow_forward</span>
              </button>
            </motion.form>

            {/* Secondary Action */}
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.55 }}
              className="flex justify-center mb-10"
            >
              <button
                type="button"
                onClick={scrollTo('features')}
                className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer group"
              >
                <span className="material-symbols-outlined text-emerald-400 text-lg group-hover:scale-110 transition-transform">
                  play_circle
                </span>
                <span>Voir la démonstration des fonctionnalités</span>
              </button>
            </motion.div>

            {/* Value / Trust Guarantees */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="pt-8 border-t border-white/10 grid grid-cols-2 md:grid-cols-4 gap-4 text-left sm:text-center"
            >
              <div className="flex items-center sm:justify-center gap-2 text-xs font-medium text-slate-300">
                <span className="material-symbols-outlined text-emerald-400 text-base flex-shrink-0">check_circle</span>
                <span>Sans carte bancaire</span>
              </div>
              <div className="flex items-center sm:justify-center gap-2 text-xs font-medium text-slate-300">
                <span className="material-symbols-outlined text-emerald-400 text-base flex-shrink-0">check_circle</span>
                <span>Données au Maroc (CNDP)</span>
              </div>
              <div className="flex items-center sm:justify-center gap-2 text-xs font-medium text-slate-300">
                <span className="material-symbols-outlined text-emerald-400 text-base flex-shrink-0">check_circle</span>
                <span>Prêt en 3 minutes</span>
              </div>
              <div className="flex items-center sm:justify-center gap-2 text-xs font-medium text-slate-300">
                <span className="material-symbols-outlined text-emerald-400 text-base flex-shrink-0">check_circle</span>
                <span>Migration offerte</span>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════════
         FOOTER
         ════════════════════════════════════════════════════════════════════════ */}
      <footer className="bg-[#0f172a] text-white pt-16 pb-8 px-6 lg:px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-10 mb-16">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-6">
              <span className="material-symbols-outlined text-landing-primary text-2xl">add</span>
              <span className="text-lg font-headline font-bold text-white">MacroMedica</span>
            </div>
            <p className="text-slate-500 text-sm leading-relaxed">
              Plateforme de gestion médicale leader au Maroc. Conçue par des experts pour des experts.
            </p>
          </div>

          {/* Produit */}
          <div>
            <h4 className="text-white font-bold text-sm mb-6">Produit</h4>
            <ul className="space-y-3">
              <li><a href="#features" onClick={scrollTo('features')} className="text-slate-500 hover:text-teal-400 transition-colors text-sm cursor-pointer">Fonctionnalités</a></li>
              <li><a href="#pricing" onClick={scrollTo('pricing')} className="text-slate-500 hover:text-teal-400 transition-colors text-sm cursor-pointer">Tarification</a></li>
              <li><a href="#" onClick={(e) => e.preventDefault()} className="text-slate-500 hover:text-teal-400 transition-colors text-sm cursor-pointer">Sécurité</a></li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="text-white font-bold text-sm mb-6">Support</h4>
            <ul className="space-y-3">
              <li><a href="#" onClick={(e) => e.preventDefault()} className="text-slate-500 hover:text-teal-400 transition-colors text-sm cursor-pointer">Centre d'aide</a></li>
              <li><a href="#" onClick={(e) => e.preventDefault()} className="text-slate-500 hover:text-teal-400 transition-colors text-sm cursor-pointer">Contact</a></li>
            </ul>
          </div>

          {/* Légal */}
          <div>
            <h4 className="text-white font-bold text-sm mb-6">Légal</h4>
            <ul className="space-y-3">
              <li><a href="#" onClick={(e) => e.preventDefault()} className="text-slate-500 hover:text-teal-400 transition-colors text-sm cursor-pointer">Confidentialité</a></li>
              <li><a href="#" onClick={(e) => e.preventDefault()} className="text-slate-500 hover:text-teal-400 transition-colors text-sm cursor-pointer">Conformité CNDP</a></li>
            </ul>
          </div>
        </div>

        <div className="max-w-7xl mx-auto pt-8 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-slate-500 text-xs">© 2026 MacroMedica. Tous droits réservés.</p>
          <div className="flex gap-6">
            <span className="text-slate-600 text-[10px] flex items-center gap-2">
              <span className="w-2 h-2 bg-landing-primary rounded-full animate-pulse" />
              Serveurs: Casablanca
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
