import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Hook useFocusMode - Gestion globale du Focus Mode avec technique FLIP
 * Garantit une animation fluide sans saut visuel et un placeholder pour éviter le décalage du contenu
 */
export function useFocusMode() {
  const [activeCardId, setActiveCardId] = useState(null);
  const [isActive, setIsActive] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  // Refs pour gérer le FLIP et le placeholder
  const cardRef = useRef(null);
  const placeholderRef = useRef(null);
  const originalRectRef = useRef(null);
  const originalStyleRef = useRef({});
  const originalParentRef = useRef(null);
  const originalNextSiblingRef = useRef(null);

  // Reset propre quand on change de carte active
  useEffect(() => {
    if (!activeCardId) {
      // Reset toutes les refs quand plus de carte active
      cardRef.current = null;
      originalRectRef.current = null;
      originalParentRef.current = null;
      originalNextSiblingRef.current = null;
    }
  }, [activeCardId]);

  /**
   * enterFocusMode - Entre en Focus Mode avec animation FLIP
   * @param {string} cardId - ID unique de la carte
   * @param {HTMLDivElement} cardEl - Élément DOM de la carte
   */
  const enterFocusMode = useCallback((cardId, cardEl) => {
    // Si déjà en animation ou déjà la même carte active, on ignore
    if (isAnimating || activeCardId === cardId) return;

    if (!cardEl) return;

    // Si une autre carte était déjà en focus mode, on la quitte d'abord (sans attendre l'animation)
    if (activeCardId && activeCardId !== cardId) {
      // Reset forcé
      if (placeholderRef.current && placeholderRef.current.parentNode) {
        placeholderRef.current.remove();
      }
      if (cardRef.current) {
        Object.keys(originalStyleRef.current).forEach(prop => {
          cardRef.current.style[prop] = originalStyleRef.current[prop];
        });
        cardRef.current.classList.remove('focus-mode-card', 'entered');
      }
      placeholderRef.current = null;
      cardRef.current = null;
      originalRectRef.current = null;
    }

    setIsAnimating(true);
    setActiveCardId(cardId);

    // 1. FIRST - Mesurer la position et la taille exacte
    const rect = cardEl.getBoundingClientRect();
    originalRectRef.current = rect;
    cardRef.current = cardEl;
    originalParentRef.current = cardEl.parentNode;
    originalNextSiblingRef.current = cardEl.nextSibling;

    // Sauvegarder les styles originaux
    const computedStyle = window.getComputedStyle(cardEl);
    originalStyleRef.current = {
      position: cardEl.style.position,
      top: cardEl.style.top,
      left: cardEl.style.left,
      width: cardEl.style.width,
      height: cardEl.style.height,
      margin: cardEl.style.margin,
      maxHeight: cardEl.style.maxHeight,
      transform: cardEl.style.transform,
      zIndex: cardEl.style.zIndex,
      boxShadow: cardEl.style.boxShadow,
      borderRadius: cardEl.style.borderRadius,
      overflow: cardEl.style.overflow
    };

    // 2. Créer le placeholder invisible à l'emplacement exact pour éviter que le contenu ne remonte
    const placeholder = document.createElement('div');
    placeholder.style.height = `${rect.height}px`;
    placeholder.style.width = `${rect.width}px`;
    placeholder.style.visibility = 'hidden';
    placeholder.style.marginTop = computedStyle.marginTop;
    placeholder.style.marginRight = computedStyle.marginRight;
    placeholder.style.marginBottom = computedStyle.marginBottom;
    placeholder.style.marginLeft = computedStyle.marginLeft;
    placeholder.style.display = computedStyle.display === 'block' ? 'block' : 'flex';
    placeholderRef.current = placeholder;

    // Insérer le placeholder juste avant la carte
    if (cardEl.parentNode) {
      cardEl.parentNode.insertBefore(placeholder, cardEl);
    }

    // 3. INVERT - Positionner la carte en FIXED à son emplacement exact (aucun saut visuel)
    cardEl.style.position = 'fixed';
    cardEl.style.top = `${rect.top}px`;
    cardEl.style.left = `${rect.left}px`;
    cardEl.style.width = `${rect.width}px`;
    cardEl.style.height = `${rect.height}px`;
    cardEl.style.margin = '0';
    cardEl.style.zIndex = '1000';
    cardEl.style.transform = 'translate(0, 0) scale(1)';
    cardEl.style.willChange = 'transform, opacity';

    // Forcer le reflow pour que le navigateur enregistre la position initiale
    void cardEl.offsetHeight;

    // 4. PLAY - Animer vers la position centrée
    requestAnimationFrame(() => {
      // Ajouter les classes pour l'animation
      cardEl.classList.add('focus-mode-card');

      // Calcul de la translation pour centrer la carte
      // Taille finale souhaitée : min(800px, 90vw)
      const finalWidth = Math.min(800, window.innerWidth * 0.9);
      const finalHeight = 'auto';
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;

      // Appliquer la position finale avec transform UNIQUEMENT (animations GPU)
      cardEl.style.top = '50%';
      cardEl.style.left = '50%';
      cardEl.style.width = `${finalWidth}px`;
      cardEl.style.height = 'auto';
      cardEl.style.maxHeight = '75vh';
      cardEl.style.transform = 'translate(-50%, -50%) scale(1)';
      cardEl.style.overflowY = 'auto';
      cardEl.style.borderRadius = '16px';

      // Marquer comme entered après un petit délai pour permettre l'animation
      requestAnimationFrame(() => {
        cardEl.classList.add('entered');
        setIsActive(true);

        // Retirer will-change après l'animation
        setTimeout(() => {
          if (cardRef.current) {
            cardRef.current.style.willChange = '';
          }
          setIsAnimating(false);
        }, 380);
      });
    });
  }, [activeCardId, isAnimating]);

  /**
   * exitFocusMode - Quitte le Focus Mode avec animation FLIP inversée
   */
  const exitFocusMode = useCallback(() => {
    if (!cardRef.current || !originalRectRef.current || isAnimating) return;

    const cardEl = cardRef.current;
    const originalRect = originalRectRef.current;
    const placeholder = placeholderRef.current;

    setIsAnimating(true);
    setIsActive(false);

    // Ajouter will-change avant l'animation
    cardEl.style.willChange = 'transform, opacity';

    // Retirer la classe entered pour déclencher l'animation de sortie
    cardEl.classList.remove('entered');

    // Forcer reflow
    void cardEl.offsetHeight;

    // PLAY - Animer retour à la position originale
    requestAnimationFrame(() => {
      cardEl.style.top = `${originalRect.top}px`;
      cardEl.style.left = `${originalRect.left}px`;
      cardEl.style.width = `${originalRect.width}px`;
      cardEl.style.height = `${originalRect.height}px`;
      cardEl.style.maxHeight = '';
      cardEl.style.transform = 'none';
      cardEl.style.overflowY = '';
      cardEl.style.borderRadius = '';
    });

    // Après la fin de l'animation, nettoyer
    setTimeout(() => {
      // Retirer les classes de focus mode
      cardEl.classList.remove('focus-mode-card');
      cardEl.style.willChange = '';

      // Restaurer les styles originaux
      Object.keys(originalStyleRef.current).forEach(prop => {
        cardEl.style[prop] = originalStyleRef.current[prop];
      });

      // Supprimer le placeholder
      if (placeholder && placeholder.parentNode) {
        placeholder.parentNode.removeChild(placeholder);
      }

      // Nettoyer les refs
      placeholderRef.current = null;
      cardRef.current = null;
      originalRectRef.current = null;
      originalParentRef.current = null;
      originalNextSiblingRef.current = null;
      originalStyleRef.current = {};

      setActiveCardId(null);
      setIsAnimating(false);
    }, 380);
  }, [isAnimating]);

  // Gérer la touche Escape globalement
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && (isActive || activeCardId)) {
        exitFocusMode();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, activeCardId, exitFocusMode]);

  // Gérer le resize de la fenêtre
  useEffect(() => {
    const handleResize = () => {
      if (isActive && cardRef.current) {
        const finalWidth = Math.min(800, window.innerWidth * 0.9);
        cardRef.current.style.width = `${finalWidth}px`;
        cardRef.current.style.top = '50%';
        cardRef.current.style.left = '50%';
        cardRef.current.style.transform = 'translate(-50%, -50%) scale(1)';
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isActive]);

  return {
    activeCardId,
    isActive,
    isAnimating,
    cardRef,
    enterFocusMode,
    exitFocusMode
  };
}
