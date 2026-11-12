import type { ReactNode } from 'react';
import type { Priority, CaseStatus, DoctorStatus } from '../../types';

type BadgeVariant = 'info' | 'success' | 'warning' | 'error' | 'neutral';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  info: 'bg-ink/8 text-ink border-ink/10',
  success: 'bg-magenta/10 text-magenta border-magenta/20',
  warning: 'bg-ink/6 text-inkmute border-ink/12',
  error: 'bg-magenta/15 text-magentadeep border-magenta/25',
  neutral: 'bg-creamdeep text-inkmute border-ink/8',
};

export default function Badge({ variant = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center rounded-full px-2.5 py-0.5 border
        text-xs font-medium whitespace-nowrap
        ${variantClasses[variant]}
        ${className}
      `}
    >
      {children}
    </span>
  );
}

/* Helper badges */

const priorityMap: Record<Priority, { variant: BadgeVariant; label: string }> = {
  critical: { variant: 'error', label: 'Critical' },
  high: { variant: 'warning', label: 'High' },
  medium: { variant: 'info', label: 'Medium' },
  low: { variant: 'neutral', label: 'Low' },
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const { variant, label } = priorityMap[priority];
  return <Badge variant={variant}>{label}</Badge>;
}

const statusMap: Record<CaseStatus, { variant: BadgeVariant; label: string }> = {
  submitted: { variant: 'neutral', label: 'Submitted' },
  ai_processing: { variant: 'info', label: 'AI Processing' },
  awaiting_review: { variant: 'warning', label: 'Awaiting Review' },
  under_review: { variant: 'info', label: 'Under Review' },
  follow_up_requested: { variant: 'warning', label: 'Follow-Up' },
  treatment_planned: { variant: 'info', label: 'Treatment Planned' },
  completed: { variant: 'success', label: 'Completed' },
  closed: { variant: 'neutral', label: 'Closed' },
};

export function StatusBadge({ status }: { status: CaseStatus }) {
  const { variant, label } = statusMap[status];
  return <Badge variant={variant}>{label}</Badge>;
}

const doctorStatusMap: Record<DoctorStatus, { variant: BadgeVariant; label: string }> = {
  pending: { variant: 'warning', label: 'Pending' },
  approved: { variant: 'success', label: 'Approved' },
  suspended: { variant: 'error', label: 'Suspended' },
};

export function DoctorStatusBadge({ status }: { status: DoctorStatus }) {
  const { variant, label } = doctorStatusMap[status];
  return <Badge variant={variant}>{label}</Badge>;
}
