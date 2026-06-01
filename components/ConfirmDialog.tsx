import React, { useId } from 'react';
import AppModal, { AppModalBody, AppModalFooter, AppModalHeader } from './AppModal';

export interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
  variant?: 'danger' | 'neutral';
  dir?: 'rtl' | 'ltr';
  showIrreversibleNote?: boolean;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title = 'تأكيد الحذف',
  message,
  confirmLabel = 'نعم، احذف',
  cancelLabel = 'لا، إلغاء',
  onCancel,
  onConfirm,
  variant = 'danger',
  dir = 'rtl',
  showIrreversibleNote = variant === 'danger',
}) => {
  const titleId = useId();
  const isDanger = variant === 'danger';

  return (
    <AppModal
      open={open}
      onClose={onCancel}
      size="sm"
      zIndex={110}
      dir={dir}
      aria-labelledby={titleId}
    >
      <AppModalHeader variant={isDanger ? 'danger' : 'default'}>
        <h2 id={titleId} className="text-base font-bold">
          {title}
        </h2>
      </AppModalHeader>
      <AppModalBody>
        <div className="text-sm text-slate-700 leading-relaxed">{message}</div>
        {showIrreversibleNote && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mt-4">
            {dir === 'rtl' ? 'لا يمكن التراجع عن هذا الإجراء.' : 'This action cannot be undone.'}
          </p>
        )}
      </AppModalBody>
      <AppModalFooter>
        <div className="flex flex-col-reverse sm:flex-row gap-2 pt-3">
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
            className={`flex-1 py-2.5 rounded-lg text-white text-sm font-bold min-h-[44px] ${
              isDanger
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </AppModalFooter>
    </AppModal>
  );
};

export default ConfirmDialog;
