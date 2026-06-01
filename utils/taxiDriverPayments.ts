/** ثلاث دفعات شهرية — الإيراد يُقسَّم على ٣ أقساط متساوية */
export const DRIVER_PAYMENT_COUNT = 3;

export const DRIVER_PAYMENT_LABELS = ['دفع ضمان ١', 'دفع ضمان ٢', 'دفع ضمان ٣'] as const;

export type DriverPaymentTriple = [number, number, number];

/** يقسّم الإيراد على ٣ أقساط (الباقي يُضاف للقسط الثالث) */
export function splitRevenueToInstallments(revenue: number): DriverPaymentTriple {
  const total = Math.max(0, Math.round(revenue));
  const base = Math.floor(total / DRIVER_PAYMENT_COUNT);
  const remainder = total - base * DRIVER_PAYMENT_COUNT;
  return [base, base, base + remainder];
}

export function sumDriverPayments(payments: DriverPaymentTriple): number {
  return payments[0] + payments[1] + payments[2];
}

/** يوزّع مدفوعاً قديماً (حقل واحد) على الأقساط حتى حد كل قسط */
function legacyPaidToInstallments(
  legacyPaid: number,
  targets: DriverPaymentTriple
): DriverPaymentTriple {
  let left = Math.max(0, Math.round(legacyPaid));
  const out: number[] = [];
  for (let i = 0; i < DRIVER_PAYMENT_COUNT; i++) {
    const part = Math.min(left, targets[i]);
    out.push(part);
    left -= part;
  }
  return out as DriverPaymentTriple;
}

export function normalizeDriverPayments(
  raw: number[] | undefined,
  legacyPaid: number | undefined,
  revenue: number
): DriverPaymentTriple {
  const targets = splitRevenueToInstallments(revenue);

  if (raw && raw.length >= DRIVER_PAYMENT_COUNT) {
    return [
      Math.max(0, Math.round(raw[0] ?? 0)),
      Math.max(0, Math.round(raw[1] ?? 0)),
      Math.max(0, Math.round(raw[2] ?? 0)),
    ];
  }

  if (legacyPaid != null && legacyPaid > 0) {
    return legacyPaidToInstallments(legacyPaid, targets);
  }

  return [0, 0, 0];
}

/** المبلغ المطلوب من السائق هذا الشهر (من الإيراد) */
export function entryTotalDue(revenue: number, fallbackGuarantee: number): number {
  return revenue > 0 ? revenue : fallbackGuarantee;
}
