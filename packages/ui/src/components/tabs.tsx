'use client';

import { useId, useState, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface TabItem {
  readonly id: string;
  readonly label: string;
  readonly badge?: number;
  readonly content: ReactNode;
}

export interface TabsProps {
  readonly items: readonly TabItem[];
  readonly initialId?: string;
  readonly className?: string;
}

/**
 * Tabs wired for keyboard use.
 *
 * Arrow keys move between tabs and Home/End jump to the ends, per the WAI-ARIA
 * tabs pattern. Front-desk staff work at speed and often without a mouse.
 */
export function Tabs({ items, initialId, className }: TabsProps) {
  const baseId = useId();
  const [activeId, setActiveId] = useState(initialId ?? items[0]?.id ?? '');
  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.id === activeId),
  );

  function move(delta: number) {
    const next = items[(activeIndex + delta + items.length) % items.length];
    if (next) setActiveId(next.id);
  }

  return (
    <div className={className}>
      <div role="tablist" className="border-line flex gap-1 border-b">
        {items.map((item) => {
          const selected = item.id === activeId;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveId(item.id)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight') move(1);
                else if (event.key === 'ArrowLeft') move(-1);
                else if (event.key === 'Home') setActiveId(items[0]?.id ?? activeId);
                else if (event.key === 'End') setActiveId(items[items.length - 1]?.id ?? activeId);
                else return;
                event.preventDefault();
              }}
              className={cn(
                '-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors',
                selected
                  ? 'border-brand-600 text-brand-700 font-medium'
                  : 'text-ink-500 hover:text-ink-900 border-transparent',
              )}
            >
              {item.label}
              {typeof item.badge === 'number' ? (
                <span className="bg-canvas text-ink-700 rounded px-1.5 py-0.5 text-xs tabular-nums">
                  {item.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${baseId}-panel-${item.id}`}
          aria-labelledby={`${baseId}-tab-${item.id}`}
          hidden={item.id !== activeId}
          className="pt-4"
        >
          {item.id === activeId ? item.content : null}
        </div>
      ))}
    </div>
  );
}
