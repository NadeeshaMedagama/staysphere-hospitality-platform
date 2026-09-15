import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export interface FieldProps {
  readonly label: string;
  readonly htmlFor: string;
  readonly hint?: string;
  readonly error?: string;
  readonly required?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * Label, control, hint and error as one unit.
 *
 * The error is wired to the control with `aria-describedby` by the caller
 * passing the same id — a validation message a screen reader never announces is
 * a validation message that does not exist.
 */
export function Field({ label, htmlFor, hint, error, required, children, className }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="text-ink-900 block text-sm font-medium">
        {label}
        {required ? (
          <span className="text-negative ml-0.5" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${htmlFor}-hint`} className="text-ink-500 text-xs">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-negative text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const CONTROL_CLASSES =
  'w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-sm text-ink-900 ' +
  'placeholder:text-ink-400 focus:border-brand-500 focus:outline-none disabled:bg-canvas disabled:text-ink-400';

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly invalid?: boolean;
}

export function TextInput({ invalid, className, ...props }: TextInputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(CONTROL_CLASSES, invalid && 'border-negative', className)}
      {...props}
    />
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  readonly invalid?: boolean;
}

export function Select({ invalid, className, children, ...props }: SelectProps) {
  return (
    <select
      aria-invalid={invalid || undefined}
      className={cn(CONTROL_CLASSES, invalid && 'border-negative', className)}
      {...props}
    >
      {children}
    </select>
  );
}
