import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

export default function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      previousFocus.current = document.activeElement as HTMLElement;
      dialog.showModal();
    } else {
      dialog.close();
      previousFocus.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className={`
        ${sizeClasses[size]} w-full rounded-2xl border-0 p-0 shadow-2xl
        bg-cream text-ink
        backdrop:bg-ink/40 backdrop:backdrop-blur-sm
      `}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
      aria-labelledby="modal-title"
    >
      <div className="p-6 md:p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 id="modal-title" className="font-serif opsz-72 text-lg font-semibold text-ink">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-inkmute hover:bg-creamdeep hover:text-ink focus:outline-none focus:ring-2 focus:ring-magenta/30 transition-colors"
            aria-label="Close dialog"
          >
            <iconify-icon icon="ph:x-bold" width="18" height="18"></iconify-icon>
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
