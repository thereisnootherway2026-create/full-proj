import React, { useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

export interface FeatureCard3DProps {
  icon: string;
  badge?: string;
  title: string;
  description: string;
  slug?: string;
  highlightMetric?: string;
  onClick?: () => void;
}

const FeatureCard3D: React.FC<FeatureCard3DProps> = ({
  icon,
  badge,
  title,
  description,
  slug,
  highlightMetric,
  onClick,
}) => {
  const navigate = useNavigate();
  const innerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (slug) {
      navigate(`/features/${slug}`);
    }
  };

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!innerRef.current) return;

    requestAnimationFrame(() => {
      if (!innerRef.current) return;
      const rect = innerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      // Range of -6deg to +6deg for smooth elegance
      const rotateX = ((centerY - y) / centerY) * 6;
      const rotateY = ((x - centerX) / centerX) * 6;

      innerRef.current.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
    });
  }, []);

  const handleMouseEnter = () => {
    setIsHovered(true);
    if (innerRef.current) {
      innerRef.current.style.transition = 'transform 0.15s cubic-bezier(0.23, 1, 0.32, 1)';
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    requestAnimationFrame(() => {
      if (innerRef.current) {
        innerRef.current.style.transition =
          'transform 0.5s cubic-bezier(0.23, 1, 0.32, 1), background 0.3s, box-shadow 0.3s, border-color 0.3s';
        innerRef.current.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
      }
    });
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      className="feature-card h-full w-full relative group cursor-pointer outline-none select-none text-left"
      style={{ perspective: '1000px' }}
    >
      <div
        ref={innerRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="w-full h-full rounded-3xl p-6 sm:p-7 relative overflow-hidden flex flex-col justify-between transition-all duration-300"
        style={{
          transformStyle: 'preserve-3d',
          willChange: 'transform',
          backgroundColor: isHovered ? 'rgba(255, 255, 255, 0.98)' : 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(16px)',
          borderColor: isHovered ? 'rgba(0, 104, 95, 0.35)' : 'rgba(226, 232, 240, 0.8)',
          borderWidth: '1px',
          borderStyle: 'solid',
          boxShadow: isHovered
            ? '0 25px 45px -12px rgba(0, 104, 95, 0.15), 0 0 0 1px rgba(0, 104, 95, 0.1)'
            : '0 4px 20px rgba(15, 23, 42, 0.04)',
        }}
      >
        <div
          className="relative z-10 flex flex-col h-full pointer-events-none w-full"
          style={{ transform: 'translateZ(30px)', transformStyle: 'preserve-3d' }}
        >
          {/* Top Row: Icon & Badge */}
          <div className="flex items-center justify-between mb-4">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all duration-300 ${
                isHovered
                  ? 'bg-[#00685f] text-white border-transparent shadow-lg shadow-[#00685f]/25 scale-105'
                  : 'bg-emerald-50/90 text-[#00685f] border-emerald-100/70'
              }`}
            >
              <span className="material-symbols-outlined text-2xl shrink-0">{icon}</span>
            </div>

            {badge && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold tracking-wider uppercase border border-slate-200/80">
                {badge}
              </span>
            )}
          </div>

          {/* Title & Description */}
          <h3
            className={`text-xl font-headline font-bold mb-2 transition-colors duration-200 ${
              isHovered ? 'text-[#00685f]' : 'text-slate-900'
            }`}
          >
            {title}
          </h3>

          <p className="text-xs sm:text-sm leading-relaxed font-medium text-slate-600 mb-6 flex-1">
            {description}
          </p>

          {/* Bottom Card Footer */}
          <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
            {highlightMetric ? (
              <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md text-[11px]">
                {highlightMetric}
              </span>
            ) : (
              <span className="text-[11px] font-semibold text-slate-400">Flux cabinet certifié</span>
            )}

            <div
              className={`flex items-center gap-1 font-bold transition-all duration-200 ${
                isHovered ? 'text-[#00685f] translate-x-1' : 'text-slate-500'
              }`}
            >
              <span>Explorer en direct</span>
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FeatureCard3D;
