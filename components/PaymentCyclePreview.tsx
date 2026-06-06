import { useState } from 'react';
import {
  buildPaymentCyclePreview,
  recordAnchorDiffersFromSettings,
} from '../utils/taxiPaymentCyclePreview';
import { formatIsoDateDisplay } from '../utils/taxiCalendarIso';

export interface PaymentCyclePreviewProps {
  firstPaymentDate?: string;
  maxCount?: number;
  recordAnchor?: string;
  editingPriorCycle?: boolean;
  className?: string;
}

const AR_INDEX = ['', '١', '٢', '٣', '٤', '٥', '٦'];

export function PaymentCyclePreview({
  firstPaymentDate,
  maxCount = 6,
  recordAnchor,
  editingPriorCycle = false,
  className = '',
}: PaymentCyclePreviewProps) {
  const [open, setOpen] = useState(false);
  const preview = buildPaymentCyclePreview(firstPaymentDate ?? '', maxCount);
  const showRecordAnchor = recordAnchorDiffersFromSettings(recordAnchor, firstPaymentDate);

  if (!firstPaymentDate?.trim()) {
    return (
      <div className={`rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 ${className}`}>
        <p className="text-[11px] text-amber-800">
          ⚠️ عيّن تاريخ أول دفعة من تبويب الإعدادات.
        </p>
      </div>
    );
  }

  if (!preview) return null;

  return (
    <div className={`relative ${className}`} dir="rtl">
      {/* Compact trigger row */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/80 px-3 py-2">
        <span className="text-[11px] font-medium text-blue-900 shrink-0">مواعيد الضمان:</span>

        {/* Pill chips — all dates inline */}
        <div className="flex flex-wrap gap-1 flex-1 min-w-0">
          {preview.slots.map((slot) => (
            <span
              key={`${slot.index}-${slot.dueLabel}`}
              title={slot.detailLabel}
              className="inline-flex items-center gap-1 rounded-full bg-white border border-blue-200 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-800 cursor-default select-none"
            >
              <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-600 text-[8px] font-bold text-white leading-none">
                {AR_INDEX[slot.index] ?? slot.index}
              </span>
              {slot.dueLabel}
            </span>
          ))}
        </div>

        {/* Info toggle */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 text-blue-500 hover:text-blue-700 transition-colors"
          aria-label={open ? 'إخفاء التفاصيل' : 'إظهار التفاصيل'}
          title={open ? 'إخفاء التفاصيل' : 'إظهار التفاصيل'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {open
              ? <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
              : <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />}
          </svg>
        </button>
      </div>

      {/* Expanded detail panel */}
      {open && (
        <div className="mt-1 rounded-lg border border-blue-100 bg-white shadow-md px-3 py-2.5 space-y-2 z-10">
          <p className="text-[11px] text-blue-800/90 leading-snug">{preview.subtitle}</p>

          {showRecordAnchor && recordAnchor && (
            <p className="text-[11px] text-slate-600 tabular-nums">
              مرساة هذا السجل:{' '}
              <span className="font-medium">{formatIsoDateDisplay(recordAnchor)}</span>
            </p>
          )}

          {editingPriorCycle && (
            <p className="text-[11px] text-amber-900 font-medium leading-snug">
              دورة دفع قديمة — يُحدَّث الاحتساب عند إعادة حفظ السجل.
            </p>
          )}

          <ul className="space-y-1" aria-label="جدول مواعيد الضمان">
            {preview.slots.map((slot) => (
              <li
                key={`${slot.index}-${slot.dueLabel}`}
                className="flex items-center gap-2 rounded-md bg-blue-50/60 border border-blue-100/80 px-2 py-1"
              >
                <span className="shrink-0 inline-flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[9px] font-bold text-white">
                  {AR_INDEX[slot.index] ?? slot.index}
                </span>
                <span className="text-xs font-semibold text-slate-900 tabular-nums">{slot.dueLabel}</span>
                <span className="text-[10px] text-slate-500 leading-snug">— {slot.detailLabel}</span>
              </li>
            ))}
          </ul>

          {preview.nextLine && (
            <p className="text-[11px] text-emerald-900 bg-emerald-50 border border-emerald-100 rounded-md px-2 py-1 leading-snug">
              {preview.nextLine}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
