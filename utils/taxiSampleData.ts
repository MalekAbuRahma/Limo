import { MonthlyEntry, TaxiSettings } from '../taxiTypes';
import { formatMonthLabel, sumExpenses } from './taxiCalculations';

/** قيمة ثابتة بين 0 و 1 من فهرس الشهر */
function seededUnit(seed: number): number {
  return ((seed * 9301 + 49297) % 233280) / 233280;
}

/**
 * يولّد سجلات شهرية تجريبية (افتراضياً 3 سنوات = 36 شهراً)
 * من أقدم شهر حتى الشهر الحالي.
 */
export function generateSampleEntries(years = 3): MonthlyEntry[] {
  const count = years * 12;
  const now = new Date();
  const entries: MonthlyEntry[] = [];

  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const mo = d.getMonth() + 1;
    const date = `${y}-${String(mo).padStart(2, '0')}-01`;
    const month = formatMonthLabel(date);
    const idx = count - 1 - i;
    const s = Math.floor(seededUnit(idx * 17 + y * 3 + mo) * 100);

    const driverName = idx < 20 ? 'محمد علي' : 'خالد أحمد';
    const revenue =
      750 + (s % 5 === 0 ? 50 : 0) - (s % 11 === 0 ? 30 : 0);

    const oil = mo % 3 === 0 ? 45 + (s % 20) : 0;
    const maintenance = mo % 6 === 0 ? 100 + (s % 50) : 0;
    const commission = s % 8 === 0 ? 35 : 0;
    const other = s % 6 === 0 ? 25 + (s % 30) : 0;

    const accident = s % 17 === 0 ? 80 + (s % 40) : 0;
    const expenseDetails = {
      office: 0,
      insurance: 0,
      oil,
      maintenance,
      accident,
      commission,
      other,
    };
    const expenses = sumExpenses(expenseDetails);

    const isLate = s % 9 === 0 || s % 13 === 0;
    const driverPaid = isLate
      ? Math.round(revenue * (0.55 + (s % 4) * 0.1))
      : revenue;

    let notes: string | undefined;
    if (maintenance > 0) notes = 'صيانة دورية';
    else if (isLate) notes = 'دفعة جزئية — متابعة';
    else if (oil > 0 && s % 4 === 0) notes = 'تغيير زيت';

    entries.push({
      id: `sample-${y}-${String(mo).padStart(2, '0')}`,
      date,
      month,
      driverName,
      revenue,
      expenses,
      expenseDetails,
      notes,
      driverPaid,
      monthlyGuarantee: 750,
    });
  }

  return entries;
}

export function getSampleSettingsPatch(): Partial<TaxiSettings> {
  return {
    currentDriverName: 'خالد أحمد',
    monthlyGuarantee: 750,
    vehicleLabel: 'VIP limousine CARS',
  };
}
