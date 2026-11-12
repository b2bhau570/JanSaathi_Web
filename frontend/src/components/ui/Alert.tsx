import type { ReactNode } from 'react';

type AlertVariant = 'info' | 'success' | 'warning' | 'error';

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: ReactNode;
  className?: string;
}

const config: Record<AlertVariant, { bg: string; border: string; icon: string; iconColor: string }> = {
  info: { bg: 'bg-ink/5', border: 'border-ink/12', icon: 'ph:info-fill', iconColor: 'color: #16130f' },
  success: { bg: 'bg-magenta/8', border: 'border-magenta/20', icon: 'ph:check-circle-fill', iconColor: 'color: #d6246e' },
  warning: { bg: 'bg-creamdeep', border: 'border-ink/14', icon: 'ph:warning-fill', iconColor: 'color: #5a544a' },
  error: { bg: 'bg-magenta/10', border: 'border-magenta/25', icon: 'ph:warning-octagon-fill', iconColor: 'color: #a81554' },
};

export default function Alert({ variant = 'info', title, children, className = '' }: AlertProps) {
  const { bg, border, icon, iconColor } = config[variant];
  return (
    <div
      role="alert"
      className={`flex gap-3 rounded-2xl border p-4 ${bg} ${border} ${className}`}
    >
      <iconify-icon icon={icon} width="20" height="20" style={{ [iconColor.split(':')[0].trim()]: iconColor.split(':')[1].trim(), marginTop: '2px', flexShrink: 0 } as any}></iconify-icon>
      <div className="text-sm text-ink">
        {title && <p className="font-medium mb-1">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}
