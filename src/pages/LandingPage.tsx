import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import FeatureCard3D from '../components/common/FeatureCard3D';

const LandingPage = () => {
    const navigate = useNavigate();

    
    useEffect(() => {
        // Scroll Progress
        const handleScroll = () => {
            const windowHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
            const scrolled = (window.scrollY / windowHeight) * 100;
            const scrollProgress = document.getElementById('scroll-progress');
            if(scrollProgress) scrollProgress.style.width = scrolled + '%';
        };

        window.addEventListener('scroll', handleScroll);
        handleScroll();

        // Intersection Observers for Reveals
        const revealObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const target = entry.target as HTMLElement;
                    target.classList.add('active');
                    if(target.classList.contains('reveal-left')) target.style.transform = 'translateX(0)';
                    if(target.classList.contains('reveal-right')) target.style.transform = 'translateX(0)';
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

        const reveals = document.querySelectorAll('.reveal, .reveal-left, .reveal-right');
        reveals.forEach(el => revealObserver.observe(el));

        // Intersection Observer for Connecting Line
        const lineObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const line = document.getElementById('connecting-line');
                    if (line) line.style.width = '100%';
                }
            });
        }, { threshold: 0.3 });
        
        const howItWorksSection = document.getElementById('how-it-works');
        if (howItWorksSection) lineObserver.observe(howItWorksSection);

        // Intersection Observer for Stats Counters
        const statsObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const counter = entry.target as HTMLElement;
                    if (!counter.dataset.started) {
                        counter.dataset.started = "true";
                        const target = +(counter.getAttribute('data-target') || "0");
                        let count = 0;
                        const update = () => {
                            const increment = target / 50;
                            if (count < target) {
                                count += increment;
                                counter.innerText = Math.ceil(count).toLocaleString() + (target >= 500 ? '+' : '');
                                setTimeout(update, 30);
                            } else {
                                counter.innerText = target.toLocaleString() + (target >= 500 ? '+' : '');
                            }
                        };
                        update();
                    }
                    statsObserver.unobserve(counter);
                }
            });
        }, { threshold: 0.1 });

        const counters = document.querySelectorAll('[data-target]');
        counters.forEach(counter => statsObserver.observe(counter));

        const featureObserver = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry, index) => {
              if (entry.isIntersecting) {
                setTimeout(() => {
                  entry.target.classList.add('visible');
                }, index * 100);
                featureObserver.unobserve(entry.target);
              }
            });
          },
          { threshold: 0.15 }
        );
        document.querySelectorAll('.feature-card').forEach(card => featureObserver.observe(card));


        return () => {
            featureObserver.disconnect();
            window.removeEventListener('scroll', handleScroll);
            revealObserver.disconnect();
            lineObserver.disconnect();
            statsObserver.disconnect();
        };
    }, []);

    return (
        <div className="font-body text-landing-on-surface animated-mesh-bg">
            <style>{`
                .material-symbols-outlined { font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24; }
                .glass-card { background: rgba(255, 255, 255, 0.4); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.3); }
                .levitate { animation: float 6s ease-in-out infinite; }
                @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-20px); } }
                @keyframes float-icon { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
                .animate-float-icon { animation: float-icon 2s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
                .scrolling-marquee { display: flex; width: fit-content; animation: marquee 30s linear infinite; }
                @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
                .reveal { opacity: 0; transform: translateY(30px); transition: all 0.8s ease-out; }
                .reveal.active { opacity: 1; transform: translateY(0); }
                body { background: radial-gradient(circle at top right, #e0f2f1 0%, #f0f9f9 50%, #ffffff 100%); background-attachment: fixed; }
                .hero-title { letter-spacing: -0.02em; line-height: 0.95; color: #0f172a; }
                .reveal-left { opacity: 0; transform: translateX(-50px); transition: all 1s ease-out; }
                .reveal-right { opacity: 0; transform: translateX(50px); transition: all 1s ease-out; }
                .reveal-left.active, .reveal-right.active { opacity: 1; transform: translateX(0); }
                @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
                .animate-fade-in { animation: fade-in 0.3s ease-out forwards; }
                
                body { overflow-x: hidden; }
                section, header, footer, .main-content-flow {
                  position: relative;
                  z-index: 1;
                }
                nav {
                  position: sticky !important;
                  top: 0;
                  z-index: 50 !important;
                  backdrop-filter: blur(16px) !important;
                  -webkit-backdrop-filter: blur(16px) !important;
                  background: rgba(240,253,249,0.85) !important;
                  border-bottom: 1px solid rgba(59,130,246,0.1) !important;
                }
                .glass-card-morphism {
                  background: rgba(255,255,255,0.7) !important;
                  backdrop-filter: blur(12px) !important;
                  -webkit-backdrop-filter: blur(12px) !important;
                  border: 1px solid rgba(255,255,255,0.8) !important;
                  box-shadow: 0 4px 24px rgba(59,130,246,0.08) !important;
                }
                
                @keyframes textShimmer {
                  0% { background-position: 0% center; }
                  100% { background-position: -200% center; }
                }
                
                @keyframes gradientMove {
                  0% { background-position: 0% 0%; }
                  50% { background-position: 0% 100%; }
                  100% { background-position: 0% 0%; }
                }
                .animated-mesh-bg {
                  background: linear-gradient(180deg, #f0fdf9 0%, #e8f8f5 8%, #f0fdf9 20%, #edfaf7 30%, #f7fffe 40%, #e6f7f4 50%, #f2fbf9 60%, #eafaf7 70%, #f5fffe 80%, #e8f8f5 90%, #3B82F6 95%, #0a7c73 100%);
                  background-size: 100% 400%;
                  animation: gradientMove 30s ease infinite;
                  min-height: 100vh;
                  position: relative;
                }

                @keyframes drift1 {
                  0%, 100% { transform: translate(0,0) scale(1); }
                  33% { transform: translate(40px,-30px) scale(1.1); }
                  66% { transform: translate(-20px,40px) scale(0.95); }
                }
                @keyframes drift2 {
                  0%, 100% { transform: translate(0,0) scale(1); }
                  33% { transform: translate(-50px,30px) scale(1.05); }
                  66% { transform: translate(30px,-40px) scale(0.9); }
                }
                @keyframes drift3 {
                  0%, 100% { transform: translate(0,0) scale(1); }
                  50% { transform: translate(60px,-20px) scale(1.08); }
                }
                @keyframes drift4 {
                  0%, 100% { transform: translate(0,0) scale(1); }
                  50% { transform: translate(-40px,50px) scale(1.06); }
                }
                @keyframes drift5 {
                  0%, 100% { transform: translate(0,0) scale(1); }
                  33% { transform: translate(-30px,-20px) scale(1.04); }
                  66% { transform: translate(50px,30px) scale(0.96); }
                }
                .mockup-wrapper {
                  border-radius: 16px;
                  overflow: hidden;
                  box-shadow: 0 25px 60px rgba(0,0,0,0.2);
                  border: 1px solid rgba(255,255,255,0.1);
                  max-width: 720px;
                  width: 100%;
                  animation: float 4s ease-in-out infinite;
                }
                .browser-bar {
                  background: #f8fafc;
                  border-bottom: 1px solid #e2e8f0;
                  padding: 8px 12px;
                  display: flex;
                  align-items: center;
                  gap: 8px;
                }
                .dots { display: flex; gap: 5px; }
                .dot { width: 10px; height: 10px; border-radius: 50%; }
                .dot.red { background: #f87171; }
                .dot.yellow { background: #fbbf24; }
                .dot.green { background: #4ade80; }
                .url-bar {
                  background: #e2e8f0;
                  border-radius: 6px;
                  padding: 3px 12px;
                  font-size: 11px;
                  color: #64748b;
                  flex: 1;
                  max-width: 220px;
                }
                .dashboard-body {
                  display: flex;
                  background: #f8fafc;
                  height: 420px;
                }
                .mini-sidebar {
                  width: 140px;
                  background: #0d1117;
                  padding: 12px 8px;
                  flex-shrink: 0;
                }
                .sidebar-logo {
                  display: flex;
                  align-items: center;
                  gap: 6px;
                  padding: 8px;
                  margin-bottom: 12px;
                }
                .logo-icon { color: #14b8a6; font-size: 14px; }
                .logo-text { color: white; font-size: 11px; font-weight: 700; }
                .sidebar-section-title {
                  font-size: 7px;
                  font-weight: 700;
                  text-transform: uppercase;
                  color: #8b949e;
                  margin: 8px 0 4px 6px;
                  letter-spacing: 0.1em;
                }
                .sidebar-item {
                  padding: 5px 8px;
                  border-radius: 8px;
                  font-size: 9px;
                  color: rgba(255,255,255,0.5);
                  margin-bottom: 2px;
                  cursor: pointer;
                  display: flex;
                  align-items: center;
                  gap: 6px;
                }
                .sidebar-item.active {
                  background: rgba(59,130,246,0.2);
                  color: white;
                  border-left: 2px solid #14b8a6;
                }
                .sidebar-icon-placeholder {
                  width: 14px; height: 14px;
                  border-radius: 4px;
                  background: rgba(255,255,255,0.1);
                  flex-shrink: 0;
                }
                .sidebar-item.active .sidebar-icon-placeholder {
                  background: #14b8a6;
                }
                .main-content {
                  flex: 1;
                  padding: 12px;
                  overflow: hidden;
                }
                .dash-header {
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  margin-bottom: 12px;
                }
                .search-bar {
                  background: white;
                  border: 1px solid #e2e8f0;
                  border-radius: 8px;
                  padding: 6px 12px;
                  font-size: 10px;
                  color: #94a3b8;
                  width: 200px;
                }
                .header-right { display: flex; align-items: center; gap: 8px; }
                .bell { font-size: 14px; }
                .avatar {
                  width: 28px; height: 28px;
                  background: #3B82F6;
                  border-radius: 50%;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  color: white;
                  font-size: 9px;
                  font-weight: 700;
                }
                .stats-row { display: flex; gap: 8px; margin-bottom: 10px; }
                .stat-card {
                  background: white;
                  border-radius: 10px;
                  padding: 10px;
                  flex: 1;
                  border: 1px solid #e8f0fe;
                  box-shadow: 0 1px 4px rgba(0,0,0,0.05);
                }
                .stat-label {
                  font-size: 8px;
                  color: #94a3b8;
                  margin-bottom: 4px;
                  text-transform: uppercase;
                  font-weight: 600;
                }
                .stat-value {
                  font-size: 16px;
                  font-weight: 800;
                  line-height: 1;
                  margin-bottom: 4px;
                }
                .stat-value.blue { color: #1d4ed8; }
                .stat-value.green { color: #15803d; }
                .stat-value.blue { color: #3B82F6; }
                .stat-value.gold { color: #854d0e; font-size: 11px; }
                .stat-badge {
                  font-size: 8px;
                  color: #16a34a;
                  background: #f0fdf4;
                  border-radius: 999px;
                  padding: 1px 6px;
                  display: inline-block;
                  font-weight: 600;
                }
                .bottom-row { display: flex; gap: 8px; height: 260px; }
                .appointments-card {
                  flex: 1.3;
                  background: white;
                  border-radius: 10px;
                  padding: 10px 12px;
                  border: 1px solid #e8f0fe;
                  overflow: hidden;
                }
                .right-col {
                  flex: 1;
                  display: flex;
                  flex-direction: column;
                  gap: 8px;
                }
                .card-title {
                  font-size: 10px;
                  font-weight: 700;
                  color: #0f172a;
                  margin-bottom: 8px;
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                }
                .badge-blue {
                  font-size: 8px;
                  background: #f0fdfa;
                  color: #3B82F6;
                  border-radius: 999px;
                  padding: 2px 6px;
                  font-weight: 600;
                }
                .badge-orange {
                  font-size: 8px;
                  background: #fffbeb;
                  color: #f59e0b;
                  border-radius: 999px;
                  padding: 2px 6px;
                  font-weight: 600;
                }
                .appt-row {
                  display: flex;
                  align-items: center;
                  gap: 8px;
                  padding: 6px 8px;
                  border-radius: 8px;
                  background: #fafafa;
                  margin-bottom: 4px;
                  border: 1px solid #f1f5f9;
                }
                .appt-avatar {
                  width: 26px; height: 26px;
                  border-radius: 8px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  font-size: 11px;
                  font-weight: 700;
                  flex-shrink: 0;
                }
                .appt-avatar.green { background: #f0fdf4; color: #16a34a; }
                .appt-avatar.blue { background: #eff6ff; color: #1d4ed8; }
                .appt-avatar.orange { background: #fffbeb; color: #d97706; }
                .appt-avatar.purple { background: #f5f3ff; color: #7c3aed; }
                .appt-name { font-size: 9px; font-weight: 600; color: #0f172a; }
                .appt-type {
                  font-size: 8px;
                  font-weight: 500;
                  border-radius: 999px;
                  padding: 1px 6px;
                  display: inline-block;
                  margin-top: 1px;
                }
                .appt-type.green { background: #f0fdf4; color: #16a34a; }
                .appt-type.blue { background: #eff6ff; color: #1d4ed8; }
                .appt-type.orange { background: #fffbeb; color: #d97706; }
                .appt-type.purple { background: #f5f3ff; color: #7c3aed; }
                .appt-time {
                  margin-left: auto;
                  font-size: 9px;
                  font-weight: 600;
                  color: #475569;
                  background: #f1f5f9;
                  padding: 2px 6px;
                  border-radius: 6px;
                }
                .chart-card, .invoices-card {
                  background: white;
                  border-radius: 10px;
                  padding: 10px 12px;
                  border: 1px solid #e8f0fe;
                  flex: 1;
                }
                .bars {
                  display: flex;
                  align-items: flex-end;
                  gap: 4px;
                  height: 70px;
                }
                .bar-wrap {
                  flex: 1;
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  gap: 3px;
                  height: 100%;
                  justify-content: flex-end;
                }
                .bar {
                  width: 100%;
                  background: #e2e8f0;
                  border-radius: 3px 3px 0 0;
                  transition: height 0.3s;
                }
                .bar.blue {
                  background: linear-gradient(180deg, #60a5fa, #3B82F6);
                  box-shadow: 0 -2px 6px rgba(59,130,246,0.3);
                }
                .bar-wrap span { font-size: 8px; color: #94a3b8; font-weight: 500; }
                .blue-text { color: #3B82F6 !important; }
                .invoice-row {
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  padding: 7px 8px;
                  background: #fffbeb;
                  border-radius: 8px;
                  border: 1px solid #fef3c7;
                  margin-bottom: 4px;
                }
                .inv-name { font-size: 9px; font-weight: 600; color: #0f172a; }
                .inv-sub { font-size: 8px; color: #94a3b8; margin-top: 1px; }
                .inv-amount { font-size: 10px; font-weight: 700; color: #f59e0b; }
            `}</style>
            
            <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', width: '700px', height: '700px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.18) 0%, rgba(20,184,166,0.08) 50%, transparent 100%)', filter: 'blur(60px)', top: '-200px', left: '-200px', animation: 'drift1 20s ease-in-out infinite' }}></div>
                <div style={{ position: 'absolute', width: '600px', height: '600px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(56,189,248,0.12) 0%, rgba(14,165,233,0.06) 50%, transparent 100%)', filter: 'blur(70px)', top: '-100px', right: '-150px', animation: 'drift2 25s ease-in-out infinite' }}></div>
                <div style={{ position: 'absolute', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(45,212,191,0.15) 0%, rgba(94,234,212,0.06) 50%, transparent 100%)', filter: 'blur(80px)', top: '35%', left: '-100px', animation: 'drift3 18s ease-in-out infinite' }}></div>
                <div style={{ position: 'absolute', width: '650px', height: '650px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.12) 0%, rgba(15,118,110,0.05) 50%, transparent 100%)', filter: 'blur(90px)', top: '55%', right: '-200px', animation: 'drift4 22s ease-in-out infinite' }}></div>
                <div style={{ position: 'absolute', width: '800px', height: '800px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(20,184,166,0.2) 0%, rgba(59,130,246,0.08) 50%, transparent 100%)', filter: 'blur(100px)', bottom: '-300px', left: '20%', animation: 'drift5 30s ease-in-out infinite' }}></div>
            </div>

            {/* Progress Bar */}
            <div className="fixed top-0 left-0 w-full h-1 bg-landing-surface-container-highest z-[60]">
                <div className="h-full bg-landing-primary transition-all duration-150" id="scroll-progress" style={{ width: '0%' }}></div>
            </div>

            {/* Navigation */}
            <nav className="fixed top-0 w-full z-50 bg-white/40 backdrop-blur-xl border-b border-white/20">
                <div className="flex justify-between items-center px-8 py-4 max-w-7xl mx-auto">
                    <div className="flex items-center gap-2 group cursor-pointer" onClick={() => window.scrollTo({ top:0, behavior:'smooth' })}>
                        <span className="material-symbols-outlined text-landing-primary text-3xl transition-transform duration-300 group-hover:scale-110 group-hover:rotate-90">add</span>
                        <span className="text-xl font-semibold text-blue-800 font-headline tracking-tight">MacroMedica</span>
                    </div>
                    <div className="hidden md:flex items-center gap-8">
                        <a className="text-slate-600 font-medium font-headline tracking-tight hover:text-blue-500 transition-colors duration-200 cursor-pointer" href="#features" onClick={(e) => { e.preventDefault(); document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' }) }}>Fonctionnalités</a>
                        <a className="text-slate-600 font-medium font-headline tracking-tight hover:text-blue-500 transition-colors duration-200 cursor-pointer" href="#how-it-works" onClick={(e) => { e.preventDefault(); document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' }) }}>Comment ça marche</a>
                        <a className="text-slate-600 font-medium font-headline tracking-tight hover:text-blue-500 transition-colors duration-200 cursor-pointer" href="#pricing" onClick={(e) => { e.preventDefault(); document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' }) }}>Tarifs</a>
                        <a className="text-slate-600 font-medium font-headline tracking-tight hover:text-blue-500 transition-colors duration-200 cursor-pointer" href="#testimonials" onClick={(e) => { e.preventDefault(); document.getElementById('testimonials')?.scrollIntoView({ behavior: 'smooth' }) }}>Témoignages</a>
                    </div>
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate('/login')} className="px-5 py-2 text-slate-600 font-semibold font-label hover:text-landing-primary transition-colors">Connexion</button>
                        <button onClick={() => navigate('/login')} style={{ background: "#00685f", color: "#ffffff", padding: "12px 24px", borderRadius: "8px", fontWeight: 700, border: "none", cursor: "pointer", transition: "all 0.2s ease" }}>Essai Gratuit</button>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="relative pt-20 pb-24 px-8">
                <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                    <div className="z-10" style={{ width: "100%", overflow: "visible" }}>
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/60 backdrop-blur-md border border-blue-100 rounded-full mb-8 shadow-sm">
                            <span className="material-symbols-outlined text-blue-600 text-sm">auto_awesome</span>
                            <span className="text-blue-800 text-xs font-bold uppercase tracking-wider">Conçu pour les médecins marocains</span>
                        </div>
                        <h1 className="hero-title text-7xl md:text-8xl font-['Outfit'] font-black mb-8">
                            La gestion <br /> intelligente <br />
                            <span style={{ background: 'linear-gradient(90deg, #00685f 0%, #14b8a6 25%, #2dd4bf 50%, #14b8a6 75%, #00685f 100%)', backgroundSize: '200% auto', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', animation: 'textShimmer 4s linear infinite', display: 'inline-block' }}>de votre cabinet.</span>
                        </h1>
                        <p className="text-xl text-[#3d4947] mb-10 max-w-xl leading-relaxed">
                            Une interface épurée conçue pour les praticiens exigeants. Alliez précision clinique et fluidité opérationnelle avec la plateforme leader au Maroc.
                        </p>
                        <div className="flex flex-wrap gap-4">
                            <button onClick={() => navigate('/login')} style={{ background: "#00685f", color: "#ffffff", padding: "12px 24px", borderRadius: "8px", fontWeight: 700, border: "none", cursor: "pointer", transition: "all 0.2s ease", display: "inline-flex", alignItems: "center", gap: "8px" }}>
                                ESSAI GRATUIT
                                <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">arrow_forward</span>
                            </button>
                            <button onClick={() => { document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' }) }} style={{ background: "transparent", color: "#191c1e", border: "2px solid #191c1e", padding: "12px 24px", borderRadius: "8px", fontWeight: 700, cursor: "pointer" }}>
                                VOIR LA DÉMO
                            </button>
                        </div>
                        <div className="mt-12 flex items-center gap-6 text-sm text-[#3d4947]">
                            <div className="flex -space-x-3">
                                <img alt="Médecin" className="w-10 h-10 rounded-full border-4 border-white shadow-sm" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBTjvP3BA0dkZ_MvcUTIB6PijFQgqZNbZHXIgk72yzj8ZGyt0MorLDfBGSbtTuHh2S5rES7tdMdUEq0MVskUW2VtSSnVwYU3g3wVIPnMKq_MRYZDN1o68D-xz9lm9-1RWJUqhSqfEyYUtJ4_-tT8gOJJig2qi9dlT5YYjY7lELCZwcPUvOd5xDT0FPEng_qT3_mAyyd-iptntS_OP9ck5wbLIzDwLPbIrfWrxB4ij8B_08jH-rto2b22T6WvnY0IaZ6KwxNiPIxJ4Y" />
                                <img alt="Médecin" className="w-10 h-10 rounded-full border-4 border-white shadow-sm" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBY9J12AI-fNmK7fmy4C84kTn97TfSaXO1yVW_2dmT89WNRYiHWUVrekfC_9zMrxA2wc1qXjJkF1tRL2j6AYpBMYNqhm06yNzw6y1C7AtZzyy0Ztq17UZi-nzIiXE8UvtVdAQWGobl5sXoBvNwO20snFgxkpaKtO-C5S1PK8AeZclUBIk0xDOtIQq-EL8R87UHTslT_HaE3plZwvyTlEAJ7Sr12IMughoq1KgRn55frVXu6hKXqWcwHMmaTWWkW2MjXXehCoqo9J_Y" />
                                <img alt="Médecin" className="w-10 h-10 rounded-full border-4 border-white shadow-sm" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAPxfzDhenGWv8buT3fsVRUXrUd7fQRGaCoWA8zNHGpo36LcDjXhZkGOonrJkaO1amE8-kOaR3ZdbHiAZPgY0VTUv9QuL5PRxdgY2P0e_5jd8O2CvNq5jMTF3IimqAuqc2vpFtW8y26Ons_y_kKY0aQ7Q6ZbNTqE15oBKXxNUUuAiQ9SPVbnxYxRO3qyu6mzhnLHfJATIA8q7JHGCpABMBKIyz91pbrpEXyIvJuRK759PeqdX0kW-1sgJEyNgZhpFEC8t8obg640As" />
                            </div>
                            <p>Rejoint par <span className="text-landing-primary font-bold">+500 médecins</span> ce mois-ci</p>
                        </div>
                    </div>
                    <div className="relative levitate">
                        <div className="absolute -inset-20 bg-blue-200/20 blur-[120px] rounded-full"></div>
                        
                        {/* Updated Dashboard Mockup */}
                        <div className="mockup-wrapper relative z-10 text-left">
                          <div className="browser-bar">
                            <div className="dots">
                              <span className="dot red"></span>
                              <span className="dot yellow"></span>
                              <span className="dot green"></span>
                            </div>
                            <div className="url-bar">
                              🔒 macromedica.app
                            </div>
                          </div>
                        
                          <div className="dashboard-body flex" style={{ height: '520px' }}>
                            {/* Mini Sidebar */}
                            <div className="mini-sidebar flex flex-col" style={{ width: '240px', background: '#0d1117', padding: '16px', flexShrink: 0 }}>
                              <div className="sidebar-logo flex items-center gap-2 px-3 py-2">
                                <span style={{ color: '#14b8a6', fontSize: '24px' }}>✦</span>
                                <span style={{ color: 'white', fontSize: '18px', fontWeight: 700 }}>MacroMedica</span>
                              </div>
                              
                              <div className="mt-4">
                                <div className="sidebar-section-title text-xs font-bold uppercase tracking-wide text-[#94a3b8] px-3 mb-2">Pilotage</div>
                                <div className="sidebar-items space-y-1">
                                  <div className="sidebar-item active flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5 text-white border-l-2 border-[#14b8a6]">
                                    <div className="sidebar-icon-placeholder w-5 h-5 rounded bg-[#14b8a6]"></div>
                                    <span className="text-sm">Tableau de bord</span>
                                  </div>
                                  <div className="sidebar-item flex items-center gap-3 px-3 py-2 rounded-lg text-[#94a3b8] hover:bg-white/5">
                                    <div className="sidebar-icon-placeholder w-5 h-5 rounded bg-white/10"></div>
                                    <span className="text-sm">Agenda</span>
                                  </div>
                                </div>
                              </div>
                              
                              <div className="mt-6">
                                <div className="sidebar-section-title text-xs font-bold uppercase tracking-wide text-[#94a3b8] px-3 mb-2">Cœur de métier</div>
                                <div className="sidebar-items space-y-1">
                                  <div className="sidebar-item flex items-center gap-3 px-3 py-2 rounded-lg text-[#94a3b8] hover:bg-white/5">
                                    <div className="sidebar-icon-placeholder w-5 h-5 rounded bg-white/10"></div>
                                    <span className="text-sm">Dossiers patients</span>
                                  </div>
                                  <div className="sidebar-item flex items-center gap-3 px-3 py-2 rounded-lg text-[#94a3b8] hover:bg-white/5">
                                    <div className="sidebar-icon-placeholder w-5 h-5 rounded bg-white/10"></div>
                                    <span className="text-sm">Salle d'attente</span>
                                  </div>
                                </div>
                              </div>
                              
                              <div className="mt-auto">
                                <div className="rounded-2xl bg-white/5 p-4">
                                  <div className="sidebar-section-title text-xs font-bold uppercase tracking-wide text-[#94a3b8] mb-2">Administration</div>
                                  <div className="text-sm text-white font-medium">Cabinet Central</div>
                                  <div className="text-xs text-[#94a3b8] mt-1 capitalize">Rôle: Docteur</div>
                                </div>
                              </div>
                            </div>
                            
                            {/* Main Content */}
                            <div className="main-content flex-1 bg-[#f8fafc] p-6 overflow-hidden">
                              <div className="dash-header flex items-center justify-between mb-6">
                                <div>
                                  <h2 className="text-2xl font-bold text-slate-900">Bonjour, Dr Benali</h2>
                                  <p className="text-sm text-slate-600 mt-1">Prêt pour une journée productive</p>
                                </div>
                                <div className="flex items-center gap-4">
                                  <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#2563eb] to-[#14b8a6] flex items-center justify-center text-white font-bold">
                                    DB
                                  </div>
                                </div>
                              </div>
                              
                              {/* Stats Cards */}
                              <div className="stats-row grid grid-cols-4 gap-4 mb-6">
                                <div className="stat-card bg-white border border-[#e2e8f0] rounded-[21px] px-5 py-4 shadow-sm">
                                  <div className="stat-label text-xs font-semibold text-slate-600 uppercase">Patients actifs</div>
                                  <div className="stat-value text-4xl font-black text-blue-700">1,248</div>
                                  <div className="stat-badge text-xs text-emerald-600 font-semibold mt-1">↗ +12%</div>
                                </div>
                                <div className="stat-card bg-white border border-[#e2e8f0] rounded-[21px] px-5 py-4 shadow-sm">
                                  <div className="stat-label text-xs font-semibold text-slate-600 uppercase">RDV aujourd'hui</div>
                                  <div className="stat-value text-4xl font-black text-emerald-700">14</div>
                                  <div className="stat-badge text-xs text-emerald-600 font-semibold mt-1">↗ +3</div>
                                </div>
                                <div className="stat-card bg-white border border-[#e2e8f0] rounded-[21px] px-5 py-4 shadow-sm">
                                  <div className="stat-label text-xs font-semibold text-slate-600 uppercase">Consultations</div>
                                  <div className="stat-value text-4xl font-black text-blue-700">89</div>
                                  <div className="stat-badge text-xs text-emerald-600 font-semibold mt-1">↗ ce mois</div>
                                </div>
                                <div className="stat-card bg-white border border-[#e2e8f0] rounded-[21px] px-5 py-4 shadow-sm">
                                  <div className="stat-label text-xs font-semibold text-slate-600 uppercase">Revenus</div>
                                  <div className="stat-value text-4xl font-black text-amber-700">42,500</div>
                                  <div className="stat-badge text-xs text-amber-600 font-semibold mt-1">MAD</div>
                                </div>
                              </div>
                              
                              {/* Bottom Row */}
                              <div className="bottom-row grid grid-cols-3 gap-4" style={{ height: '260px' }}>
                                <div className="appointments-card col-span-2 bg-white border border-[#e2e8f0] rounded-[21px] p-5 shadow-sm">
                                  <div className="card-title flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-bold text-slate-900">Salle d'attente</h3>
                                    <span className="badge-blue bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold">6 patients</span>
                                  </div>
                                  <div className="appt-list space-y-3">
                                    <div className="appt-row flex items-center gap-4 p-3 bg-slate-50 rounded-xl border-l-4 border-blue-500">
                                      <div className="appt-avatar w-10 h-10 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-sm">M</div>
                                      <div className="appt-info flex-1">
                                        <div className="appt-name font-semibold text-slate-900">Marie-Claire Fontaine</div>
                                        <div className="appt-type text-xs text-slate-600">Consultation annuelle • 09:45</div>
                                      </div>
                                      <div className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700">EN COURS</div>
                                    </div>
                                    <div className="appt-row flex items-center gap-4 p-3 bg-slate-50 rounded-xl border-l-4 border-red-500">
                                      <div className="appt-avatar w-10 h-10 rounded-full bg-red-50 text-red-700 flex items-center justify-center font-bold text-sm">J</div>
                                      <div className="appt-info flex-1">
                                        <div className="appt-name font-semibold text-slate-900">Jean-Pierre Bertrand</div>
                                        <div className="appt-type text-xs text-slate-600">Douleurs thoraciques • Attente: 8 min</div>
                                      </div>
                                      <div className="px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">URGENCE</div>
                                    </div>
                                  </div>
                                </div>
                                
                                <div className="right-col flex flex-col gap-4">
                                  <div className="invoices-card bg-white border border-[#e2e8f0] rounded-[21px] p-5 shadow-sm flex-1">
                                    <div className="card-title flex items-center justify-between mb-4">
                                      <h3 className="text-lg font-bold text-slate-900">Tâches du jour</h3>
                                      <span className="badge-orange bg-amber-50 text-amber-700 px-3 py-1 rounded-full text-xs font-semibold">4</span>
                                    </div>
                                    <div className="space-y-2">
                                      <div className="invoice-row flex items-center justify-between p-3 bg-amber-50 rounded-xl border border-amber-100">
                                        <div>
                                          <div className="inv-name font-semibold text-slate-900 text-sm">Signer ordonnances</div>
                                          <div className="inv-sub text-xs text-slate-500">À traiter</div>
                                        </div>
                                      </div>
                                      <div className="invoice-row flex items-center justify-between p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                                        <div>
                                          <div className="inv-name font-semibold text-slate-900 text-sm">Voir résultats</div>
                                          <div className="inv-sub text-xs text-slate-500">Nouveaux</div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Floating Elements */}
                        <div className="absolute -top-10 -right-10 glass-card p-5 rounded-2xl shadow-xl border border-white/50 w-44 text-center hidden md:block z-20">
                            <span className="material-symbols-outlined text-landing-primary text-4xl mb-2" style={{ fontVariationSettings: "'FILL' 1" }}>analytics</span>
                            <p className="text-sm font-bold text-slate-900">Analyses IA</p>
                            <p className="text-[10px] text-[#3d4947]">Optimisation des flux</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Trust Bar */}
            <div className="py-12 bg-white/30 backdrop-blur-sm overflow-hidden border-y border-blue-100/50">
                <div className="scrolling-marquee flex items-center gap-24 grayscale opacity-40">
                    <span className="text-2xl font-headline font-bold uppercase tracking-widest whitespace-nowrap">Clinique Agdal</span>
                    <span className="text-2xl font-headline font-bold uppercase tracking-widest whitespace-nowrap">Hôpital Cheikh Zaid</span>
                    <span className="text-2xl font-headline font-bold uppercase tracking-widest whitespace-nowrap">Cabinet Dr. Alami</span>
                    <span className="text-2xl font-headline font-bold uppercase tracking-widest whitespace-nowrap">Groupe AKDITAL</span>
                    <span className="text-2xl font-headline font-bold uppercase tracking-widest whitespace-nowrap">Centre de Radiologie</span>
                    {/* Duplicates for seamless scroll */}
                    <span className="text-2xl font-headline font-bold uppercase tracking-widest whitespace-nowrap">Clinique Agdal</span>
                    <span className="text-2xl font-headline font-bold uppercase tracking-widest whitespace-nowrap">Hôpital Cheikh Zaid</span>
                    <span className="text-2xl font-headline font-bold uppercase tracking-widest whitespace-nowrap">Cabinet Dr. Alami</span>
                    <span className="text-2xl font-headline font-bold uppercase tracking-widest whitespace-nowrap">Groupe AKDITAL</span>
                    <span className="text-2xl font-headline font-bold uppercase tracking-widest whitespace-nowrap">Centre de Radiologie</span>
                </div>
            </div>

            {/* Features Section */}
            <section className="py-32 px-8" id="features">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-24 reveal">
                        <h2 className="text-5xl font-headline font-light mb-6 text-[#191c1e]">Conçu pour la <span className="font-bold text-landing-primary">Pratique Moderne</span></h2>
                        <p className="text-[#3d4947] text-lg max-w-2xl mx-auto">Chaque module est optimisé pour réduire la charge mentale et maximiser le temps passé avec vos patients.</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {
                            [
                                { icon: "folder_shared", title: "Dossiers Patients", description: "Historique complet, imagerie médicale et antécédents accessibles en un clic. Sécurisé et centralisé." },
                                { icon: "calendar_month", title: "Gestion des RDV", description: "Agenda intelligent avec rappels SMS automatiques pour réduire les rendez-vous non honorés de 40%." },
                                { icon: "prescriptions", title: "Ordonnances", description: "Générateur intelligent d'ordonnances avec base de données médicamenteuse marocaine mise à jour." },
                                { icon: "account_balance_wallet", title: "Facturation", description: "Télétransmission facilitée et facturation conforme aux normes fiscales marocaines en vigueur." },
                                { icon: "query_stats", title: "Statistiques", description: "Analysez la performance de votre cabinet en temps réel : revenus, fréquentation et analyses prédictives." },
                                { icon: "verified_user", title: "Sécurité Totale", description: "Chiffrement de bout en bout et hébergement conforme à la protection des données de santé au Maroc." }
                            ].map((feature, idx) => (
                                <FeatureCard3D 
                                    key={idx}
                                    icon={feature.icon}
                                    title={feature.title}
                                    description={feature.description}
                                />
                            ))
                        }
                    </div>
                </div>
            </section>

            {/* How It Works Section */}
            <section className="py-32 relative overflow-hidden" id="how-it-works">
                <div className="max-w-7xl mx-auto px-8 relative">
                    <div className="text-center mb-24 reveal">
                        <h2 className="text-5xl font-headline font-light text-[#191c1e]">Prêt en <span className="font-bold text-landing-primary">3 Minutes</span></h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-20 relative">
                        <div className="relative z-10 text-center reveal group flex flex-col items-center">
                            <div className="h-16 flex items-end justify-center mb-6">
                               <h3 className="text-[28px] md:text-3xl font-headline font-black text-slate-800 transition-all duration-500 group-hover:-translate-y-2 group-hover:text-landing-primary relative">
                                   Compte
                                   <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-1 bg-landing-primary transition-all duration-500 group-hover:w-full rounded-full opacity-0 group-hover:opacity-100"></span>
                               </h3>
                            </div>
                            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl border-[5px] border-landing-primary transition-all duration-500 group-hover:scale-110 group-hover:shadow-landing-primary/30 z-10">
                                <span className="text-3xl font-headline font-black text-landing-primary">01</span>
                            </div>
                            <p className="text-[#3d4947] text-lg">Créez votre profil professionnel et configurez les détails de votre clinique.</p>
                        </div>

                        <div className="relative z-10 text-center reveal group flex flex-col items-center">
                            <div className="h-16 flex items-end justify-center mb-6">
                               <h3 className="text-[28px] md:text-3xl font-headline font-black text-slate-800 transition-all duration-500 group-hover:-translate-y-2 group-hover:text-landing-primary relative">
                                   Import <span className="text-lg md:text-xl font-medium text-slate-500">(Optionnel)</span>
                                   <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-1 bg-landing-primary transition-all duration-500 group-hover:w-full rounded-full opacity-0 group-hover:opacity-100"></span>
                               </h3>
                            </div>
                            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl border-[5px] border-landing-primary transition-all duration-500 group-hover:scale-110 group-hover:shadow-landing-primary/30 z-10">
                                <span className="text-3xl font-headline font-black text-landing-primary">02</span>
                            </div>
                            <p className="text-[#3d4947] text-lg">Importez vos données patients existantes via nos outils de migration automatique.</p>
                        </div>

                        <div className="relative z-10 text-center reveal group flex flex-col items-center">
                            <div className="h-16 flex items-end justify-center mb-6">
                               <h3 className="text-[28px] md:text-3xl font-headline font-black text-slate-800 transition-all duration-500 group-hover:-translate-y-2 group-hover:text-landing-primary relative">
                                   Gestion
                                   <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-1 bg-landing-primary transition-all duration-500 group-hover:w-full rounded-full opacity-0 group-hover:opacity-100"></span>
                               </h3>
                            </div>
                            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl border-[5px] border-landing-primary transition-all duration-500 group-hover:scale-110 group-hover:shadow-landing-primary/30 z-10">
                                <span className="text-3xl font-headline font-black text-landing-primary">03</span>
                            </div>
                            <p className="text-[#3d4947] text-lg">Prenez le contrôle total de votre activité avec une interface intuitive.</p>
                        </div>

                        <div className="absolute top-[136px] left-0 w-full h-1 bg-slate-200 -z-0 hidden md:block">
                            <div className="h-full bg-landing-primary transition-all duration-1000" id="connecting-line" style={{ width: '0%' }}></div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Stats Section */}
            <section className="py-24 text-white relative overflow-hidden" style={{ background: 'rgba(59,130,246,0.85)', backdropFilter: 'blur(20px)', borderTop: '1px solid rgba(255,255,255,0.2)', borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
                <div className="absolute inset-0 opacity-10">
                    <div className="absolute -top-24 -left-24 w-96 h-96 bg-white blur-[100px] rounded-full"></div>
                    <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-white blur-[100px] rounded-full"></div>
                </div>
                <div className="max-w-7xl mx-auto px-8 relative z-10">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-12 text-center">
                        <div className="reveal">
                            <p className="text-4xl md:text-5xl font-headline font-bold text-white mb-2" data-target="500">0</p>
                            <p className="text-landing-primary-fixed/80 font-medium uppercase tracking-widest text-[10px]">Médecins Actifs</p>
                        </div>
                        <div className="reveal">
                            <p className="text-4xl md:text-5xl font-headline font-bold text-white mb-2" data-target="50000">0</p>
                            <p className="text-landing-primary-fixed/80 font-medium uppercase tracking-widest text-[10px]">Patients Suivis</p>
                        </div>
                        <div className="reveal">
                            <p className="text-4xl md:text-5xl font-headline font-bold text-white mb-2" data-target="12">0</p>
                            <p className="text-landing-primary-fixed/80 font-medium uppercase tracking-widest text-[10px]">Villes au Maroc</p>
                        </div>
                        <div className="reveal">
                            <p className="text-4xl md:text-5xl font-headline font-bold text-white mb-2" data-target="99.9">0</p>
                            <p className="text-landing-primary-fixed/80 font-medium uppercase tracking-widest text-[10px]">Disponibilité</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Testimonials Section */}
            <section className="py-32 overflow-hidden" id="testimonials">
                <div className="max-w-7xl mx-auto px-8">
                    <h2 className="text-5xl font-headline font-light text-center mb-24 reveal text-[#191c1e]">Approuvé par les <span className="font-bold text-landing-primary">Experts</span></h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div className="reveal-left p-10 rounded-3xl glass-card-morphism relative">
                            <div className="flex gap-1 text-landing-primary mb-6">
                                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                            </div>
                            <p className="text-[#3d4947] italic mb-10 leading-relaxed">"MacroMedica a transformé ma gestion quotidienne. Je passe moins de temps sur la paperasse et plus avec mes patients."</p>
                            <div className="flex items-center gap-4">
                                <img alt="Dr. Ahmed Alami" className="w-12 h-12 rounded-full shadow-md" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDVZ9FZC3DySjqycQQag5Aqhh9ptRCcIZRIxbB2mrfoN3zPGhEPTo_DG5h-lSr_8NCyytQaUy-2z2XEdYlZquxH4V-PQ5snWQFkAf37TnXVgiOPdrP6xPBNV8fn2uthCy_LLxej-7pDQPEjrvzycLj2W1PTNskh4r2CCZz8LdZqkkqdMU4AfQVczaO2USh2aGa6rRFSHDyVAqH2LNXlRzT0OuBInh7nUvDuYTE6DhG21GnBHwADjCSnwKZrx87KPtZHQr20hXtgJKY" />
                                <div>
                                    <p className="font-bold text-slate-900">Dr. Ahmed Alami</p>
                                    <p className="text-xs text-[#3d4947]">Cardiologue, Casablanca</p>
                                </div>
                            </div>
                        </div>
                        <div className="reveal p-10 rounded-3xl glass-card-morphism relative transform md:-translate-y-8">
                            <div className="flex gap-1 text-landing-primary mb-6">
                                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                            </div>
                            <p className="text-[#3d4947] italic mb-10 leading-relaxed">"La meilleure solution pour la facturation au Maroc. C'est intuitif, rapide et extrêmement fiable au quotidien."</p>
                            <div className="flex items-center gap-4">
                                <img alt="Dr. Sara Bennani" className="w-12 h-12 rounded-full border-2 border-white/20 shadow-md" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCjaZmj2FMkBMxRVceMSwVB112miWzmbfZRJxE6zRsFXoSWCZdWUp0E-H_Q24Cz7LEdmu25CF1FfhmNY8qR5Poa97eOBs4u-TuTdeIrs2vn16zC6hiwy0oXuxbE0KuPn_QonRcyFEEecYOMkgl-mV2mgqmsklDjrJevRSesQg1AkU9KbiefSLg9ghHzfzjqYihYZChfP4me_I7t80G6DBoYedp4zf3Bb9BCmqjKqyrwHrgv0a35O3JYxuZhWYgcaG8Kt5khNpaHv9Q" />
                                <div>
                                    <p className="font-bold text-slate-900">Dr. Sara Bennani</p>
                                    <p className="text-xs text-[#3d4947]">Pédiatre, Rabat</p>
                                </div>
                            </div>
                        </div>
                        <div className="reveal-right p-10 rounded-3xl glass-card-morphism relative">
                            <div className="flex gap-1 text-landing-primary mb-6">
                                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                            </div>
                            <p className="text-[#3d4947] italic mb-10 leading-relaxed">"Le support technique est exceptionnel. On sent qu'ils comprennent les réalités du terrain médical marocain."</p>
                            <div className="flex items-center gap-4">
                                <img alt="Dr. Youssef Tazi" className="w-12 h-12 rounded-full shadow-md" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBPPvVb87c1y7xy6CxdpPXBihBMSj7e-Mmyt0_F-RDJ-Y6WxTh7xJD35yS9MHXVACSYpe1ph9Y5lGyHCT2ZF6SWCyK4rU8uoDEYfEsuyq5_N4pahuGBc9mFoqwjbcGnpODkNonYu2v-qJzBwj5w0byFVnHMvvtMI8u8f8fU9wJULCzIDIlGiAeMr3EOaMd9i0ckdockhRh9iue851YaKuCvuKkhL51r7ho3epvE-s-qoJy2D-tpaXTFRCXLJ2xM1vV3ZRD_t9k79uU" />
                                <div>
                                    <p className="font-bold">Dr. Youssef Tazi</p>
                                    <p className="text-xs text-[#3d4947]">Généraliste, Tanger</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Pricing Section */}
            <section className="py-32 flex justify-center w-full" id="pricing">
                <div className="w-full max-w-6xl mx-auto px-6">
                    <div className="text-center mb-16 reveal">
                        <h2 className="text-[32px] md:text-[40px] font-headline font-extrabold text-[#191c1e] tracking-tight mb-4">
                            Des tarifs transparents
                        </h2>
                        <p className="text-[#64748b] text-base font-medium">
                            Aucun frais caché. Annulable à tout moment.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center max-w-[1000px] mx-auto">
                        
                        {/* Plan 1: Solo */}
                        <div className="reveal flex flex-col h-full rounded-3xl p-8 glass-card-morphism transition-all duration-300 hover:-translate-y-1">
                            <h3 className="text-xl font-bold text-slate-900 mb-6">Solo</h3>
                            <div className="mb-4">
                                <span className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight">499 MAD</span>
                            </div>
                            <p className="text-[#64748b] text-[13px] leading-relaxed mb-6 h-10">
                                Pour un cabinet individuel qui veut tout centraliser.
                            </p>
                            <hr className="border-t border-slate-900/10 mb-6" />
                            <ul className="flex flex-col gap-4 mb-8 flex-1">
                                <li className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-[#14b8a6] text-[18px]">check_circle</span> 
                                    <span className="text-[13px] font-medium text-slate-700">Agenda intelligent</span>
                                </li>
                                <li className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-[#14b8a6] text-[18px]">check_circle</span> 
                                    <span className="text-[13px] font-medium text-slate-700">Dossiers patients</span>
                                </li>
                                <li className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-[#14b8a6] text-[18px]">check_circle</span> 
                                    <span className="text-[13px] font-medium text-slate-700">Ordonnances illimitées</span>
                                </li>
                                <li className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-[#14b8a6] text-[18px]">check_circle</span> 
                                    <span className="text-[13px] font-medium text-slate-700">Facturation simple</span>
                                </li>
                            </ul>
                            <button className="mt-auto w-full py-3 rounded-xl border border-slate-300 text-slate-800 font-bold hover:bg-slate-50 transition-colors text-[13px]">
                                Choisir ce plan
                            </button>
                        </div>

                        {/* Plan 2: Cabinet */}
                        <div className="reveal flex flex-col h-full rounded-3xl p-8 border-[3px] border-[#14b8a6] glass-card-morphism relative transform md:-translate-y-4">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold text-slate-900">Cabinet</h3>
                                <span className="bg-[#14b8a6] text-white text-[10px] uppercase font-bold tracking-wider py-[4px] px-3 rounded-full">Populaire</span>
                            </div>
                            <div className="mb-4">
                                <span className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight">899 MAD</span>
                            </div>
                            <p className="text-[#64748b] text-[13px] leading-relaxed mb-6 h-10">
                                Pour une équipe médicale avec coordination secrétariat + praticiens.
                            </p>
                            <hr className="border-t border-slate-900/10 mb-6" />
                            <ul className="flex flex-col gap-4 mb-8 flex-1">
                                <li className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-[#14b8a6] text-[18px]">check_circle</span> 
                                    <span className="text-[13px] font-medium text-slate-700">Utilisateurs multiples</span>
                                </li>
                                <li className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-[#14b8a6] text-[18px]">check_circle</span> 
                                    <span className="text-[13px] font-medium text-slate-700">Salle d'attente en direct</span>
                                </li>
                                <li className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-[#14b8a6] text-[18px]">check_circle</span> 
                                    <span className="text-[13px] font-medium text-slate-700">Facturation complète</span>
                                </li>
                                <li className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-[#14b8a6] text-[18px]">check_circle</span> 
                                    <span className="text-[13px] font-medium text-slate-700">Statistiques d'activité</span>
                                </li>
                            </ul>
                            <button onClick={() => navigate('/login')} className="mt-auto w-full py-3 rounded-xl bg-[#14b8a6] hover:bg-[#2563EB] text-white font-bold transition-colors shadow-lg shadow-blue-500/20 text-[13px]">
                                Essayer gratuitement
                            </button>
                        </div>

                        {/* Plan 3: Réseau */}
                        <div className="reveal flex flex-col h-full rounded-3xl p-8 glass-card-morphism transition-all duration-300 hover:-translate-y-1">
                            <h3 className="text-xl font-bold text-slate-900 mb-6">Réseau</h3>
                            <div className="mb-4">
                                <span className="text-4xl md:text-[42px] font-extrabold text-slate-900 tracking-tight">Sur devis</span>
                            </div>
                            <p className="text-[#64748b] text-[13px] leading-relaxed mb-6 h-10">
                                Pour groupes médicaux et cliniques multisites.
                            </p>
                            <hr className="border-t border-slate-100 mb-6" />
                            <ul className="flex flex-col gap-4 mb-8 flex-1">
                                <li className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-[#14b8a6] text-[18px]">check_circle</span> 
                                    <span className="text-[13px] font-medium text-slate-700">Multi-sites</span>
                                </li>
                                <li className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-[#14b8a6] text-[18px]">check_circle</span> 
                                    <span className="text-[13px] font-medium text-slate-700">Rôles avancés</span>
                                </li>
                                <li className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-[#14b8a6] text-[18px]">check_circle</span> 
                                    <span className="text-[13px] font-medium text-slate-700">Exports métier</span>
                                </li>
                                <li className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-[#14b8a6] text-[18px]">check_circle</span> 
                                    <span className="text-[13px] font-medium text-slate-700">Accompagnement dédié</span>
                                </li>
                            </ul>
                            <button className="mt-auto w-full py-3 rounded-xl border border-slate-200 text-slate-800 font-bold hover:bg-slate-50 transition-colors text-[13px]">
                                Choisir ce plan
                            </button>
                        </div>

                    </div>
                </div>
            </section>

            {/* FAQ Section */}
            <section className="py-32 px-8">
                <div className="max-w-3xl mx-auto">
                    <h2 className="text-4xl font-headline font-light text-center mb-16 reveal text-[#191c1e]">Questions <span className="font-bold text-landing-primary">Fréquentes</span></h2>
                    <div className="space-y-4">
                        <div className="reveal border-b border-blue-100 pb-4 group cursor-pointer">
                            <div className="flex justify-between items-center py-4">
                                <h4 className="text-lg font-bold group-hover:text-landing-primary transition-colors">Mes données sont-elles stockées au Maroc ?</h4>
                                <span className="material-symbols-outlined group-hover:rotate-180 transition-transform">expand_more</span>
                            </div>
                            <div className="hidden group-hover:block pb-4 text-[#3d4947] leading-relaxed animate-fade-in">
                                Oui, toutes nos données sont hébergées dans des centres de données certifiés Tier III situés sur le territoire national, conformément aux recommandations de la CNDP.
                            </div>
                        </div>
                        <div className="reveal border-b border-blue-100 pb-4 group cursor-pointer">
                            <div className="flex justify-between items-center py-4">
                                <h4 className="text-lg font-bold group-hover:text-landing-primary transition-colors">Puis-je importer mon ancienne base de données ?</h4>
                                <span className="material-symbols-outlined group-hover:rotate-180 transition-transform">expand_more</span>
                            </div>
                            <div className="hidden group-hover:block pb-4 text-[#3d4947] leading-relaxed">
                                Absolument. Nos ingénieurs vous assistent gratuitement lors de l'importation de vos fichiers Excel ou exportations d'autres logiciels médicaux.
                            </div>
                        </div>
                        <div className="reveal border-b border-blue-100 pb-4 group cursor-pointer">
                            <div className="flex justify-between items-center py-4">
                                <h4 className="text-lg font-bold group-hover:text-landing-primary transition-colors">Le logiciel fonctionne-t-il sans connexion internet ?</h4>
                                <span className="material-symbols-outlined group-hover:rotate-180 transition-transform">expand_more</span>
                            </div>
                            <div className="hidden group-hover:block pb-4 text-[#3d4947] leading-relaxed">
                                MacroMedica nécessite une connexion internet pour la synchronisation, mais dispose d'un mode hors-ligne permettant de consulter les dossiers en cas de coupure temporaire.
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Final CTA */}
            <section className="py-32 px-8">
                <div className="max-w-7xl mx-auto bg-[#0f172a] text-white rounded-[3rem] p-16 relative overflow-hidden text-center reveal">
                    <div className="absolute -top-24 -left-24 w-64 h-64 bg-landing-primary/20 blur-[100px]"></div>
                    <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-blue-400/10 blur-[100px]"></div>
                    <div className="relative z-10">
                        <h2 className="text-5xl md:text-6xl font-headline font-light text-white mb-8">
                            Prêt à moderniser <br /><span className="font-bold">votre pratique ?</span>
                        </h2>
                        <p className="text-slate-400 text-lg mb-12 max-w-2xl mx-auto">Rejoignez la communauté de médecins qui ont choisi la simplicité et la sécurité au quotidien.</p>
                        <div className="flex flex-wrap justify-center gap-6">
                            <button onClick={() => navigate('/login')} style={{ background: "#ffffff", color: "#00685f", padding: "16px 32px", borderRadius: "8px", fontWeight: 700, fontSize: "16px", cursor: "pointer", border: "none", transition: "all 0.2s ease" }}>
                                <span className="relative z-10">Commencer gratuitement</span>
                            </button>
                            <button onClick={() => { document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' }) }} style={{ background: "transparent", color: "#ffffff", border: "2px solid #ffffff", padding: "12px 24px", borderRadius: "8px", fontWeight: 700, cursor: "pointer", transition: "all 0.2s ease" }}>
                                Demander une démo
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-[#0f172a] text-white pt-20 pb-10 px-8">
                <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12 mb-20">
                    <div>
                        <div className="flex items-center gap-2 mb-8">
                            <span className="material-symbols-outlined text-landing-primary text-2xl">add</span>
                            <span className="text-lg font-bold text-white font-headline">MacroMedica</span>
                        </div>
                        <p className="text-slate-500 text-sm leading-relaxed mb-6">
                            Plateforme de gestion médicale leader au Maroc. Conçue par des experts pour des experts.
                        </p>
                    </div>
                    <div>
                        <h4 className="text-white font-bold mb-8">Produit</h4>
                        <ul className="space-y-4">
                            <li><a className="text-slate-500 hover:text-blue-400 transition-all text-sm cursor-pointer" href="#features" onClick={(e) => { e.preventDefault(); document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' }) }}>Fonctionnalités</a></li>
                            <li><a className="text-slate-500 hover:text-blue-400 transition-all text-sm cursor-pointer" href="#pricing" onClick={(e) => { e.preventDefault(); document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' }) }}>Tarification</a></li>
                            <li><a className="text-slate-500 hover:text-blue-400 transition-all text-sm cursor-pointer" href="#" onClick={(e) => e.preventDefault()}>Sécurité</a></li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="text-white font-bold mb-8">Support</h4>
                        <ul className="space-y-4">
                            <li><a className="text-slate-500 hover:text-blue-400 transition-all text-sm cursor-pointer" href="#" onClick={(e) => e.preventDefault()}>Centre d'aide</a></li>
                            <li><a className="text-slate-500 hover:text-blue-400 transition-all text-sm cursor-pointer" href="#" onClick={(e) => e.preventDefault()}>Contact</a></li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="text-white font-bold mb-8">Légal</h4>
                        <ul className="space-y-4">
                            <li><a className="text-slate-500 hover:text-blue-400 transition-all text-sm cursor-pointer" href="#" onClick={(e) => e.preventDefault()}>Confidentialité</a></li>
                            <li><a className="text-slate-500 hover:text-blue-400 transition-all text-sm cursor-pointer" href="#" onClick={(e) => e.preventDefault()}>Conformité CNDP</a></li>
                        </ul>
                    </div>
                </div>
                <div className="max-w-7xl mx-auto pt-10 border-t border-slate-900 flex flex-col md:flex-row justify-between items-center gap-6">
                    <p className="text-slate-500 text-xs">© 2026 MacroMedica. Tous droits réservés.</p>
                    <div className="flex gap-8">
                        <span className="text-slate-600 text-[10px] flex items-center gap-2"><span className="w-2 h-2 bg-landing-primary rounded-full"></span> Serveurs: Casablanca</span>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
