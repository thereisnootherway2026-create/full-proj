import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { getAllSuggestions, getSuggestionMeta } from './SuggestionEngine';
import { SuggestionPopup } from './SuggestionPopup';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';

/**
 * MedicalTextarea - Composant textarea médical avec :
 * - Ghost text + multi-suggestions (catégorisées visuellement)
 * - Dictée vocale avec architecture basée sur les segments (le composant est la seule source de vérité)
 */
export function MedicalTextarea({
  value = '',
  onChange,
  placeholder,
  className = '',
  onFocus,
  onBlur,
  patientConsultations = [],
  onSave,
  autoSaveDelay = 3000,
  autoFocus = false,
  id,
  ...props
}) {
  const textareaRef = useRef(null);

  // ---- Suggestions multi ----
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [showPopup, setShowPopup] = useState(false);

  // Debounce 80ms
  const debounceRef = useRef(null);
  const updateSuggestions = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const cursorPos = textareaRef.current?.selectionStart ?? 0;
      if (cursorPos !== (value?.length || 0)) {
        setSuggestions([]);
        setShowPopup(false);
        return;
      }
      const newSuggestions = getAllSuggestions(value || '', cursorPos, patientConsultations);
      setSuggestions(newSuggestions);
      setShowPopup(newSuggestions.length >= 1);
      setSelectedSuggestionIndex(0);
    }, 80);
  }, [value, patientConsultations]);

  useEffect(() => {
    updateSuggestions();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [updateSuggestions]);

  // ---- Ghost suffix pour ghost text ----
  const activeSuggestion = suggestions[selectedSuggestionIndex];
  const ghostSuffix = useMemo(() => {
    if (!activeSuggestion || !value) return '';
    const s = activeSuggestion.text;
    const lowerVal = value.toLowerCase();
    const lowerS = s.toLowerCase();

    if (lowerS.startsWith(lowerVal)) return s.slice(value.length);

    const wordsBefore = value.trimEnd().split(/\s+/);
    const lastWord = wordsBefore[wordsBefore.length - 1] || '';
    const lastTwoWords = wordsBefore.slice(-2).join(' ') || '';

    if (lastWord && lowerS.startsWith(lastWord.toLowerCase())) return s.slice(lastWord.length);
    if (lastTwoWords && lowerS.startsWith(lastTwoWords.toLowerCase())) return s.slice(lastTwoWords.length);

    return ' ' + s;
  }, [activeSuggestion, value]);

  const ghostMeta = activeSuggestion ? getSuggestionMeta(activeSuggestion.type) : null;

  // ---- Insérer une suggestion ----
  const insertSuggestion = useCallback((sugg) => {
    if (!sugg) return false;
    const cursorPos = textareaRef.current?.selectionStart ?? 0;
    const textBefore = value?.slice(0, cursorPos) || '';
    const textAfter = value?.slice(cursorPos) || '';
    const lowerBefore = textBefore.toLowerCase();
    const lowerSug = sugg.text.toLowerCase();

    let newBefore;
    if (lowerSug.startsWith(lowerBefore)) {
      newBefore = sugg.text;
    } else {
      const wordsBefore = textBefore.trimEnd().split(/\s+/);
      const lastWord = wordsBefore[wordsBefore.length - 1] || '';
      const lastTwoWords = wordsBefore.slice(-2).join(' ') || '';

      if (lastWord && lowerSug.startsWith(lastWord.toLowerCase())) {
        newBefore = textBefore.slice(0, -lastWord.length) + sugg.text;
      } else if (lastTwoWords && lowerSug.startsWith(lastTwoWords.toLowerCase())) {
        newBefore = textBefore.slice(0, -lastTwoWords.length) + sugg.text;
      } else {
        newBefore = (textBefore.endsWith(' ') || textBefore === '' ? textBefore : textBefore + ' ') + sugg.text;
      }
    }

    const newValue = newBefore + textAfter;
    onChange?.(newValue);
    setSuggestions([]);
    setShowPopup(false);

    setTimeout(() => {
      textareaRef.current?.focus();
      const pos = newBefore.length;
      textareaRef.current?.setSelectionRange(pos, pos);
    }, 0);

    return true;
  }, [value, onChange]);

  // ---- Clavier ----
  const handleKeyDown = useCallback(
    (e) => {
      if (showPopup && suggestions.length > 1) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedSuggestionIndex((i) => (i + 1) % suggestions.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedSuggestionIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
          return;
        }
      }

      const acceptKeys = ['Tab', 'Enter'];
      if (acceptKeys.includes(e.key) && suggestions.length) {
        const selected = suggestions[selectedSuggestionIndex];
        if (insertSuggestion(selected)) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }
      if (e.key === 'ArrowRight' && suggestions.length === 1) {
        const pos = textareaRef.current?.selectionStart || 0;
        if (pos === (value?.length || 0)) {
          if (insertSuggestion(suggestions[0])) {
            e.preventDefault();
          }
        }
      }

      if (e.key === 'Escape') {
        setSuggestions([]);
        setShowPopup(false);
      }
    },
    [showPopup, suggestions, selectedSuggestionIndex, insertSuggestion, value]
  );

  // ---- Dictée vocale : Le composant contrôle la valeur finale et la concaténation ----
  const [interimText, setInterimText] = useState('');
  const [speechError, setSpeechError] = useState(null);

  const handleFinalChunk = useCallback((textChunk) => {
    if (!textChunk) return;
    setInterimText(''); // Effacer le texte temporaire une fois le segment finalisé

    const pos = textareaRef.current?.selectionStart ?? (value?.length || 0);
    const before = (value || '').slice(0, pos);
    const after = (value || '').slice(pos);

    // Ajouter un espace de séparation intelligent avant le nouveau segment si nécessaire
    const needsSpaceBefore = before.length > 0 && !/\s$/.test(before) && !/[\n\r]$/.test(before);
    const insertedText = (needsSpaceBefore ? ' ' : '') + textChunk;
    const newValue = before + insertedText + after;

    onChange?.(newValue);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newPos = before.length + insertedText.length;
        textareaRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  }, [value, onChange]);

  const handleInterimChunk = useCallback((text) => {
    setInterimText(text);
  }, []);

  const handleSpeechError = useCallback((type, msg) => {
    setSpeechError(msg);
  }, []);

  const speech = useSpeechRecognition({
    onFinalChunk: handleFinalChunk,
    onInterimChunk: handleInterimChunk,
    onError: handleSpeechError,
    lang: 'fr-FR'
  });

  // Fermer popup au clic extérieur
  useEffect(() => {
    const onClick = (e) => {
      if (textareaRef.current && !textareaRef.current.contains(e.target) && !e.target.closest?.('.suggestion-popup')) {
        setShowPopup(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    if (autoFocus) {
      textareaRef.current?.focus();
    }
  }, [autoFocus]);

  return (
    <div className={`medical-textarea-wrapper ${className}`}>
      {/* Couche d'affichage Ghost Text + Texte temporaire en cours */}
      <div className="ghost-text" aria-hidden="true">
        <span className="typed">{value}</span>
        {interimText && (
          <span className="interim-transcript" style={{ color: '#94a3b8', fontStyle: 'italic' }}>
            {value && !/\s$/.test(value) ? ' ' : ''}{interimText}
          </span>
        )}
        {ghostSuffix && ghostMeta && !interimText && (
          <span
            className={`suggestion ${ghostMeta.colorClass}`}
            style={{ color: ghostMeta.ghostColor }}
          >
            {ghostSuffix}
            {activeSuggestion && (
              <span className="suggestion-badge-ghost">{ghostMeta.badge}</span>
            )}
          </span>
        )}
      </div>

      {/* Textarea réel */}
      <textarea
        id={id}
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={(e) => {
          onFocus?.(e);
          if (suggestions.length) setShowPopup(true);
        }}
        onBlur={(e) => {
          onBlur?.(e);
          setSuggestions([]);
          setShowPopup(false);
        }}
        placeholder={placeholder}
        className="medical-textarea"
        spellCheck={true}
        {...props}
      />

      {/* Popup multi-suggestions */}
      <SuggestionPopup
        visible={showPopup && suggestions.length >= 1}
        suggestions={suggestions}
        selectedIndex={selectedSuggestionIndex}
        onSelect={setSelectedSuggestionIndex}
        onClickItem={(idx) => insertSuggestion(suggestions[idx])}
        keyboardHint={
          suggestions.length > 1
            ? '↑↓ naviguer • Tab / ↵ accepter • Esc fermer'
            : suggestions.length === 1
              ? 'Tab / ↵ accepter • Esc ignorer'
              : ''
        }
      />

      {/* Toolbar pour l'action du micro et les alertes */}
      <div className="medical-toolbar">
        {(speech.error || speechError) && (
          <div className="speech-error-message text-xs text-red-600 font-medium mr-auto flex items-center gap-1.5 px-2.5 py-1 bg-red-50 rounded-lg border border-red-200">
            <span>⚠️ {speech.error || speechError}</span>
          </div>
        )}
        <div className="medical-toolbar-actions ml-auto">
          {speech.isSupported ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setSpeechError(null);
                speech.toggleListening();
                textareaRef.current?.focus();
              }}
              className={`speech-btn transition-all duration-200 ${
                speech.isListening
                  ? 'listening bg-red-100 text-red-600 border-red-300 animate-pulse'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              title={speech.isListening ? 'Arrêter la dictée vocale' : 'Démarrer la dictée vocale'}
              aria-label={speech.isListening ? 'Arrêter la dictée vocale' : 'Démarrer la dictée vocale'}
            >
              {speech.isListening ? (
                <MicOff className="w-4 h-4 text-red-600 animate-pulse" />
              ) : (
                <Mic className="w-4 h-4 text-slate-600 hover:text-slate-900" />
              )}
            </button>
          ) : (
            <span className="text-[11px] text-slate-400 italic">
              Dictée vocale non disponible sur ce navigateur
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
