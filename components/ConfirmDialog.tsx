import React from 'react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'confirm' | 'success';
  isRtl?: boolean;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  variant = 'confirm',
  isRtl = false
}) => {
  if (!open) return null;

  const isSuccess = variant === 'success';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/60"
        aria-hidden
        onClick={isSuccess ? onConfirm : onCancel}
      />
      <div
        className="relative w-full max-w-md bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
      >
        <div className="p-6">
          <h2 id="confirm-dialog-title" className="text-lg font-semibold text-slate-900 mb-2">
            {title}
          </h2>
          <p id="confirm-dialog-desc" className="text-slate-600 text-sm leading-relaxed mb-6">
            {message}
          </p>
          <div className={`flex gap-3 ${isRtl ? 'flex-row-reverse' : ''}`}>
            {!isSuccess && cancelLabel != null && (
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 py-2.5 px-4 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50"
              >
                {cancelLabel}
              </button>
            )}
            <button
              type="button"
              onClick={onConfirm}
              className="flex-1 py-2.5 px-4 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 border border-slate-700"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
