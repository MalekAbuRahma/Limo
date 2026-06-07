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
  const [expanded, setExpanded] = useState(false);
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

  // Tooltip content: all dates as a simple list
  const tooltipLines = preview.slots.map(
    (s) => `${AR_INDEX[s.index] ?? s.index}. ${s.dueLabel}  — ${s.detailLabel}`
  );
  const tooltipText = tooltipLines.join('\n');

  return (
    <div className={`relative ${className}`} dir="rtl">
      {/* ── Compact single-line row ── */}
      <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/80 px-3 py-2">

        {/* Label */}
        <span className="text-[11px] font-medium text-blue-900 shrink-0">مواعيد الضمان:</span>

        {/* First date summary — always visible */}
        <span className="text-[11px] tabular-nums text-slate-700 shrink-0">
          {preview.slots[0]?.dueLabel ?? '—'}
          {preview.slots.length > 1 && (
            <span className="text-slate-400 mr-1">+{preview.slots.length - 1}</span>
          )}
        </span>

        {/* Hover-tooltip info icon */}
        <div className="relative group shrink-0">
          <button
            type="button"
            title={tooltipText}
            className="flex items-center justify-center w-4 h-4 rounded-full bg-blue-200 text-blue-700 text-[9px] font-bold hover:bg-blue-600 hover:text-white transition-colors cursor-help"
            aria-label="مواعيد الضمان الكاملة"
            onClick={() => setExpanded((v) => !v)}
          >
            ⓘ
          </button>

          {/* CSS tooltip on hover */}
          <div
            className="pointer-events-none absolute z-50 hidden group-hover:block
              bottom-full mb-2 right-0 w-56
              bg-slate-800 text-white text-[10px] leading-relaxed
              rounded-xl shadow-xl px-3 py-2.5 whitespace-pre-line tabular-nums"
            role="tooltip"
          >
            <p className="font-semibold text-[11px] mb-1.5 text-blue-200">مواعيد الضمان</p>
            {preview.slots.map((slot) => (
              <div key={`${slot.index}-${slot.dueLabel}`} className="flex items-start gap-1.5 mb-1">
                <span className="shrink-0 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-500 text-[8px] font-bold mt-0.5">
                  {AR_INDEX[slot.index] ?? slot.index}
                </span>
                <div>
                  <span className="font-medium text-white">{slot.dueLabel}</span>
                  <span className="block text-slate-300 text-[9px]">{slot.detailLabel}</span>
                </div>
              </div>
            ))}
            {preview.nextLine && (
              <p className="text-emerald-300 border-t border-slate-600 pt-1.5 mt-1 text-[9px]">
                {preview.nextLine}
              </p>
            )}
            {/* Arrow */}
            <span className="absolute top-full right-3 border-4 border-transparent border-t-slate-800" />
          </div>
        </div>

        {/* Expand/collapse chevron */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mr-auto shrink-0 text-blue-400 hover:text-blue-600 transition-colors"
          aria-label={expanded ? 'إخفاء التفاصيل' : 'إظهار التفاصيل'}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* ── Expanded detail panel ── */}
      {expanded && (
        <div className="mt-1 rounded-lg border border-blue-100 bg-white shadow-md px-3 py-2.5 space-y-2">
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
