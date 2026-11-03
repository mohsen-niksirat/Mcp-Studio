import React from 'react';
import { cn } from '../../lib/cn';

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  // Dark ink on the emerald signal color passes WCAG AA (~7.9:1);
  // white-on-green does not (DESIGN.md, R-25).
  primary:
    'bg-brand-500 text-surface-950 hover:bg-brand-400 disabled:opacity-50',
  secondary:
    'bg-surface-800 text-slate-200 border border-surface-700 hover:bg-surface-700 hover:border-surface-600 disabled:opacity-50',
  ghost:
    'text-slate-400 hover:text-slate-200 hover:bg-surface-800/70 disabled:opacity-50',
  danger:
    'bg-rose-600/15 text-rose-300 border border-rose-500/30 hover:bg-rose-600/25 hover:text-rose-200 disabled:opacity-50',
  success:
    'bg-emerald-500 text-surface-950 hover:bg-emerald-400 disabled:opacity-50'
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-10 px-5 text-sm gap-2',
  icon: 'h-9 w-9 justify-center'
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', className, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center font-medium rounded-lg transition-colors duration-150',
        'focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:ring-offset-2 focus:ring-offset-surface-950',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
);
Button.displayName = 'Button';

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

export const Card: React.FC<
  React.HTMLAttributes<HTMLDivElement>
> = ({ className, children, ...props }) => (
  <div
    className={cn(
      'bg-surface-900/60 border border-surface-800 rounded-xl shadow-sm',
      className
    )}
    {...props}
  >
    {children}
  </div>
);

export const CardHeader: React.FC<
  React.HTMLAttributes<HTMLDivElement>
> = ({ className, children, ...props }) => (
  <div
    className={cn('px-4 py-3 border-b border-surface-800', className)}
    {...props}
  >
    {children}
  </div>
);

export const CardBody: React.FC<
  React.HTMLAttributes<HTMLDivElement>
> = ({ className, children, ...props }) => (
  <div className={cn('p-4', className)} {...props}>
    {children}
  </div>
);

/* ------------------------------------------------------------------ */
/* Badge                                                               */
/* ------------------------------------------------------------------ */

type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-surface-800 text-slate-300 border-surface-700',
  brand: 'bg-brand-600/15 text-brand-300 border-brand-500/30',
  success: 'bg-emerald-600/15 text-emerald-300 border-emerald-500/30',
  warning: 'bg-amber-600/15 text-amber-300 border-amber-500/30',
  danger: 'bg-rose-600/15 text-rose-300 border-rose-500/30'
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export const Badge: React.FC<BadgeProps> = ({
  tone = 'neutral',
  className,
  children,
  ...props
}) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium leading-tight',
      toneClasses[tone],
      className
    )}
    {...props}
  >
    {children}
  </span>
);

/* ------------------------------------------------------------------ */
/* EmptyState                                                          */
/* ------------------------------------------------------------------ */

export interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action
}) => (
  <div className="h-full flex flex-col items-center justify-center text-center p-8 gap-3">
    <div className="h-12 w-12 rounded-2xl bg-surface-900 border border-surface-800 flex items-center justify-center">
      <Icon className="h-6 w-6 text-slate-400" />
    </div>
    <div className="space-y-1">
      <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      {description && (
        <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
          {description}
        </p>
      )}
    </div>
    {action}
  </div>
);

/* ------------------------------------------------------------------ */
/* Spinner                                                             */
/* ------------------------------------------------------------------ */

export const Spinner: React.FC<{ className?: string }> = ({ className }) => (
  <div
    className={cn(
      'h-5 w-5 rounded-full border-2 border-brand-500 border-t-transparent animate-spin',
      className
    )}
  />
);

/* ------------------------------------------------------------------ */
/* StatusDot                                                           */
/* ------------------------------------------------------------------ */

export type StatusKind = 'connected' | 'connecting' | 'error' | 'disconnected';

const statusClasses: Record<StatusKind, string> = {
  connected: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.55)]',
  connecting: 'bg-amber-400 animate-pulse',
  error: 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.55)]',
  disconnected: 'bg-slate-600'
};

export const StatusDot: React.FC<{ status: StatusKind; className?: string }> = ({
  status,
  className
}) => (
  <span
    className={cn(
      'inline-block h-2 w-2 rounded-full',
      statusClasses[status],
      className
    )}
  />
);
