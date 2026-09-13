import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Fonction pure de post-traitement pour les commandes vocales de ponctuation en français
 * @param {string} text - Segment brut de la dictée
 * @returns {string} Segment transformé avec la ponctuation appropriée
 */
export function applyDictationPunctuation(text) {
  if (!text) return text;
  let processed = text;
  // Remplacement des commandes vocales par les signes de ponctuation correspondants
  // (Ordre important : phrases les plus longues d'abord)
  processed = processed.replace(/point d'exclamation/gi, '!');
  processed = processed.replace(/point d'interrogation/gi, '?');
  processed = processed.replace(/à la ligne|nouvelle ligne|nouveau paragraphe/gi, '\n');
  processed = processed.replace(/deux points/gi, ':');
  processed = processed.replace(/virgule/gi, ',');
  processed = processed.replace(/point/gi, '.');
  return processed;
}

/**
 * Hook useSpeechRecognition - Dictée vocale via Web Speech API (Architecture 100% basée sur des segments)
 *
 * PRINCIPE CENTRAL : Le hook n'est JAMAIS la source de vérité du texte complet.
 * Il ne stocke aucun historique ni texte accumulé. Son seul rôle est d'émettre des segments
 * de parole finalisés (`onFinalChunk`) dès qu'ils sont confirmés.
 *
 * @param {Object|Function} options - Options ou callback onFinalChunk (support rétro-compatible)
 * @param {(chunk: string) => void} [options.onFinalChunk] - Callback appelé pour chaque segment finalisé
 * @param {(text: string) => void} [options.onInterimChunk] - Callback pour le texte temporaire en cours
 * @param {(errorType: string, message: string) => void} [options.onError] - Callback en cas d'erreur
 * @param {string} [options.lang='fr-FR'] - Langue de dictée
 */
export function useSpeechRecognition(options = {}, legacyOnInterim, legacyLang) {
  // Support de la signature positionnelle rétro-compatible (onFinalChunk, onInterimChunk, lang)
  let onFinalChunk, onInterimChunk, onError, lang;
  if (typeof options === 'function') {
    onFinalChunk = options;
    onInterimChunk = legacyOnInterim;
    lang = legacyLang || 'fr-FR';
  } else {
    ({ onFinalChunk, onInterimChunk, onError, lang = 'fr-FR' } = options);
  }

  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState(null);

  // Source de vérité de la volonté d'écoute (survit aux recréations d'instances Web Speech API)
  const isListeningRef = useRef(false);
  const recognitionRef = useRef(null);

  // Référence toujours à jour des callbacks sans réinstancier l'API
  const callbacksRef = useRef({ onFinalChunk, onInterimChunk, onError });
  useEffect(() => {
    callbacksRef.current = { onFinalChunk, onInterimChunk, onError };
  }, [onFinalChunk, onInterimChunk, onError]);

  // Support navigateur
  const isSupported = typeof window !== 'undefined' && Boolean(
    window.SpeechRecognition || window.webkitSpeechRecognition
  );

  /**
   * Instancier et démarrer une nouvelle session SpeechRecognition propre
   */
  const createAndStartInstance = useCallback(() => {
    if (!isSupported || !isListeningRef.current) return;

    // Nettoyage de l'instance précédente
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      if (isListeningRef.current) {
        setIsListening(true);
        setError(null);
      }
    };

    rec.onresult = (event) => {
      let currentInterim = '';
      let finalizedChunk = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        if (result.isFinal) {
          finalizedChunk += transcript;
        } else {
          currentInterim += transcript;
        }
      }

      // 1. Si un segment est finalisé, on l'envoie immédiatement au composant
      if (finalizedChunk.trim()) {
        const processed = applyDictationPunctuation(finalizedChunk);
        callbacksRef.current.onFinalChunk?.(processed);
        callbacksRef.current.onInterimChunk?.('');
      } else {
        // 2. Transmettre le texte temporaire du segment EN COURS uniquement
        callbacksRef.current.onInterimChunk?.(currentInterim);
      }
    };

    rec.onerror = (e) => {
      const errCode = e?.error || 'unknown';

      // 'no-speech' est un événement normal après un silence.
      // Traitement silencieux : onend prendra le relais pour redémarrer sans alerter l'utilisateur.
      if (errCode === 'no-speech') {
        return;
      }

      // Refus de permission microphone
      if (errCode === 'not-allowed' || errCode === 'permission-denied') {
        isListeningRef.current = false;
        setIsListening(false);
        const errMsg = 'Accès au microphone refusé. Veuillez l\'autoriser dans votre navigateur.';
        setError(errMsg);
        callbacksRef.current.onError?.('not-allowed', errMsg);
        return;
      }

      // Autre erreur réseau ou matériel
      isListeningRef.current = false;
      setIsListening(false);
      const errMsg = `Erreur de dictée vocale (${errCode})`;
      setError(errMsg);
      callbacksRef.current.onError?.(errCode, errMsg);
    };

    rec.onend = () => {
      // Si isListeningRef est true (silence, délai navigateur), relancer UNE NOUVELLE instance immédiatement
      if (isListeningRef.current) {
        setTimeout(() => {
          if (isListeningRef.current) {
            createAndStartInstance();
          }
        }, 100);
      } else {
        setIsListening(false);
        callbacksRef.current.onInterimChunk?.('');
      }
    };

    recognitionRef.current = rec;

    try {
      rec.start();
    } catch (err) {
      if (isListeningRef.current) {
        setTimeout(() => {
          if (isListeningRef.current) createAndStartInstance();
        }, 300);
      }
    }
  }, [isSupported, lang]);

  /**
   * Démarrer la dictée
   */
  const startListening = useCallback(() => {
    if (!isSupported) {
      const msg = 'La reconnaissance vocale n\'est pas disponible sur votre navigateur.';
      setError(msg);
      callbacksRef.current.onError?.('not-supported', msg);
      return;
    }
    setError(null);
    isListeningRef.current = true;
    createAndStartInstance();
  }, [isSupported, createAndStartInstance]);

  /**
   * Arrêter la dictée (on passe isListeningRef à false AVANT d'arrêter rec)
   */
  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    setIsListening(false);
    callbacksRef.current.onInterimChunk?.('');

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
  }, []);

  /**
   * Basculer l'état d'écoute
   */
  const toggleListening = useCallback(() => {
    if (isListeningRef.current) {
      stopListening();
    } else {
      startListening();
    }
  }, [startListening, stopListening]);

  // Nettoyage lors du démontage du composant
  useEffect(() => {
    return () => {
      isListeningRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onresult = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.onend = null;
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, []);

  return {
    isListening,
    isSupported,
    startListening,
    stopListening,
    toggleListening,
    error
  };
}
