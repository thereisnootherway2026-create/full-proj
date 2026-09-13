import { useRef, useEffect } from 'react';

/**
 * FocusableCard - Carte avec support du Focus Mode (animation FLIP)
 * Doit être utilisé avec le hook useFocusMode déclaré au niveau parent (pour un état global unique)
 */
export function FocusableCard({
  cardId,
  activeCardId,
  enterFocusMode,
  exitFocusMode,
  title,
  icon: Icon,
  children,
  className = ''
}) {
  const cardRef = useRef(null);
  const isActive = activeCardId === cardId;

  // Gérer le clic sur le bouton fermer
  const handleCloseClick = (e) => {
    e.stopPropagation();
    exitFocusMode();
  };

  // Garder la référence de carte synchronisée avec le hook global
  // (pour que exitFocusMode puisse retrouver la bonne carte)
  useEffect(() => {
    if (isActive && enterFocusMode && !cardRef.current.dataset.focusBound) {
      // Marquer comme lié pour éviter les doubles liaisons
      cardRef.current.dataset.focusBound = '1';
    }
  }, [isActive, enterFocusMode]);

  // Appeler enterFocusMode quand l'utilisateur focus à l'intérieur
  const handleFocusIn = (e) => {
    if (!isActive && enterFocusMode && cardRef.current) {
      enterFocusMode(cardId, cardRef.current);
    }
  };

  return (
    <div
      ref={cardRef}
      data-card-id={cardId}
      aria-expanded={isActive}
      onFocusIn={handleFocusIn}
      className={`patient-card bg-white rounded-[21px] border border-slate-300 p-5 shadow-sm transition-all duration-300 ease-out hover:shadow-md ${className}`}
    >
      <div className="card-header">
        {Icon && (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50">
            <Icon className="w-4.5 h-4.5 text-blue-600" />
          </div>
        )}
        {title && <h3 className="text-sm font-semibold text-slate-900">{title}</h3>}
        {isActive && (
          <button
            type="button"
            className="close-focus-btn"
            onClick={handleCloseClick}
            aria-label="Fermer le mode focus"
          >
            ✕
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
