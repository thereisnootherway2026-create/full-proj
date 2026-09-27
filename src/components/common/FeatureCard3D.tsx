import React, { useRef, useState, useCallback } from 'react';

interface FeatureCard3DProps {
  icon: string;
  title: string;
  description: string;
}

const FeatureCard3D: React.FC<FeatureCard3DProps> = ({ icon, title, description }) => {
  const innerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!innerRef.current) return;

    // Use requestAnimationFrame for smooth 60fps tracking
    requestAnimationFrame(() => {
      if (!innerRef.current) return;
      const rect = innerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      // Range of -8deg to +8deg
      const rotateX = ((centerY - y) / centerY) * 8;
      const rotateY = ((x - centerX) / centerX) * 8;

      innerRef.current.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.03, 1.03, 1.03)`;
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
        innerRef.current.style.transition = 'transform 0.5s cubic-bezier(0.23, 1, 0.32, 1), background 0.3s, box-shadow 0.3s';
        innerRef.current.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
      }
    });
  };

  return (
    <div
      className="feature-card h-full w-full relative group"
      style={{ perspective: '1000px' }}
    >
      <div
        ref={innerRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`w-full h-full rounded-[28px] p-8 relative overflow-hidden flex flex-col items-start transition-colors duration-300`}
        style={{
          transformStyle: 'preserve-3d',
          willChange: 'transform',
          backgroundColor: isHovered ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.7)',
          backdropFilter: isHovered ? 'none' : 'blur(12px)',
          borderColor: isHovered ? 'transparent' : 'rgba(255, 255, 255, 0.8)',
          borderWidth: '1px',
          borderStyle: 'solid',
          boxShadow: isHovered
            ? '0 25px 50px -12px rgba(59, 130, 246, 0.25)'
            : '0 4px 24px rgba(59, 130, 246, 0.08)',
        }}
      >
        <div
          className="relative z-10 flex flex-col h-full pointer-events-none w-full"
          style={{ transform: 'translateZ(40px)', transformStyle: 'preserve-3d' }}
        >
          <div className={`card-icon-container w-16 h-16 rounded-2xl flex items-center justify-center mb-8 border transition-all duration-300
            ${isHovered ? 'bg-[#3B82F6] text-white border-transparent shadow-lg float-icon' : 'bg-blue-50/80 text-[#3B82F6] border-blue-100/50'}`}>
            <span className="material-symbols-outlined text-3xl shrink-0">
              {icon}
            </span>
          </div>
          <h3 className={`text-2xl font-headline font-bold mb-4 transition-colors duration-300 ${isHovered ? 'text-[#3B82F6]' : 'text-slate-900'}`}>
            {title}
          </h3>
          <p className={`leading-relaxed font-medium transition-colors duration-300 ${isHovered ? 'text-slate-700' : 'text-[#3d4947]'}`}>
            {description}
          </p>
        </div>
      </div>
    </div>
  );
};

export default FeatureCard3D;
