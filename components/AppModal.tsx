import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLockBodyScroll } from '../utils/useLockBodyScroll';

export type AppModalSize = 'sm' | 'md' | 'lg';

export interface AppModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  size?: AppModalSize;
  zIndex?: number;
  dir?: 'rtl' | 'ltr';
  closeOnBackdrop?: boolean;
  panelClassName?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
}

const AppModal: React.FC<AppModalProps> = ({
  open,
  onClose,
  children,
  size = 'md',
  zIndex = 100,
  dir = 'rtl',
  closeOnBackdrop = true,
  panelClassName = '',
  'aria-labelledby': ariaLabelledby,
  'aria-describedby': ariaDescribedby,
}) => {
  useLockBodyScroll(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="app-modal-backdrop"
      style={{ zIndex }}
      onClick={closeOnBackdrop ? onClose : undefined}
      role="presentation"
    >
      <div
        className={`app-modal-panel app-modal-panel--${size} ${panelClassName}`.trim()}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        dir={dir}
        aria-labelledby={ariaLabelledby}
        aria-describedby={ariaDescribedby}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};

export const AppModalHeader: React.FC<{
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'danger' | 'success' | 'warning';
}> = ({ children, className = '', variant = 'default' }) => (
  <div className={`app-modal-panel__head app-modal-panel__head--${variant} ${className}`.trim()}>
    {children}
  </div>
);

export const AppModalBody: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <div className={`app-modal-panel__body ${className}`.trim()}>{children}</div>
);

export const AppModalFooter: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <div className={`app-modal-panel__foot ${className}`.trim()}>{children}</div>
);

export default AppModal;
