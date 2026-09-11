import React from 'react';
import { KpiCards } from './KpiCards';
import { PilotageBand } from './PilotageBand';

export function Overview() {
  return (
    <div className="space-y-6">
      <KpiCards />
      <PilotageBand />
    </div>
  );
}
