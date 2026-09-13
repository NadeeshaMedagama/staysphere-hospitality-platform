import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface CardProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <section className={cn('rounded-card border-line bg-surface border', className)}>
      {children}
    </section>
  );
}

export interface CardHeaderProps {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
}

export function CardHeader({ title, description, action, className }: CardHeaderProps) {
  return (
    <header
      className={cn(
        'border-line flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-ink-900 text-sm font-semibold">{title}</h2>
        {description ? <p className="text-ink-500 mt-0.5 text-xs">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function CardBody({ children, className }: CardProps) {
  return <div className={cn('p-4', className)}>{children}</div>;
}

export function CardFooter({ children, className }: CardProps) {
  return <footer className={cn('border-line border-t px-4 py-3', className)}>{children}</footer>;
}
