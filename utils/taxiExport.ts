import {
  EXPENSE_FIELD_LABELS,
  REPORT_EXPENSE_KEYS,
  ExpenseBreakdown,
  TaxiSettings,
} from '../taxiTypes';
import { EntryComputed, DashboardTotals, RoiAnalysis } from './taxiCalculations';
import { formatNumber, formatInteger } from './taxiFormat';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function safeFilename(label: string) {
  return label.replace(/[^\w\u0600-\u06FF\-]/g, '_').slice(0, 40) || 'taxi-report';
}

export async function exportTaxiToExcel(
  entries: EntryComputed[],
  settings: TaxiSettings,
  totals: DashboardTotals,
  roi: RoiAnalysis
): Promise<void> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Taxi Tracker';

  const tracking = wb.addWorksheet('المتابعة الشهرية', {
    views: [{ rightToLeft: true }],
  });

  const expenseKeys = [...REPORT_EXPENSE_KEYS];
  const headers = [
    'الفترة',
    'رقم الشهر',
    'السائق',
    'الإيراد',
    ...expenseKeys.map((k) => EXPENSE_FIELD_LABELS[k]),
    'مجموع المصاريف',
    'مدفوع السائق',
    'الضمان',
    'المتبقي',
    'الحالة',
    'ملاحظات',
  ];

  tracking.addRow(headers);
  const headerRow = tracking.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF2563EB' },
  };
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };

  const sorted = [...entries].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  for (const e of sorted) {
    tracking.addRow([
      e.month,
      e.date,
      e.driverName,
      e.revenue,
      ...expenseKeys.map((k) => e.expenseDetails[k]),
      e.expenses,
      e.driverPaid,
      e.guarantee,
      e.remaining,
      e.status,
      e.notes ?? '',
    ]);
  }

  tracking.columns.forEach((col, i) => {
    col.width = i === headers.length - 1 ? 28 : 14;
  });

  const summary = wb.addWorksheet('الملخص', { views: [{ rightToLeft: true }] });
  summary.addRow(['البند', 'القيمة (د.أ)']);
  summary.getRow(1).font = { bold: true };
  const summaryRows: [string, number | string][] = [
    ['إجمالي الإيرادات', totals.totalRevenue],
    ['إجمالي المصاريف', totals.totalExpenses],
    ['صافي الربح', totals.netProfit],
    ['مجموع المدفوع', totals.totalPaid],
    ['مجموع المتبقي', totals.totalRemaining],
    ['أشهر مكتملة', totals.paidCount],
    ['أشهر غير مكتملة', totals.lateCount],
    ['', ''],
    ['تكلفة السيارة', settings.vehicleCost],
    ['مدة الاستخدام (سنوات)', settings.vehicleLifeYears],
    ['متوسط الصافي الشهري', roi.avgMonthlyNet],
    ['مدة استرداد رأس المال (شهر)', roi.breakEvenMonths],
    ['صافي الربح بعد التكلفة (7 سنوات)', roi.netGainAfterCost],
  ];
  summaryRows.forEach((r) => summary.addRow(r));
  summary.getColumn(1).width = 32;
  summary.getColumn(2).width = 18;

  const settingsSheet = wb.addWorksheet('الإعدادات', { views: [{ rightToLeft: true }] });
  settingsSheet.addRow(['الإعداد', 'القيمة']);
  settingsSheet.getRow(1).font = { bold: true };
  [
    ['اسم السيارة', settings.vehicleLabel],
    ['الضمان الشهري', settings.monthlyGuarantee],
    ['اسم السائق الحالي', settings.currentDriverName],
    ['تكلفة السيارة', settings.vehicleCost],
    ['مدة قبل الشطب (سنوات)', settings.vehicleLifeYears],
  ].forEach((r) => settingsSheet.addRow(r));
  settingsSheet.getColumn(1).width = 28;
  settingsSheet.getColumn(2).width = 20;

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const name = `${safeFilename(settings.vehicleLabel)}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  downloadBlob(blob, name);
}

export function exportTaxiToPdf(
  entries: EntryComputed[],
  settings: TaxiSettings,
  totals: DashboardTotals,
  roi: RoiAnalysis
): void {
  const expenseKeys = [...REPORT_EXPENSE_KEYS];
  const sorted = [...entries].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const fmt = formatNumber;

  const tableRows = sorted
    .map(
      (e) => `
    <tr>
      <td>${e.month}</td>
      <td>${e.driverName}</td>
      <td>${fmt(e.revenue)}</td>
      <td>${fmt(e.expenses)}</td>
      <td>${fmt(e.driverPaid)}</td>
      <td>${fmt(e.remaining)}</td>
      <td>${e.status}</td>
    </tr>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>${settings.vehicleLabel} — تقرير</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; padding: 24px; color: #1e293b; font-size: 14px; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    h2 { font-size: 16px; margin-top: 24px; border-bottom: 2px solid #2563eb; padding-bottom: 6px; }
    .meta { color: #64748b; margin-bottom: 20px; }
    .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 16px 0; }
    .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
    .card strong { display: block; font-size: 18px; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: right; }
    th { background: #2563eb; color: white; }
    tr:nth-child(even) { background: #f8fafc; }
    @media print {
      body { padding: 12px; }
      button { display: none; }
    }
  </style>
</head>
<body>
  <button onclick="window.print()" style="margin-bottom:16px;padding:8px 16px;cursor:pointer;">طباعة / حفظ PDF</button>
  <h1>${settings.vehicleLabel}</h1>
  <p class="meta">تقرير متابعة سيارة أجرة — ${new Date().toLocaleDateString('en-GB')}</p>

  <h2>ملخص</h2>
  <div class="cards">
    <div class="card"><span>إجمالي الإيرادات</span><strong>${fmt(totals.totalRevenue)} د.أ</strong></div>
    <div class="card"><span>إجمالي المصاريف</span><strong>${fmt(totals.totalExpenses)} د.أ</strong></div>
    <div class="card"><span>صافي الربح</span><strong>${fmt(totals.netProfit)} د.أ</strong></div>
    <div class="card"><span>مجموع المدفوع</span><strong>${fmt(totals.totalPaid)} د.أ</strong></div>
    <div class="card"><span>مجموع المتبقي</span><strong>${fmt(totals.totalRemaining)} د.أ</strong></div>
    <div class="card"><span>استرداد رأس المال</span><strong>${formatInteger(roi.breakEvenMonths)} شهر</strong></div>
  </div>

  <h2>المتابعة الشهرية</h2>
  <table>
    <thead>
      <tr>
        <th>الفترة</th>
        <th>السائق</th>
        <th>الإيراد</th>
        <th>المصاريف</th>
        <th>مدفوع</th>
        <th>المتبقي</th>
        <th>الحالة</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows || '<tr><td colspan="7">لا توجد سجلات</td></tr>'}
    </tbody>
  </table>

  <h2>تفاصيل المصاريف (إجمالي)</h2>
  <table>
    <thead><tr><th>البند</th><th>المبلغ</th></tr></thead>
    <tbody>
      ${expenseKeys
        .filter((k) => totals.expenseByCategory[k] > 0)
        .map(
          (k) =>
            `<tr><td>${EXPENSE_FIELD_LABELS[k]}</td><td>${fmt(totals.expenseByCategory[k])} د.أ</td></tr>`
        )
        .join('')}
      <tr><td><strong>المجموع</strong></td><td><strong>${fmt(totals.expenseByCategory.grandTotal)} د.أ</strong></td></tr>
    </tbody>
  </table>

  <p style="margin-top:24px;color:#94a3b8;font-size:12px;">تكلفة السيارة: ${fmt(settings.vehicleCost)} د.أ — مدة ${settings.vehicleLifeYears} سنوات</p>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) {
    throw new Error('POPUP_BLOCKED');
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 500);
}
