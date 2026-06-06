/**
 * نصوص ومعطيات معاينة دورة الدفع — للواجهة فقط (بدون منطق حساب جديد).
 */
import * as cal from './taxiCalendarIso';
import {
  generateDueDates,
  usesRollingPaymentCycle,
  LATE_ANCHOR_DAY_THRESHOLD,
} from './taxiPaymentCycle';

export interface PaymentCyclePreviewSlot {
  index: number;
  dueLabel: string;
  detailLabel: string;
}

export interface PaymentCyclePreviewData {
  kind: 'rolling' | 'monthly';
  title: string;
  subtitle: string;
  startLabel: string;
  slots: PaymentCyclePreviewSlot[];
  nextLine: string | null;
}

const AR_INDEX = ['', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨'];

export function buildPaymentCyclePreview(
  firstPaymentDate: string,
  maxCount = 6
): PaymentCyclePreviewData | null {
  const first = firstPaymentDate?.trim();
  if (!first) return null;

  const isos = generateDueDates(first, { maxCount });
  if (!isos.length) return null;

  const rolling = usesRollingPaymentCycle(first);
  const slots: PaymentCyclePreviewSlot[] = isos.map((iso, i) => {
    const dueLabel = cal.formatIsoDateDisplay(iso);
    let detailLabel: string;
    if (rolling) {
      const end = cal.addCalendarDaysIso(iso, cal.PAYMENT_INTERVAL_DAYS - 1);
      detailLabel = `١٠ أيام تشغيل: ${dueLabel} → ${cal.formatIsoDateDisplay(end)}`;
    } else if (i === 0) {
      detailLabel = 'أول دفعة في الشهر';
    } else {
      detailLabel = `الدفعة ${AR_INDEX[i + 1] ?? String(i + 1)} في نفس الشهر`;
    }
    return { index: i + 1, dueLabel, detailLabel };
  });

  const nextLine =
    slots.length >= 2
      ? rolling
        ? `بعد إنهاء الضمان الأول، يبدأ الثاني في ${slots[1].dueLabel}`
        : `الدفعة التالية بعد ${slots[0].dueLabel}: ${slots[1].dueLabel}`
      : null;

  return {
    kind: rolling ? 'rolling' : 'monthly',
    title: 'مواعيد دفع الضمان',
    subtitle: rolling
      ? `يوم البداية أكبر من ${LATE_ANCHOR_DAY_THRESHOLD} — كل ضمان ١٠ أيام تشغيل، ثم يبدأ التالي في اليوم التالي`
      : `يوم البداية ≤ ${LATE_ANCHOR_DAY_THRESHOLD} — ٣ دفعات في كل شهر (نفس اليوم و +١٠ و +٢٠)`,
    startLabel: slots[0].dueLabel,
    slots,
    nextLine,
  };
}

export function recordAnchorDiffersFromSettings(
  recordAnchor: string | undefined,
  settingsFirstPayment: string | undefined
): boolean {
  const a = recordAnchor?.trim();
  const b = settingsFirstPayment?.trim();
  if (!a || !b) return false;
  return a !== b;
}
