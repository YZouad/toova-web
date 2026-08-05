import type { CSSProperties } from 'react';

export interface TabItem {
  id: string;
  label: string;
  count?: number | string;
}

export interface TabsProps {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
  style?: CSSProperties;
}

export function Tabs({ tabs, active, onChange, className, style }: TabsProps) {
  return (
    <div className={['kit-tabs', className].filter(Boolean).join(' ')} style={style}>
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            className={[
              'kit-tabs__tab',
              isActive ? 'kit-tabs__tab--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
            {tab.count != null ? (
              <span className="kit-tabs__count">{tab.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
