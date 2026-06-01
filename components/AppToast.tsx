import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

export type AppToastTone = 'success' | 'error' | 'info' | 'warning';

export interface AppToastProps {
  message: string;
  tone?: AppToastTone;
  onDismiss: () => void;
  dir?: 'rtl' | 'ltr';
  autoDismissMs?: number;
}

const toneClass: Record<AppToastTone, string> = {
  success: 'app-toast--success',
  error: 'app-toast--error',
  info: 'app-toast--info',
  warning: 'app-toast--warning',
};

const AppToast: React.FC<AppToastProps> = ({
  message,
  tone = 'info',
  onDismiss,
  dir = 'rtl',
  autoDismissMs = 5000,
}) => {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, autoDismissMs);
    return () => window.clearTimeout(timer);
  }, [onDismiss, autoDismissMs, message]);

  return createPortal(
    <div className="app-toast-host" dir={dir}>
      <div
        className={`app-toast ${toneClass[tone]}`}
        role={tone === 'error' ? 'alert' : 'status'}
        aria-live={tone === 'error' ? 'assertive' : 'polite'}
      >
        <p className="app-toast__message">{message}</p>
        <button
          type="button"
          className="app-toast__dismiss"
          onClick={onDismiss}
          aria-label={dir === 'rtl' ? 'إغلاق' : 'Dismiss'}
        >
          ×
        </button>
      </div>
    </div>,
    document.body
  );
};

export default AppToast;
