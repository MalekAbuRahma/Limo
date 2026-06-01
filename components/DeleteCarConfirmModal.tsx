import React, { useEffect, useId, useRef, useState } from 'react';
import AppModal, { AppModalBody, AppModalFooter, AppModalHeader } from './AppModal';

export type DeleteCarValidationError = 'required' | 'mismatch' | null;

interface DeleteCarConfirmModalProps {
  open: boolean;
  carName: string;
  deleting?: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}

const DeleteCarConfirmModal: React.FC<DeleteCarConfirmModalProps> = ({
  open,
  carName,
  deleting = false,
  onCancel,
  onConfirm,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [validationError, setValidationError] = useState<DeleteCarValidationError>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return;
    setInputValue('');
    setValidationError(null);
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open, carName]);

  if (!open) return null;

  const trimmed = inputValue.trim();
  const nameMatches = trimmed === carName;
  const canDelete = nameMatches && !deleting;

  const handleInputChange = (value: string) => {
    setInputValue(value);
    if (validationError) setValidationError(null);
  };

  const handleDelete = async () => {
    if (!trimmed) {
      setValidationError('required');
      return;
    }
    if (!nameMatches) {
      setValidationError('mismatch');
      return;
    }
    setValidationError(null);
    await onConfirm();
  };

  return (
    <AppModal
      open={open}
      onClose={() => {
        if (!deleting) onCancel();
      }}
      size="md"
      zIndex={100}
      closeOnBackdrop={!deleting}
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <AppModalHeader>
        <h2 id={titleId} className="text-lg font-bold text-slate-900">
          تأكيد حذف السيارة
        </h2>
        <p id={descId} className="text-sm text-slate-600 mt-2 leading-relaxed">
          هل أنت متأكد من حذف هذه السيارة؟
          <br />
          للتأكيد، اكتب اسم السيارة <strong>تماماً</strong> كما هو معروض أدناه.
        </p>
      </AppModalHeader>

      <AppModalBody>
        <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
          <p className="text-xs text-slate-500 mb-1">اسم السيارة</p>
          <p className="font-semibold text-slate-900 break-words">&quot;{carName}&quot;</p>
        </div>

        <label className="block mt-4">
          <span className="text-sm font-medium text-slate-700">اكتب اسم السيارة للتأكيد</span>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            disabled={deleting}
            className={`mt-2 w-full border rounded-lg px-3 py-2.5 text-slate-900 disabled:opacity-60 ${
              validationError
                ? 'border-red-400 focus:ring-red-200'
                : 'border-slate-300 focus:ring-blue-200'
            }`}
            placeholder={carName}
            autoComplete="off"
            aria-invalid={validationError != null}
            aria-describedby={validationError ? 'delete-car-error' : undefined}
          />
        </label>

        {validationError === 'required' && (
          <p id="delete-car-error" className="text-sm text-red-600 font-medium mt-2" role="alert">
            اسم السيارة مطلوب.
          </p>
        )}
        {validationError === 'mismatch' && (
          <p id="delete-car-error" className="text-sm text-red-600 font-medium mt-2" role="alert">
            الاسم المدخل غير مطابق.
          </p>
        )}

        <p className="text-xs text-slate-500 mt-3">
          مثال: اكتب <span className="font-mono text-slate-700">{carName}</span>
        </p>
      </AppModalBody>

      <AppModalFooter>
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="px-5 py-2.5 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 disabled:opacity-60"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={!canDelete}
            className="px-5 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {deleting ? 'جاري الحذف...' : 'حذف'}
          </button>
        </div>
      </AppModalFooter>
    </AppModal>
  );
};

export default DeleteCarConfirmModal;
