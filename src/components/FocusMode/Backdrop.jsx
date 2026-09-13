import React from 'react';

/**
 * Backdrop BLANC flou pour le Focus Mode
 * Règles : Jamais noir, jamais gris foncé, fade in 0.3s, fade out 0.2s
 */
export function Backdrop({ isVisible, onClick }) {
  return (
    <div
      className={`focus-backdrop ${isVisible ? 'active' : ''}`}
      onClick={onClick}
      aria-hidden="true"
    />
  );
}
