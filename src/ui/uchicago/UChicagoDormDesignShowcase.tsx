import React from 'react';

interface UChicagoDormDesignShowcaseProps {
  compact?: boolean;
  onOpenFullGuide?: () => void;
  dormName?: string;
  layoutName?: string;
}

export function UChicagoDormDesignShowcase({
  compact,
  onOpenFullGuide,
  dormName,
  layoutName,
}: UChicagoDormDesignShowcaseProps) {
  return (
    <div className={`uchicago-dorm-showcase ${compact ? 'compact' : ''}`}>
      <h2>UChicago Dorm Design Showcase</h2>
      {dormName && <p>Building: {dormName}</p>}
      {layoutName && <p>Layout: {layoutName}</p>}
      <p>Explore our collection of UChicago dorm room designs.</p>
      {compact && onOpenFullGuide && (
        <button onClick={onOpenFullGuide}>View Full Guide</button>
      )}
    </div>
  );
}
