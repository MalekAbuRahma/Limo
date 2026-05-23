import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Car, DriverHistoryEntry, CarExpenses, ExpenseHistoryEntry, ActionLogEntry } from '../types';
import FinancialStats from './FinancialStats';
import { ProjectionChart } from './Charts';
import UnitConfigModal from './UnitConfigModal';
import HandoverModal from './HandoverModal';
import EditHistoryModal from './EditHistoryModal';
import ConfirmDialog from './ConfirmDialog';
import { translations, Language } from '../translations';
import { aiService } from '../AIService';
import ExcelJS from 'exceljs';

interface CarDashboardProps {
  car: Car;
  onUpdate: (updatedCar: Car) => void;
  onBack: () => void;
  lang: Language;
}

const CarDashboard: React.FC<CarDashboardProps> = ({ car, onUpdate, onBack, lang }) => {
  const t = translations[lang];
  const isRtl = lang === 'ar';
  const [activeTab, setActiveTab] = useState<'dashboard' | 'reports'>('dashboard');
  const [showUnitConfigModal, setShowUnitConfigModal] = useState(false);
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [showInstallmentModal, setShowInstallmentModal] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [editingHistoryEntry, setEditingHistoryEntry] = useState<DriverHistoryEntry | null>(null);
  const [isAiEditing, setIsAiEditing] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isProcessingAi, setIsProcessingAi] = useState(false);
  
  const settingsRef = useRef<HTMLDivElement>(null);
  
  const [localExpenses, setLocalExpenses] = useState<CarExpenses>({
    office: 0,
    insurance: 0,
    oil: 0,
    maintenance: 0,
    installments: 0,
    other: 0
  });
  const [localRent, setLocalRent] = useState(car.monthlyRent);
  const [localCost, setLocalCost] = useState(car.purchaseCost);
  const [localDuration, setLocalDuration] = useState(car.durationYears);

  type ConfirmType = 'saveExpenses' | 'clearPayments' | 'saveSuccess';
  const [confirmDialog, setConfirmDialog] = useState<{ type: ConfirmType; successDate?: string } | null>(null);
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
  const [expenseFilterDriver, setExpenseFilterDriver] = useState('');
  const [expenseFilterFrom, setExpenseFilterFrom] = useState('');
  const [expenseFilterTo, setExpenseFilterTo] = useState('');

  useEffect(() => {
    // We don't want to sync localExpenses with car.expenses here because we want it empty for new entries
    setLocalRent(car.monthlyRent);
    setLocalCost(car.purchaseCost);
    setLocalDuration(car.durationYears);
  }, [car.id, car.monthlyRent, car.purchaseCost, car.durationYears]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setShowSettingsMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentDriver = useMemo(() => car.driverHistory.find(h => !h.endDate) || car.driverHistory[car.driverHistory.length - 1], [car.driverHistory]);

  const handleHandoverSubmit = (data: { driverName: string; startDate: string; endDate?: string; notes: string }) => {
    const updatedHistory = car.driverHistory.map(h => !h.endDate ? { ...h, endDate: data.startDate } : h);
    const newEntry: DriverHistoryEntry = { 
      id: Date.now().toString(), 
      driverName: data.driverName.trim(), 
      startDate: data.startDate,
      notes: data.notes
    };
    onUpdate({ 
      ...car, 
      driverHistory: [...updatedHistory, newEntry], 
      actions: [{ 
        id: Date.now().toString(), 
        timestamp: new Date().toISOString(), 
        type: 'HANDOVER', 
        description: `Handover to ${newEntry.driverName}` 
      }, ...(car.actions || [])] 
    });
    setShowHandoverModal(false);
  };

  const handleEditHistorySave = (updatedEntry: DriverHistoryEntry) => {
    const updatedHistory = car.driverHistory.map(h => h.id === updatedEntry.id ? updatedEntry : h);
    const action: ActionLogEntry = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      type: 'CONFIG_UPDATE',
      description: `Edited history entry for ${updatedEntry.driverName}`
    };
    onUpdate({
      ...car,
      driverHistory: updatedHistory,
      actions: [action, ...(car.actions || [])]
    });
    setEditingHistoryEntry(null);
  };

  const handlePaymentToggle = (idx: number) => {
    const p = [...car.paymentsPaid] as [boolean, boolean, boolean];
    p[idx] = !p[idx];
    onUpdate({ ...car, paymentsPaid: p });
  };

  const handleClearPayments = () => {
    setConfirmDialog({ type: 'clearPayments' });
  };

  const doClearPayments = () => {
    onUpdate({ ...car, paymentsPaid: [false, false, false] });
    setConfirmDialog(null);
  };

  const requestSaveExpenses = () => {
    setConfirmDialog({ type: 'saveExpenses' });
  };

  const doSaveAllFinancials = () => {
    setConfirmDialog(null);
    const total = (Object.values(localExpenses) as number[]).reduce((a, b) => a + b, 0);
    const newHistoryEntry: ExpenseHistoryEntry = { 
      id: Date.now().toString(), 
      date: new Date().toISOString(), 
      total, 
      breakdown: { ...localExpenses },
      driverName: currentDriver?.driverName ?? ''
    };
    onUpdate({ 
      ...car, 
      expenses: { ...localExpenses }, 
      monthlyRent: localRent,
      purchaseCost: localCost,
      durationYears: localDuration,
      expenseHistory: [newHistoryEntry, ...(car.expenseHistory || [])]
    });
    setLocalExpenses({
      office: 0,
      insurance: 0,
      oil: 0,
      maintenance: 0,
      installments: 0,
      other: 0
    });
    setConfirmDialog({ type: 'saveSuccess', successDate: new Date().toLocaleString() });
  };

  // Fixed the error where 'netProfit' was undefined and consolidated the redundant calculation logic
  const liveMetrics = useMemo(() => {
    const totalLocalExpenses = (Object.values(car.expenses || {}) as number[]).reduce((a, b) => a + b, 0);
    const netMonthly = car.monthlyRent - totalLocalExpenses;
    return { 
      totalMonthlyIncome: car.monthlyRent, 
      totalMonthlyExpenses: totalLocalExpenses, 
      totalMonthlyNetProfit: netMonthly, 
      yearlyProfit: netMonthly * 12, 
      totalDurationProfit: netMonthly * 12 * car.durationYears, 
      averageBreakEvenMonths: netMonthly <= 0 ? Infinity : car.purchaseCost / netMonthly
    };
  }, [car.id, car.monthlyRent, car.purchaseCost, car.durationYears, car.expenses]);

  const expenseDriverOptions = useMemo(() => {
    const fromExpenses = (car.expenseHistory || []).map(e => e.driverName).filter(Boolean) as string[];
    const fromDrivers = (car.driverHistory || []).map(h => h.driverName);
    const set = new Set([...fromExpenses, ...fromDrivers]);
    return Array.from(set).sort();
  }, [car.expenseHistory, car.driverHistory]);

  const filteredExpenseHistory = useMemo(() => {
    let list = (car.expenseHistory || []).slice().reverse();
    if (expenseFilterDriver) {
      list = list.filter(e => (e.driverName ?? '') === expenseFilterDriver);
    }
    if (expenseFilterFrom) {
      const from = new Date(expenseFilterFrom).getTime();
      list = list.filter(e => new Date(e.date).getTime() >= from);
    }
    if (expenseFilterTo) {
      const to = new Date(expenseFilterTo);
      to.setHours(23, 59, 59, 999);
      const toTime = to.getTime();
      list = list.filter(e => new Date(e.date).getTime() <= toTime);
    }
    return list;
  }, [car.expenseHistory, expenseFilterDriver, expenseFilterFrom, expenseFilterTo]);

  const handleUpdateFinancialField = (field: string, value: number) => {
    if (field === 'rent') {
      onUpdate({ ...car, monthlyRent: Math.max(0, value) });
    } else if (field === 'yearly') {
      const totalExpenses = (Object.values(car.expenses) as number[]).reduce((a, b) => a + b, 0);
      const netMonthly = value / 12;
      const monthlyRent = Math.max(0, netMonthly + totalExpenses);
      onUpdate({ ...car, monthlyRent });
    }
  };

  const exportCSV = (data: any[], fileName: string) => {
    const header = Object.keys(data[0]).join(',');
    const rows = data.map(obj => Object.values(obj).join(',')).join('\n');
    const csvContent = "data:text/csv;charset=utf-8," + header + "\n" + rows;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${fileName}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportSummary = () => {
    const data = [{
      Model: car.model,
      PurchaseCost: car.purchaseCost,
      MonthlyRent: car.monthlyRent,
      NetProfit: liveMetrics.totalMonthlyNetProfit,
      YearlyProfit: liveMetrics.yearlyProfit,
      TotalDurationProfit: liveMetrics.totalDurationProfit
    }];
    exportCSV(data, `${car.model}_Summary`);
  };

  const handleExportHistory = () => {
    const data = car.driverHistory.map(h => ({
      Driver: h.driverName,
      StartDate: h.startDate,
      EndDate: h.endDate || 'Active'
    }));
    exportCSV(data, `${car.model}_Driver_History`);
  };

  const handleExportExpensesExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Fleetflow';
    const sheet = workbook.addWorksheet(t.expenseHistory, {
      properties: { tabColor: { argb: 'FF10B981' } }
    });
    [18, 14, 16, 18, 14, 12, 18, 14].forEach((w, i) => { sheet.getColumn(i + 1).width = w; });

    const headers = [t.driver, t.date, t.insurance, t.office, t.maintenance, t.oil, t.other, `${t.total} (${t.currency})`];
    const headerRow = sheet.addRow(headers);
    headerRow.font = { bold: true, size: 11 };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2E8F0' }
    };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.eachCell(c => {
      c.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    filteredExpenseHistory.forEach(e => {
      const dateStr = new Date(e.date).toLocaleDateString();
      const totalStr = `${e.total} ${t.currency}`;
      const row = sheet.addRow([
        e.driverName ?? '—',
        dateStr,
        e.breakdown.insurance ?? 0,
        e.breakdown.office ?? 0,
        e.breakdown.maintenance ?? 0,
        e.breakdown.oil ?? 0,
        e.breakdown.other ?? 0,
        totalStr
      ]);
      row.alignment = { vertical: 'middle' };
      row.getCell(1).alignment = { horizontal: 'left' };
      row.getCell(2).alignment = { horizontal: 'left' };
      row.getCell(8).font = { bold: true, color: { argb: 'FF059669' } };
      row.eachCell(c => {
        c.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${car.model.replace(/\s+/g, '_')}_Expense_History.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 pb-16 max-w-7xl mx-auto">
      {/* Custom confirmation dialogs for expense actions */}
      {confirmDialog?.type === 'saveExpenses' && (
        <ConfirmDialog
          open={true}
          title={t.confirmSaveExpensesTitle}
          message={t.confirmSaveExpenses}
          confirmLabel={t.saveExpenses}
          cancelLabel={t.cancel}
          onConfirm={doSaveAllFinancials}
          onCancel={() => setConfirmDialog(null)}
          isRtl={isRtl}
        />
      )}
      {confirmDialog?.type === 'clearPayments' && (
        <ConfirmDialog
          open={true}
          title={t.confirmClearInstallmentsTitle}
          message={t.confirmClearInstallments}
          confirmLabel={t.clear}
          cancelLabel={t.cancel}
          onConfirm={doClearPayments}
          onCancel={() => setConfirmDialog(null)}
          isRtl={isRtl}
        />
      )}
      {confirmDialog?.type === 'saveSuccess' && (
        <ConfirmDialog
          open={true}
          title={t.saveSuccessTitle}
          message={`${t.saveSuccess} ${confirmDialog.successDate ?? ''}`}
          confirmLabel={t.close}
          onConfirm={() => setConfirmDialog(null)}
          onCancel={() => setConfirmDialog(null)}
          variant="success"
          isRtl={isRtl}
        />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="w-10 h-10 flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors">
            <svg className={`w-5 h-5 ${isRtl ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">{car.model}</h1>
        </div>
        <div className="flex items-center gap-3" ref={settingsRef}>
          <div className="flex border-b border-slate-200">
            <button onClick={() => setActiveTab('dashboard')} className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === 'dashboard' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{t.dashboardTab}</button>
            <button onClick={() => setActiveTab('reports')} className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === 'reports' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{t.reportsTab}</button>
          </div>
          <button onClick={() => setShowSettingsMenu(!showSettingsMenu)} className="w-10 h-10 flex items-center justify-center text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
          </button>
          {showSettingsMenu && (
            <div className={`absolute top-full mt-2 ${isRtl ? 'left-0' : 'right-0'} w-56 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-[100]`}>
              <button onClick={() => { setShowHandoverModal(true); setShowSettingsMenu(false); }} className="w-full px-4 py-2.5 text-sm font-medium text-slate-700 text-left rtl:text-right hover:bg-slate-50">
                {t.handoverVehicle}
              </button>
              <button onClick={() => { setShowUnitConfigModal(true); setShowSettingsMenu(false); }} className="w-full px-4 py-2.5 text-sm font-medium text-slate-700 text-left rtl:text-right hover:bg-slate-50">
                {t.unitConfig}
              </button>
            </div>
          )}
        </div>
      </div>

      {activeTab === 'dashboard' ? (
        <div className="space-y-6">
          {/* Monthly Rent – separate control (updated annually) */}
          <div className={`flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-lg shadow-sm max-w-sm ${isRtl ? 'flex-row-reverse' : ''}`}>
            <div className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{t.monthlyRent}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{t.monthlyRentHint}</p>
              <div className="flex items-baseline gap-2 mt-1">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={car.monthlyRent}
                  onChange={(e) => { const val = parseFloat(e.target.value); handleUpdateFinancialField('rent', isNaN(val) ? 0 : val); }}
                  onKeyDown={(e) => { if (!/^\d$/.test(e.key) && !['Backspace','Tab','Delete','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key) && e.key !== '.' && e.key !== ',') e.preventDefault(); }}
                  className="w-28 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-lg font-semibold text-slate-800 tabular-nums focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
                <span className="text-xs font-medium text-slate-500">{t.currency}</span>
              </div>
            </div>
          </div>

          <FinancialStats metrics={liveMetrics} isIndividual={true} lang={lang} onUpdateField={handleUpdateFinancialField} />

          {/* Current driver & installments */}
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="relative flex-shrink-0">
                  <div className="w-20 h-20 rounded-lg border border-slate-200 overflow-hidden bg-slate-100">
                    <img src={car.image} className="w-full h-full object-cover" alt={car.model} />
                  </div>
                  <button onClick={() => setIsAiEditing(!isAiEditing)} className="absolute -bottom-1 -right-1 w-7 h-7 bg-slate-700 text-white rounded border-2 border-white flex items-center justify-center hover:bg-slate-800">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  </button>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{t.currentDriver}</p>
                  <p className="text-lg font-semibold text-slate-900 mt-0.5">{currentDriver?.driverName ?? t.unassignedDriver}</p>
                  {currentDriver?.startDate && <p className="text-sm text-slate-500 mt-0.5">{t.startDate}: {currentDriver.startDate}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowHandoverModal(true)} className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">
                  {t.handoverVehicle}
                </button>
                <button onClick={() => setShowUnitConfigModal(true)} className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">
                  {t.unitConfig}
                </button>
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-200">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">{t.paymentCycle}</p>
              <div className="flex flex-wrap gap-3">
                {[1, 10, 20].map((day, idx) => {
                  const isPaid = car.paymentsPaid[idx];
                  return (
                    <button
                      key={day}
                      onClick={() => setShowInstallmentModal(true)}
                      className={`inline-flex items-center gap-3 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${isPaid ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                      <span>{t.installment} {idx + 1}</span>
                      <span className="text-slate-400">({t.dayLabel} {day})</span>
                      <span className="tabular-nums font-semibold">{(car.monthlyRent/3).toFixed(0)} {t.currency}</span>
                      {isPaid && <span className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center"><svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg></span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* History Log */}
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-slate-900">{t.historyLog}</h2>
              <button onClick={() => setShowHandoverModal(true)} className="text-sm font-medium text-slate-600 hover:text-slate-900">
                + {t.handoverVehicle}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left rtl:text-right text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-6 font-semibold text-slate-600 uppercase tracking-wider">{t.driver}</th>
                    <th className="py-3 px-6 font-semibold text-slate-600 uppercase tracking-wider">{t.startDate}</th>
                    <th className="py-3 px-6 font-semibold text-slate-600 uppercase tracking-wider">{t.endDate}</th>
                    <th className="py-3 px-6 text-right font-semibold text-slate-600 uppercase tracking-wider w-24">{t.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {car.driverHistory.slice().reverse().map(h => (
                    <tr key={h.id} className="hover:bg-slate-50">
                      <td className="py-4 px-6 font-medium text-slate-900">{h.driverName}</td>
                      <td className="py-4 px-6 text-slate-600 tabular-nums">{h.startDate}</td>
                      <td className="py-4 px-6 text-slate-600 tabular-nums">{h.endDate || '—'}</td>
                      <td className="py-4 px-6 text-right">
                        <button onClick={() => setEditingHistoryEntry(h)} className="text-blue-600 hover:text-blue-800 font-medium text-sm">
                          {t.updateEntry}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Expense Inputs: button opens dialog */}
          <div className="flex justify-center sm:justify-start">
            <button
              type="button"
              onClick={() => setShowExpenseDialog(true)}
              className="inline-flex items-center justify-center gap-3 px-6 py-4 bg-white border-2 border-slate-200 rounded-lg shadow-sm hover:border-slate-300 hover:bg-slate-50 transition-colors w-full sm:w-auto min-h-[80px]"
            >
              <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div className="text-left rtl:text-right">
                <span className="block text-base font-semibold text-slate-900">{t.expenseInputs}</span>
                <span className="block text-sm text-slate-500">{t.saveExpenses}</span>
              </div>
            </button>
          </div>

          {/* Expense dialog */}
          {showExpenseDialog && (
            <div className="fixed inset-0 z-[200] bg-slate-900/60 flex items-center justify-center p-4 overflow-y-auto" dir={isRtl ? 'rtl' : 'ltr'}>
              <div className="bg-white rounded-lg w-full max-w-lg shadow-xl border border-slate-200 my-8">
                <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200">
                  <h2 className="text-lg font-semibold text-slate-900">{t.expenseInputs}</h2>
                  <button type="button" onClick={() => setShowExpenseDialog(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg" aria-label={t.close}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                    {[
                      { field: 'insurance', label: t.insurance },
                      { field: 'office', label: t.office },
                      { field: 'maintenance', label: t.maintenance },
                      { field: 'oil', label: t.oil },
                      { field: 'other', label: t.other }
                    ].map(({ field, label }) => (
                      <div key={field}>
                        <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">{label}</label>
                        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-2.5 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
                          <input
                            type="number"
                            name={field}
                            value={localExpenses[field as keyof CarExpenses] ?? ''}
                            placeholder="0"
                            onChange={(e) => setLocalExpenses(prev => ({ ...prev, [field]: parseFloat(e.target.value) || 0 }))}
                            className="w-full bg-transparent border-none p-0 text-lg font-semibold text-slate-800 tabular-nums focus:ring-0 outline-none"
                          />
                          <span className="text-xs font-medium text-slate-500">{t.currency}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className={`flex gap-3 ${isRtl ? 'flex-row-reverse' : ''}`}>
                    <button type="button" onClick={() => setShowExpenseDialog(false)} className="flex-1 py-2.5 px-4 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">
                      {t.cancel}
                    </button>
                    <button
                      type="button"
                      onClick={() => { requestSaveExpenses(); setShowExpenseDialog(false); }}
                      className="flex-1 py-2.5 px-4 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 border border-slate-700"
                    >
                      {t.saveExpenses}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Expense History */}
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <h2 className="text-lg font-semibold text-slate-900">{t.expenseHistory}</h2>
              <button
                type="button"
                onClick={handleExportExpensesExcel}
                disabled={!car.expenseHistory?.length}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed border border-slate-700"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                {t.exportExpensesExcel}
              </button>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-slate-500 whitespace-nowrap">{t.filterByDriver}</label>
                <select
                  value={expenseFilterDriver}
                  onChange={(e) => setExpenseFilterDriver(e.target.value)}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white min-w-[140px]"
                >
                  <option value="">{t.allDrivers}</option>
                  {expenseDriverOptions.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-slate-500 whitespace-nowrap">{t.fromDate}</label>
                <input
                  type="date"
                  value={expenseFilterFrom}
                  onChange={(e) => setExpenseFilterFrom(e.target.value)}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-slate-500 whitespace-nowrap">{t.toDate}</label>
                <input
                  type="date"
                  value={expenseFilterTo}
                  onChange={(e) => setExpenseFilterTo(e.target.value)}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                />
              </div>
              <button
                type="button"
                onClick={() => { setExpenseFilterDriver(''); setExpenseFilterFrom(''); setExpenseFilterTo(''); }}
                className="text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                {t.resetFilter}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left rtl:text-right text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-6 font-semibold text-slate-600 uppercase tracking-wider">{t.driver}</th>
                    <th className="py-3 px-6 font-semibold text-slate-600 uppercase tracking-wider">{t.date}</th>
                    <th className="py-3 px-6 font-semibold text-slate-600 uppercase tracking-wider text-center">{t.insurance}</th>
                    <th className="py-3 px-6 font-semibold text-slate-600 uppercase tracking-wider text-center">{t.office}</th>
                    <th className="py-3 px-6 font-semibold text-slate-600 uppercase tracking-wider text-center">{t.maintenance}</th>
                    <th className="py-3 px-6 font-semibold text-slate-600 uppercase tracking-wider text-center">{t.oil}</th>
                    <th className="py-3 px-6 font-semibold text-slate-600 uppercase tracking-wider text-center">{t.other}</th>
                    <th className="py-3 px-6 font-semibold text-slate-600 uppercase tracking-wider text-right">{t.total}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredExpenseHistory.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 px-6 text-center text-slate-500">{t.noHistory}</td>
                    </tr>
                  ) : (
                    filteredExpenseHistory.map(e => (
                      <tr key={e.id} className="hover:bg-slate-50">
                        <td className="py-4 px-6 font-medium text-slate-900">{e.driverName ?? '—'}</td>
                        <td className="py-4 px-6 font-medium text-slate-800 tabular-nums">{new Date(e.date).toLocaleDateString()}</td>
                        <td className="py-4 px-6 text-center text-slate-600 tabular-nums">{e.breakdown.insurance || 0}</td>
                        <td className="py-4 px-6 text-center text-slate-600 tabular-nums">{e.breakdown.office || 0}</td>
                        <td className="py-4 px-6 text-center text-slate-600 tabular-nums">{e.breakdown.maintenance || 0}</td>
                        <td className="py-4 px-6 text-center text-slate-600 tabular-nums">{e.breakdown.oil || 0}</td>
                        <td className="py-4 px-6 text-center text-slate-600 tabular-nums">{e.breakdown.other || 0}</td>
                        <td className="py-4 px-6 text-right font-semibold text-slate-900 tabular-nums">{e.total} {t.currency}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6 pb-8">
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden max-w-4xl mx-auto">
            <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">{car.model}</h2>
                <p className="text-sm text-slate-500 mt-0.5">{t.financialSummary}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={handleExportSummary} className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 border border-slate-700">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                  Export Summary
                </button>
                <button onClick={handleExportHistory} className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                  Export History
                </button>
                <button onClick={() => window.print()} className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">
                  {t.printReport}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-6 p-6">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-6">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">{t.purchasePrice}</p>
                <p className="text-2xl font-semibold text-slate-900 tabular-nums">{car.purchaseCost.toLocaleString()} {t.currency}</p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-6">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">{t.lifetimePerformance}</p>
                <p className="text-2xl font-semibold text-slate-900 tabular-nums">{liveMetrics.totalDurationProfit.toLocaleString()} {t.currency}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Installment Modal */}
      {showInstallmentModal && (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-md shadow-xl border border-slate-200">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">{t.paymentCycle}</h3>
              <button onClick={() => setShowInstallmentModal(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg></button>
            </div>
            <div className="p-6 space-y-3">
              {[1, 10, 20].map((day, idx) => (
                <div key={day} className="flex items-center justify-between py-3 px-4 bg-slate-50 rounded-lg border border-slate-200">
                  <div>
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{t.installment} {idx + 1}</span>
                    <span className="text-slate-400 ml-1">({t.dayLabel} {day})</span>
                    <p className="text-base font-semibold text-slate-900 mt-0.5">{(car.monthlyRent/3).toFixed(0)} {t.currency}</p>
                  </div>
                  <button
                    onClick={() => handlePaymentToggle(idx)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${car.paymentsPaid[idx] ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    {car.paymentsPaid[idx] ? 'Paid' : 'Unpaid'}
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50/50">
              <button onClick={handleClearPayments} className="flex-1 py-2.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-100">{t.clear}</button>
              <button onClick={() => setShowInstallmentModal(false)} className="flex-1 py-2.5 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 border border-slate-700">{t.close}</button>
            </div>
          </div>
        </div>
      )}

      {showUnitConfigModal && (
        <UnitConfigModal
          car={car}
          lang={lang}
          onClose={() => setShowUnitConfigModal(false)}
          onSave={(fields) => {
            const updated: Car = {
              ...car,
              monthlyRent: fields.monthlyRent !== undefined ? Number(fields.monthlyRent) : car.monthlyRent,
              purchaseCost: fields.purchaseCost !== undefined ? Number(fields.purchaseCost) : car.purchaseCost,
              durationYears: fields.durationYears !== undefined ? Number(fields.durationYears) : car.durationYears
            };
            onUpdate(updated);
            setShowUnitConfigModal(false);
          }}
        />
      )}
      {showHandoverModal && <HandoverModal lang={lang} onClose={() => setShowHandoverModal(false)} onSave={handleHandoverSubmit} currentDriverStartDate={currentDriver?.startDate} />}
      {editingHistoryEntry && <EditHistoryModal lang={lang} entry={editingHistoryEntry} onClose={() => setEditingHistoryEntry(null)} onSave={handleEditHistorySave} />}
    </div>
  );
};

export default CarDashboard;