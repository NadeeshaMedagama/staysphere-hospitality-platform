import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export type AlertTone = 'info' | 'positive' | 'caution' | 'negative';

const TONES: Record<AlertTone, string> = {
  info: 'border-info/30 bg-info-soft text-ink-900',
  positive: 'border-positive/30 bg-positive-soft text-ink-900',
  caution: 'border-caution/30 bg-caution-soft text-ink-900',
  negative: 'border-negative/30 bg-negative-soft text-ink-900',
};

export interface AlertProps {
  readonly tone?: AlertTone;
  readonly title?: string;
  readonly children: ReactNode;
  readonly className?: string;
}

export function Alert({ tone = 'info', title, children, className }: AlertProps) {
  return (
    <div
      // Only failures interrupt a screen reader; the rest wait their turn.
      role={tone === 'negative' ? 'alert' : 'status'}
      className={cn('rounded-card border px-4 py-3 text-sm', TONES[tone], className)}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={cn(title && 'mt-1', 'text-ink-700')}>{children}</div>
    </div>
  );
}
