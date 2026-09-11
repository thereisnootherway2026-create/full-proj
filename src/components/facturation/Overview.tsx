import React from 'react';
import { KpiCards } from './KpiCards';
import { PilotageBand } from './PilotageBand';
import { ChartsGrid } from './ChartsGrid';
import { TopListes } from './TopListes';

export function Overview() {
  return (
    <div className="space-y-6 pb-12">
      <KpiCards />
      <PilotageBand />
      <ChartsGrid />
      <TopListes />
    </div>
  );
}
