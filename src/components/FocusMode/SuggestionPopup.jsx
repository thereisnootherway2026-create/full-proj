import React, { useEffect, useRef } from 'react';
import { getSuggestionMeta } from './SuggestionEngine';

/**
 * SuggestionPopup - Mini-liste navigable pour plusieurs suggestions
 * @param {{
 *  suggestions: Array<{text: string, type: string}>,
 *  selectedIndex: number,
 *  onSelect: (index: number) => void,
 *  onClickItem?: (index: number) => void,
 *  visible: boolean,
 *  keyboardHint?: string
 * }} props
 */
export function SuggestionPopup({
  suggestions = [],
  selectedIndex = 0,
  onSelect,
  onClickItem,
  visible = false,
  keyboardHint = ''
}) {
  const listRef = useRef(null);
  const itemRefs = useRef([]);

  useEffect(() => {
    if (visible && itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, visible]);

  if (!visible || !suggestions.length) return null;

  return (
    <div className="suggestion-popup" role="listbox" aria-label="Suggestions médicales" ref={listRef}>
      <div className="suggestion-popup-list">
        {suggestions.map((sugg, idx) => {
          const meta = getSuggestionMeta(sugg.type);
          const selected = idx === selectedIndex;
          return (
            <div
              key={`${sugg.text}-${idx}`}
              ref={(el) => (itemRefs.current[idx] = el)}
              role="option"
              aria-selected={selected}
              onMouseEnter={() => onSelect(idx)}
              onClick={() => onClickItem?.(idx)}
              className={`suggestion-item ${selected ? 'selected' : ''}`}
            >
              <span className="suggestion-dot" style={{ backgroundColor: meta.ghostColor }} />
              <span className="suggestion-item-text" style={{ color: '#1F2937' }}>
                {sugg.text}
              </span>
              <span
                className={`suggestion-badge suggestion-badge-${sugg.type}`}
                title={meta.badge}
              >
                {meta.badge}
              </span>
            </div>
          );
        })}
      </div>
      {keyboardHint && (
        <div className="suggestion-popup-footer" role="status" aria-live="polite">
          {keyboardHint}
        </div>
      )}
    </div>
  );
}
