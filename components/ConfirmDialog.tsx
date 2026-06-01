import React, { useEffect, useId } from 'react';

export interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title = 'تأكيد الحذف',
  message,
  confirmLabel = 'نعم، احذف',
  cancelLabel = 'لا، إلغاء',
  onCancel,
  onConfirm,
}) => {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/55 p-0 sm:p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      dir="rtl"
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-sm w-full border border-red-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-red-600 px-5 py-3.5 text-white">
          <h2 id={titleId} className="text-base font-bold">
            {title}
          </h2>
        </div>
        <div className="p-5 text-right space-y-4">
          <div className="text-sm text-slate-700 leading-relaxed">{message}</div>
          <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            لا يمكن التراجع عن هذا الإجراء.
          </p>
          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-800 text-sm font-medium hover:bg-slate-50 min-h-[44px]"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="flex-1 py-2.5 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700 min-h-[44px]"
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
