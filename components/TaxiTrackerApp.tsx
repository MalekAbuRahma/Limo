import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import ProfileMenu from './ProfileMenu';
import type { UiLanguage } from './TaxiLogin';
import type { UserSession } from '../utils/taxiAuth';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts';
import {
  AccidentRecord,
  LicenseRecord,
  MonthlyEntry,
  OilChangeRecord,
  TaxiAppState,
  TaxiSettings,
  DEFAULT_SETTINGS,
  EMPTY_EXPENSES,
  EXPENSE_FIELD_LABELS,
  VISIBLE_EXPENSE_KEYS,
  REPORT_EXPENSE_KEYS,
  ExpenseBreakdown,
  FontSizeOption,
  DisplayThemeOption,
  FONT_SIZE_LABELS,
  DISPLAY_THEME_LABELS,
} from '../taxiTypes';
import { emptyAppState } from '../utils/taxiPersistence';
import {
  loadFleet,
  loadVehicleState,
  scheduleSaveVehicleState,
  flushSaveVehicleState,
  createVehicle,
  removeVehicle,
  updateFleetIndexVehicleMeta,
  type StorageSource,
} from '../utils/taxiFleetPersistence';
import VehicleGarage from './VehicleGarage';
import OilChangeDialog from './OilChangeDialog';
import OilMaintenanceTab from './OilMaintenanceTab';
import type { FleetData, FleetGlobalSettings } from '../taxiTypes';
import { getOilChangeAlert, sortOilChangesNewestFirst } from '../utils/taxiOilChange';
import { exportTaxiToExcel, exportTaxiToPdf } from '../utils/taxiExport';
import {
  exportBackupJson,
  parseBackupJson,
  getBackupStatus,
  BACKUP_INTERVAL_DAYS,
  BackupStatus,
} from '../utils/taxiBackup';
import {
  computeAccidentSummary,
  computeClaimBreakdown,
  mergeAccidentsIntoDashboard,
  type AccidentSummary,
} from '../utils/taxiAccidents';
import {
  computeLicenseSummary,
  formatRenewalLabel,
  getLicenseRenewalDueDate,
  getLicenseRenewalInfo,
  mergeLicensesIntoDashboard,
  type LicenseRenewalInfo,
  type LicenseSummary,
} from '../utils/taxiLicenses';
import { formatNumber, formatInteger } from '../utils/taxiFormat';
import { fileToVehicleImageDataUrl } from '../utils/vehicleImage';
import {
  TRACKING_PAGE_SIZE,
  EMPTY_ENTRY_FILTERS,
  EntryFilters,
  filterEntries,
  paginateEntries,
  findEntryPage,
  getUniqueDriverNames,
} from '../utils/taxiEntryFilters';
import {
  computeDashboard,
  computeEntry,
  computeRoiAnalysis,
  formatMonthLabel,
  formatMonthNumber,
  monthKey,
  sumExpenses,
  normalizeExpenseDetails,
  EntryComputed,
  DashboardTotals,
  RoiAnalysis,
} from '../utils/taxiCalculations';

type Tab = 'tracking' | 'dashboard' | 'insurance' | 'licenses' | 'oil' | 'settings';

const emptyForm = (defaultAmount = 750): Omit<MonthlyEntry, 'id'> => ({
  date: new Date().toISOString().slice(0, 7) + '-01',
  month: '',
  driverName: '',
  revenue: defaultAmount,
  expenses: 0,
  expenseDetails: { ...EMPTY_EXPENSES },
  notes: '',
  driverPaid: defaultAmount,
});

const fmt = formatNumber;
const fmtInt = formatInteger;

const VehicleHeaderBrand: React.FC<{
  vehicleLabel: string;
  vehicleImage?: string;
  onImageChange: (image: string | undefined) => void;
}> = ({ vehicleLabel, vehicleImage, onImageChange }) => {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await fileToVehicleImageDataUrl(file);
      onImageChange(dataUrl);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'تعذّر رفع الصورة');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="vehicle-header-brand flex items-center gap-3 min-w-0">
      <div className="vehicle-header-photo-wrap shrink-0">
        <button
          type="button"
          className="vehicle-header-photo-btn"
          onClick={() => fileRef.current?.click()}
          title="رفع صورة السيارة"
          aria-label="رفع أو تغيير صورة السيارة"
        >
          {vehicleImage ? (
            <img src={vehicleImage} alt="" className="vehicle-header-photo" />
          ) : (
            <span className="vehicle-header-photo-placeholder" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M5 17h14l-1.5-5.5a2 2 0 00-1.9-1.4H8.4a2 2 0 00-1.9 1.4L5 17z" />
                <circle cx="7.5" cy="17.5" r="1.5" />
                <circle cx="16.5" cy="17.5" r="1.5" />
                <path d="M5 11h14M8 6h8l1 3" />
              </svg>
            </span>
          )}
        </button>
        {vehicleImage && (
          <button
            type="button"
            className="vehicle-header-photo-remove"
            onClick={() => onImageChange(undefined)}
            aria-label="إزالة الصورة"
            title="إزالة الصورة"
          >
            ×
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      <h1 className="text-xl font-bold text-slate-900 truncate">{vehicleLabel || 'متابعة سيارة أجرة'}</h1>
    </div>
  );
};

const TabNavIcon: React.FC<{ tab: Tab; className?: string }> = ({
  tab,
  className = 'app-nav-tab-icon',
}) => {
  const props = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (tab) {
    case 'tracking':
      return (
        <svg {...props}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      );
    case 'dashboard':
      return (
        <svg {...props}>
          <path d="M4 19V9M10 19V5M16 19v-6M22 19V3" />
        </svg>
      );
    case 'insurance':
      return (
        <svg {...props}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case 'licenses':
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M7 9h4M7 13h10M7 17h6" />
        </svg>
      );
    case 'oil':
      return (
        <svg {...props}>
          <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
        </svg>
      );
    default:
      return null;
  }
};

interface TaxiTrackerAppProps {
  session: UserSession;
  lang: UiLanguage;
  setLang: (lang: UiLanguage) => void;
  onLogout: () => void;
}

const TaxiTrackerApp: React.FC<TaxiTrackerAppProps> = ({
  session,
  lang,
  setLang,
  onLogout,
}) => {
  const [fleet, setFleet] = useState<FleetData | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [state, setState] = useState<TaxiAppState>(emptyAppState);
  const [storageSource, setStorageSource] = useState<StorageSource>('local');
  const [isLoading, setIsLoading] = useState(true);
  const [vehicleLoading, setVehicleLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('tracking');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [successMessage, setSuccessMessage] = useState('تم الحفظ بنجاح و اضافة المبلغ');
  const [isExporting, setIsExporting] = useState(false);
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);
  const [showDisplayPanel, setShowDisplayPanel] = useState(false);
  const [oilDialogOpen, setOilDialogOpen] = useState(false);
  const [standaloneOilEdit, setStandaloneOilEdit] = useState<OilChangeRecord | 'new' | null>(
    null
  );

  const refreshFleet = useCallback(async () => {
    const { fleet: loaded, source } = await loadFleet();
    setFleet(loaded);
    setStorageSource(source);
    return loaded;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void refreshFleet()
      .then(() => {
        if (cancelled) return;
        setLoadError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError('تعذّر تحميل الأسطول');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshFleet]);

  useEffect(() => {
    if (!selectedVehicleId) return;
    let cancelled = false;
    setVehicleLoading(true);
    void loadVehicleState(selectedVehicleId)
      .then(({ state: loaded, source }) => {
        if (cancelled) return;
        setState(loaded);
        setStorageSource(source);
        setTab('tracking');
      })
      .catch(() => {
        if (cancelled) return;
        alert('تعذّر تحميل بيانات السيارة');
        setSelectedVehicleId(null);
      })
      .finally(() => {
        if (!cancelled) setVehicleLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedVehicleId]);

  useEffect(() => {
    if (isLoading || vehicleLoading || !selectedVehicleId) return;
    scheduleSaveVehicleState(selectedVehicleId, state, setStorageSource);
    updateFleetIndexVehicleMeta(
      selectedVehicleId,
      state.settings.vehicleLabel,
      state.settings.vehicleImage ?? ''
    );
  }, [state, isLoading, vehicleLoading, selectedVehicleId]);

  const backupInputRef = useRef<HTMLInputElement>(null);
  const [backupBannerDismissed, setBackupBannerDismissed] = useState(false);
  const [backupTick, setBackupTick] = useState(0);

  const backupStatus = useMemo(
    () => getBackupStatus(),
    [backupTick, state.entries.length]
  );

  useEffect(() => {
    const id = window.setInterval(() => setBackupTick((t) => t + 1), 60 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  const { settings, entries, accidents, licenses, oilChanges } = state;
  const oilChangeAlert = useMemo(() => getOilChangeAlert(oilChanges), [oilChanges]);
  const guarantee = settings.monthlyGuarantee;

  const computedEntries = useMemo(() => {
    return [...entries]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .map((e) => computeEntry(e, guarantee, oilChanges));
  }, [entries, guarantee, oilChanges]);

  const baseTotals = useMemo(
    () => computeDashboard(entries, guarantee, oilChanges),
    [entries, guarantee, oilChanges]
  );

  const accidentSummary = useMemo(
    () => computeAccidentSummary(baseTotals.netProfit, accidents, guarantee),
    [baseTotals.netProfit, accidents, guarantee]
  );

  const licenseSummary = useMemo(() => computeLicenseSummary(licenses), [licenses]);

  const totals = useMemo(() => {
    const withAccidents = mergeAccidentsIntoDashboard(baseTotals, accidentSummary);
    return mergeLicensesIntoDashboard(withAccidents, licenseSummary);
  }, [baseTotals, accidentSummary, licenseSummary]);

  const chartDataFull = useMemo(
    () =>
      [...computedEntries]
        .reverse()
        .map((e) => ({
          name: e.month || formatMonthLabel(e.date),
          الإيراد: e.revenue,
          المصاريف: e.expenses,
        })),
    [computedEntries]
  );

  const chartData = useMemo(
    () => (chartDataFull.length > 24 ? chartDataFull.slice(-24) : chartDataFull),
    [chartDataFull]
  );

  const chartCaption =
    chartDataFull.length > 24
      ? `عرض آخر ${fmtInt(24)} شهراً من ${fmtInt(chartDataFull.length)}`
      : undefined;


  const roi = useMemo(
    () =>
      computeRoiAnalysis(
        computedEntries,
        settings.vehicleCost,
        settings.vehicleLifeYears
      ),
    [computedEntries, settings.vehicleCost, settings.vehicleLifeYears]
  );

  const persist = (next: TaxiAppState | ((prev: TaxiAppState) => TaxiAppState)) => {
    setState(next);
  };

  const persistImmediate = (
    updater: (prev: TaxiAppState) => TaxiAppState
  ) => {
    if (!selectedVehicleId) return;
    setState((prev) => {
      const next = updater(prev);
      void flushSaveVehicleState(selectedVehicleId, next).then(setStorageSource);
      return next;
    });
  };

  const handleBackToGarage = async () => {
    if (selectedVehicleId) {
      await flushSaveVehicleState(selectedVehicleId, state);
    }
    setSelectedVehicleId(null);
    void refreshFleet().then(setFleet);
  };

  const handleAddVehicle = async (label: string, vehicleImage: string) => {
    const id = await createVehicle(label, vehicleImage);
    const updated = await refreshFleet();
    setFleet(updated);
    setSelectedVehicleId(id);
  };

  const handleDeleteVehicle = async (vehicleId: string): Promise<boolean> => {
    const ok = await removeVehicle(vehicleId);
    if (!ok) {
      alert('تعذّر الحذف — يجب بقاء سيارة واحدة على الأقل');
      return false;
    }
    const updated = await refreshFleet();
    setFleet(updated);
    return true;
  };

  const globalSettings: FleetGlobalSettings =
    fleet?.globalSettings ?? {
      fontSize: settings.fontSize,
      displayTheme: settings.displayTheme,
      boldNumbers: settings.boldNumbers,
      largeButtons: settings.largeButtons,
      comfortableReading: settings.comfortableReading,
    };

  const handleExportBackup = () => {
    exportBackupJson(state, settings.vehicleLabel || 'taxi');
    setBackupBannerDismissed(true);
    setBackupTick((t) => t + 1);
  };

  const showBackupReminder =
    entries.length > 0 && backupStatus.isOverdue && !backupBannerDismissed;

  const handleImportBackup = async (file: File) => {
    try {
      const text = await file.text();
      const imported = parseBackupJson(text);
      const msg =
        entries.length > 0
          ? `سيتم استبدال ${entries.length} سجل/سجلات الحالية بالنسخة الاحتياطية (${imported.entries.length} شهر).\n\nمتابعة؟`
          : `استيراد ${imported.entries.length} سجل/سجلات من النسخة الاحتياطية.\n\nمتابعة؟`;
      if (!window.confirm(msg)) return;
      persist({
        settings: { ...settings, ...imported.settings },
        entries: imported.entries,
        accidents: imported.accidents ?? [],
        licenses: imported.licenses ?? [],
      });
      setEditingId(null);
      setShowForm(false);
      alert('تم استيراد النسخة الاحتياطية بنجاح');
      setBackupTick((t) => t + 1);
    } catch {
      alert('فشل استيراد الملف — تأكد أنه ملف JSON صادر من هذا التطبيق');
    }
  };

  const executeClearAllEntries = () => {
    persist({ ...state, entries: [] });
    setEditingId(null);
    setShowForm(false);
    setShowDeleteAllDialog(false);
    setSuccessMessage('تم حذف كل السجلات الشهرية');
    setShowSuccessDialog(true);
  };

  const openAdd = () => {
    const today = new Date().toISOString().slice(0, 10);
    setEditingId(null);
    setForm({
      ...emptyForm(guarantee),
      date: today.slice(0, 7) + '-01',
      driverName: settings.currentDriverName,
      month: formatMonthLabel(today),
    });
    setShowForm(true);
  };

  const openEdit = (entry: MonthlyEntry) => {
    setEditingId(entry.id);
    const computed = computeEntry(entry, guarantee, oilChanges);
    const formDetails = {
      ...normalizeExpenseDetails(entry.expenseDetails, entry.expenses),
      oil: 0,
    };
    setForm({
      date: entry.date,
      month: computed.month,
      driverName: entry.driverName,
      revenue: entry.revenue,
      expenseDetails: formDetails,
      expenses: sumExpenses(formDetails),
      notes: entry.notes ?? '',
      driverPaid: entry.driverPaid,
    });
    setShowForm(true);
  };

  const handleMonthPickerChange = (ym: string) => {
    if (!ym) return;
    const date = `${ym}-01`;
    setForm((f) => ({ ...f, date, month: formatMonthLabel(date) }));
  };

  const finishEntrySave = (
    entry: MonthlyEntry,
    nextEntries: MonthlyEntry[],
    wasEdit: boolean
  ) => {
    persist({ ...state, entries: nextEntries });
    setShowForm(false);
    setEditingId(null);
    setSuccessMessage(
      wasEdit ? 'تم حفظ التعديلات بنجاح' : 'تم الحفظ بنجاح و اضافة المبلغ'
    );
    setShowSuccessDialog(true);
  };

  const handleSaveEntry = (e: React.FormEvent) => {
    e.preventDefault();
    const expenseDetails = {
      ...normalizeExpenseDetails(form.expenseDetails, form.expenses),
      oil: 0,
    };
    const expenses = sumExpenses(expenseDetails);
    const existing = editingId ? entries.find((x) => x.id === editingId) : undefined;
    const entry: MonthlyEntry = {
      id: editingId ?? Date.now().toString(),
      ...form,
      expenseDetails,
      expenses,
      month: formatMonthLabel(form.date),
      driverName: form.driverName.trim() || settings.currentDriverName || '—',
      monthlyGuarantee: existing?.monthlyGuarantee ?? guarantee,
    };

    const duplicate = entries.some(
      (x) => x.id !== editingId && monthKey(x.date) === monthKey(entry.date)
    );
    if (duplicate) {
      alert('يوجد سجل لهذا الشهر مسبقاً. عدّل السجل الحالي أو اختر شهراً آخر.');
      return;
    }

    const nextEntries = editingId
      ? entries.map((x) => (x.id === editingId ? entry : x))
      : [...entries, entry];

    const wasEdit = Boolean(editingId);
    finishEntrySave(entry, nextEntries, wasEdit);
  };

  const closeOilDialog = () => {
    setOilDialogOpen(false);
    setStandaloneOilEdit(null);
  };

  const handleOilDialogSave = (record: OilChangeRecord) => {
    let toSave = { ...record };
    if (!toSave.entryId) {
      const mk = monthKey(toSave.changeDate);
      const match = entries.find((e) => monthKey(e.date) === mk);
      if (match) toSave = { ...toSave, entryId: match.id };
    }

    const nextOil = [...oilChanges.filter((o) => o.id !== toSave.id), toSave];
    persist({ ...state, oilChanges: nextOil });
    closeOilDialog();
  };

  const handleOilDialogCancel = () => {
    closeOilDialog();
  };

  const openStandaloneOilDialog = (record?: OilChangeRecord) => {
    setStandaloneOilEdit(record ?? 'new');
    setOilDialogOpen(true);
  };

  const handleDeleteOilRecord = (id: string) => {
    persist({ ...state, oilChanges: oilChanges.filter((o) => o.id !== id) });
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      await exportTaxiToExcel(computedEntries, settings, totals, roi);
    } catch {
      alert('فشل تصدير Excel');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPdf = () => {
    try {
      exportTaxiToPdf(computedEntries, settings, totals, roi);
    } catch {
      alert('فشل تصدير PDF');
    }
  };

  const handleDelete = (id: string) => {
    if (!confirm('حذف هذا السجل؟')) return;
    persist({
      ...state,
      entries: entries.filter((x) => x.id !== id),
      oilChanges: oilChanges.filter((o) => o.entryId !== id),
    });
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'tracking', label: 'المتابعة الشهرية' },
    { id: 'dashboard', label: 'الملخص' },
    { id: 'oil', label: 'متابعة الزيت' },
    { id: 'insurance', label: 'التأمين والحوادث' },
    { id: 'licenses', label: 'الترخيص السنوي' },
  ];

  const openSettings = () => setTab('settings');

  if (isLoading) {
    return (
      <div
        id="taxi-app"
        className="min-h-screen bg-slate-100 flex items-center justify-center"
        dir="rtl"
      >
        <div className="text-center p-8">
          <p className="text-slate-600 text-lg">جاري تحميل البيانات...</p>
          {loadError && <p className="text-red-600 text-sm mt-2">{loadError}</p>}
        </div>
      </div>
    );
  }

  if (!selectedVehicleId) {
    return (
      <div
        id="taxi-app"
        data-font-size={globalSettings.fontSize ?? 'normal'}
        data-theme={globalSettings.displayTheme ?? 'default'}
        data-bold-numbers={globalSettings.boldNumbers ? 'true' : 'false'}
        data-large-buttons={globalSettings.largeButtons ? 'true' : 'false'}
        data-comfortable-reading={globalSettings.comfortableReading ? 'true' : 'false'}
        className="min-h-screen bg-slate-100"
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
      >
        <header className="app-header bg-white border-b border-slate-200 sticky top-0 z-40">
          <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
            <h1 className="text-xl font-bold text-slate-900">VIP limousine CARS</h1>
            <ProfileMenu
              session={session}
              lang={lang}
              setLang={setLang}
              settings={{ ...DEFAULT_SETTINGS, ...globalSettings }}
              onSettingsChange={(s) => {
                const g: FleetGlobalSettings = {
                  fontSize: s.fontSize,
                  displayTheme: s.displayTheme,
                  boldNumbers: s.boldNumbers,
                  largeButtons: s.largeButtons,
                  comfortableReading: s.comfortableReading,
                };
                setFleet((f) => (f ? { ...f, globalSettings: g } : f));
              }}
              onOpenSettings={() => {}}
              onOpenAccessibility={() => setShowDisplayPanel(true)}
              onLogout={() => {
                if (window.confirm(lang === 'ar' ? 'تسجيل الخروج؟' : 'Sign out?')) {
                  onLogout();
                }
              }}
            />
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-4 py-6">
          <VehicleGarage
            vehicles={fleet?.vehicles ?? []}
            onSelect={setSelectedVehicleId}
            onAddVehicle={handleAddVehicle}
            onDeleteVehicle={handleDeleteVehicle}
          />
        </main>
        <DisplayAccessibilityPanel
          open={showDisplayPanel}
          onClose={() => setShowDisplayPanel(false)}
          settings={{ ...DEFAULT_SETTINGS, ...globalSettings }}
          onChange={(s) =>
            setFleet((f) =>
              f
                ? {
                    ...f,
                    globalSettings: {
                      fontSize: s.fontSize,
                      displayTheme: s.displayTheme,
                      boldNumbers: s.boldNumbers,
                      largeButtons: s.largeButtons,
                      comfortableReading: s.comfortableReading,
                    },
                  }
                : f
            )
          }
        />
      </div>
    );
  }

  if (vehicleLoading) {
    return (
      <div
        id="taxi-app"
        className="min-h-screen bg-slate-100 flex items-center justify-center"
        dir="rtl"
      >
        <p className="text-slate-600 text-lg">جاري تحميل السيارة...</p>
      </div>
    );
  }

  return (
    <div
      id="taxi-app"
      data-font-size={settings.fontSize ?? 'normal'}
      data-theme={settings.displayTheme ?? 'default'}
      data-bold-numbers={settings.boldNumbers ? 'true' : 'false'}
      data-large-buttons={settings.largeButtons ? 'true' : 'false'}
      data-comfortable-reading={settings.comfortableReading ? 'true' : 'false'}
      className="min-h-screen"
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
    >
      {showSuccessDialog && (
        <SuccessDialog message={successMessage} onClose={() => setShowSuccessDialog(false)} />
      )}
      {showDeleteAllDialog && (
        <DeleteAllConfirmDialog
          entryCount={entries.length}
          vehicleLabel={settings.vehicleLabel}
          onCancel={() => setShowDeleteAllDialog(false)}
          onConfirm={executeClearAllEntries}
        />
      )}
      {showBackupReminder && (
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-sm text-amber-900">
              <span className="font-semibold">تذكير نسخ احتياطي أسبوعي:</span>{' '}
              {backupStatus.hasBackupBefore ? (
                <>
                  آخر نسخة قبل{' '}
                  <span className="tabular-nums font-semibold">
                    {fmtInt(backupStatus.daysSinceBackup ?? 0)}
                  </span>{' '}
                  يوم — يُفضَّل كل {fmtInt(BACKUP_INTERVAL_DAYS)} أيام
                </>
              ) : (
                <>لم تُسجَّل نسخة احتياطية بعد — احفظ ملف JSON على جهازك</>
              )}
            </p>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={handleExportBackup}
                className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700"
              >
                تصدير نسخة احتياطية الآن
              </button>
              <button
                type="button"
                onClick={() => setBackupBannerDismissed(true)}
                className="px-3 py-2 text-amber-800 text-sm rounded-lg hover:bg-amber-100"
              >
                لاحقاً
              </button>
            </div>
          </div>
        </div>
      )}
      <header className="app-header bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="app-header-bar flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => void handleBackToGarage()}
                className="shrink-0 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
              >
                ← السيارات
              </button>
              <VehicleHeaderBrand
              vehicleLabel={settings.vehicleLabel}
              vehicleImage={settings.vehicleImage || undefined}
              onImageChange={(image) =>
                persist({
                  ...state,
                  settings: { ...settings, vehicleImage: image ?? '' },
                })
              }
            />
            </div>
            <div className="app-header-actions flex flex-wrap items-center gap-2 shrink-0">
              {licenseSummary.renewalAlerts.length > 0 && (
                <button
                  type="button"
                  onClick={() => setTab('licenses')}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-900 border border-amber-300 rounded-lg text-sm font-medium hover:bg-amber-100 text-right"
                  title="عرض تنبيهات تجديد الترخيص"
                >
                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                  <span>
                    تنبيه ترخيص ({fmtInt(licenseSummary.renewalAlerts.length)})
                  </span>
                </button>
              )}
              <ProfileMenu
                session={session}
                lang={lang}
                setLang={setLang}
                settings={settings}
                onSettingsChange={(s) => persist({ ...state, settings: s })}
                onOpenSettings={openSettings}
                onOpenAccessibility={() => setShowDisplayPanel(true)}
                onLogout={() => {
                  if (window.confirm(lang === 'ar' ? 'تسجيل الخروج؟' : 'Sign out?')) {
                    onLogout();
                  }
                }}
              />
            </div>
          </div>
          <nav className="flex gap-1 mt-4 border-b border-slate-200 -mb-px overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`app-nav-tab flex-shrink-0 px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.id
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <span className="app-nav-tab-label">
                  <TabNavIcon tab={t.id} />
                  <span>{t.label}</span>
                </span>
              </button>
            ))}
            {tab === 'settings' && (
              <span className="flex-shrink-0 px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 border-blue-600 text-blue-700">
                <span className="app-nav-tab-label">
                  <svg
                    className="app-nav-tab-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden
                  >
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                  </svg>
                  <span>{lang === 'ar' ? 'الإعدادات' : 'Settings'}</span>
                </span>
              </span>
            )}
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 pb-24">
        {(tab === 'tracking' || tab === 'oil') && oilChangeAlert && (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span className="font-semibold">تنبيه زيت: </span>
            {oilChangeAlert.message}
            {tab === 'tracking' && (
              <button
                type="button"
                onClick={() => setTab('oil')}
                className="mr-2 mt-2 block text-amber-800 underline text-sm font-medium"
              >
                عرض تبويب متابعة الزيت ←
              </button>
            )}
          </div>
        )}
        {tab === 'tracking' && (
          <TrackingTab
            entries={computedEntries}
            showForm={showForm}
            form={form}
            guarantee={guarantee}
            editingId={editingId}
            onOpenAdd={openAdd}
            onOpenEdit={openEdit}
            onCloseForm={() => setShowForm(false)}
            onSave={handleSaveEntry}
            onDelete={handleDelete}
            onFormChange={setForm}
            onMonthPickerChange={handleMonthPickerChange}
            onOpenOilTab={() => setTab('oil')}
            oilChanges={oilChanges}
            lateCount={totals.lateCount}
            paidCount={totals.paidCount}
            totalRemaining={totals.totalRemaining}
          />
        )}
        {tab === 'insurance' && (
          <InsuranceAccidentsTab
            accidents={accidents}
            accidentSummary={accidentSummary}
            monthlyGuarantee={guarantee}
            defaultDriver={settings.currentDriverName}
            onAccidentsChange={(next) =>
              persistImmediate((prev) => ({ ...prev, accidents: next }))
            }
          />
        )}
        {tab === 'licenses' && (
          <LicensesTab
            licenses={licenses}
            licenseSummary={licenseSummary}
            onLicensesChange={(next) =>
              persistImmediate((prev) => ({ ...prev, licenses: next }))
            }
          />
        )}
        {tab === 'oil' && (
          <OilMaintenanceTab
            oilChanges={oilChanges}
            entries={entries}
            onEditRecord={openStandaloneOilDialog}
            onAddRecord={() => openStandaloneOilDialog()}
            onDeleteRecord={handleDeleteOilRecord}
          />
        )}
        {tab === 'settings' && (
          <SettingsTab
            settings={settings}
            entryCount={entries.length}
            onOpenOilTab={() => setTab('oil')}
            onChange={(s) => persist({ ...state, settings: s })}
            onExportBackup={handleExportBackup}
            onImportBackup={handleImportBackup}
            backupInputRef={backupInputRef}
            backupStatus={backupStatus}
            storageSource={storageSource}
            onClearEntries={() => entries.length > 0 && setShowDeleteAllDialog(true)}
            isExporting={isExporting}
            onExportExcel={handleExportExcel}
            onExportPdf={handleExportPdf}
            onBack={() => setTab('tracking')}
            lang={lang}
          />
        )}
        {tab === 'dashboard' && (
          <DashboardTab
            totals={totals}
            baseTotals={baseTotals}
            accidentSummary={accidentSummary}
            licenseSummary={licenseSummary}
            accidents={accidents}
            chartData={chartData}
            chartCaption={chartCaption}
            entries={computedEntries}
            roi={roi}
            settings={settings}
          />
        )}
      </main>

      <div className="display-access-fab-wrap">
        <button
          type="button"
          onClick={() => setShowDisplayPanel((v) => !v)}
          className={`display-access-fab-btn ${showDisplayPanel ? 'display-access-fab-btn--active' : ''}`}
          aria-expanded={showDisplayPanel}
          aria-label="أدوات سهولة العرض — الحجم والألوان"
          title="عرض وتكبير"
        >
          <AccessibilityIcon className="w-6 h-6" />
        </button>
      </div>

      <DisplayAccessibilityPanel
        open={showDisplayPanel}
        onClose={() => setShowDisplayPanel(false)}
        settings={settings}
        onChange={(s) => persist({ ...state, settings: s })}
      />

      <OilChangeDialog
        open={oilDialogOpen}
        mode="standalone"
        changeDate={
          standaloneOilEdit && standaloneOilEdit !== 'new'
            ? standaloneOilEdit.changeDate
            : new Date().toISOString().slice(0, 10)
        }
        oilCost={
          standaloneOilEdit && standaloneOilEdit !== 'new' ? standaloneOilEdit.cost : 0
        }
        driverName={settings.currentDriverName}
        existing={
          standaloneOilEdit && standaloneOilEdit !== 'new' ? standaloneOilEdit : null
        }
        previousRecords={sortOilChangesNewestFirst(
          oilChanges.filter((o) => {
            if (standaloneOilEdit && standaloneOilEdit !== 'new') {
              return o.id !== standaloneOilEdit.id;
            }
            return true;
          })
        )}
        onCancel={handleOilDialogCancel}
        onSave={handleOilDialogSave}
      />
    </div>
  );
};

/* ——— Delete all confirmation ——— */

const DELETE_ALL_CONFIRM_PHRASE = 'حذف الكل';

const DeleteAllConfirmDialog: React.FC<{
  entryCount: number;
  vehicleLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ entryCount, vehicleLabel, onCancel, onConfirm }) => {
  const [typed, setTyped] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);

  const canDelete =
    acknowledged && typed.trim() === DELETE_ALL_CONFIRM_PHRASE && entryCount > 0;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-all-title"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full border-2 border-red-300 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-red-600 px-5 py-4 text-white">
          <div className="flex items-start gap-3">
            <span className="text-2xl leading-none" aria-hidden>
              ⚠
            </span>
            <div>
              <h2 id="delete-all-title" className="text-lg font-bold">
                تأكيد حذف كل البيانات
              </h2>
              <p className="text-red-100 text-sm mt-1">هذا الإجراء خطير ولا يمكن التراجع عنه</p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4 text-right">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-900 space-y-2">
            <p className="font-semibold">
              سيتم حذف{' '}
              <span className="tabular-nums text-red-700">{fmtInt(entryCount)}</span> سجل/سجلات
              شهرية لـ <strong>{vehicleLabel || 'السيارة'}</strong> نهائياً.
            </p>
            <ul className="list-disc list-inside text-red-800 space-y-1 text-xs">
              <li>كل الإيرادات والمصاريف والمدفوعات</li>
              <li>ملاحظات كل شهر</li>
              <li>لا يمكن استرجاع البيانات بعد الحذف</li>
            </ul>
            <p className="text-xs text-red-700 pt-1 border-t border-red-200">
              الإعدادات، سجل الحوادث، والنسخ الاحتياطية المحفوظة على جهازك لا تُحذف — فقط
              السجلات الشهرية.
            </p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-red-300 text-red-600 focus:ring-red-500"
            />
            <span className="text-sm text-slate-700 leading-relaxed">
              أُقرّ بأنني أفهم أن الحذف <strong className="text-red-700">نهائي</strong> ولن أتمكن
              من استرجاع هذه السجلات
            </span>
          </label>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              للتأكيد، اكتب{' '}
              <strong className="text-red-700 font-bold">{DELETE_ALL_CONFIRM_PHRASE}</strong>{' '}
              بالضبط:
            </label>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={DELETE_ALL_CONFIRM_PHRASE}
              className="w-full border-2 border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:border-red-400 focus:ring-2 focus:ring-red-100"
              autoComplete="off"
              dir="rtl"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-800 text-sm font-medium hover:bg-slate-50"
            >
              إلغاء — لا تحذف
            </button>
            <button
              type="button"
              disabled={!canDelete}
              onClick={onConfirm}
              className="flex-1 py-2.5 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              نعم، احذف كل السجلات
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ——— Success dialog ——— */

const SuccessDialog: React.FC<{ message: string; onClose: () => void }> = ({
  message,
  onClose,
}) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    onClick={onClose}
    role="dialog"
    aria-modal="true"
  >
    <div
      className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 text-center border border-green-200"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center text-2xl text-green-600">
        ✓
      </div>
      <p className="text-lg font-semibold text-slate-800 leading-relaxed">{message}</p>
      <button
        type="button"
        onClick={onClose}
        className="mt-6 w-full py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
      >
        حسناً
      </button>
    </div>
  </div>
);

/* ——— Tracking pagination ——— */

const PaginationBar: React.FC<{
  page: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
  total: number;
  onPageChange: (page: number) => void;
}> = ({ page, totalPages, rangeStart, rangeEnd, total, onPageChange }) => {
  if (total === 0) return null;

  const pages: number[] = [];
  const maxButtons = 5;
  let start = Math.max(1, page - Math.floor(maxButtons / 2));
  const end = Math.min(totalPages, start + maxButtons - 1);
  start = Math.max(1, end - maxButtons + 1);
  for (let p = start; p <= end; p++) pages.push(p);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 py-3 px-4 bg-slate-50 border border-slate-200 rounded-xl text-sm">
      <p className="text-slate-600 tabular-nums">
        عرض{' '}
        <span className="font-semibold text-slate-800">
          {fmtInt(rangeStart)}–{fmtInt(rangeEnd)}
        </span>{' '}
        من <span className="font-semibold text-slate-800">{fmtInt(total)}</span> سجل
        <span className="text-slate-400 mx-1">·</span>
        {fmtInt(TRACKING_PAGE_SIZE)} لكل صفحة
      </p>
      <div className="flex items-center gap-1 flex-wrap justify-center">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40 hover:bg-slate-100"
        >
          السابق
        </button>
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            className={`min-w-[2.25rem] px-2 py-1.5 rounded-lg border tabular-nums font-medium ${
              p === page
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            {fmtInt(p)}
          </button>
        ))}
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40 hover:bg-slate-100"
        >
          التالي
        </button>
      </div>
    </div>
  );
};

const ExpenseDetailsCell: React.FC<{ row: EntryComputed }> = ({ row }) => {
  const tags = REPORT_EXPENSE_KEYS.filter((k) => row.expenseDetails[k] > 0);

  return (
    <div className="space-y-1.5 min-w-[140px] max-w-[220px]">
      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {tags.map((k) => (
            <span
              key={k}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs leading-snug"
            >
              <span className="text-slate-500">{EXPENSE_FIELD_LABELS[k]}</span>
              <span className="font-semibold tabular-nums">{fmt(row.expenseDetails[k])}</span>
            </span>
          ))}
        </div>
      ) : (
        <span className="text-slate-400">—</span>
      )}
      {row.notes ? (
        <p className="text-xs text-slate-500 leading-relaxed line-clamp-2" title={row.notes}>
          {row.notes}
        </p>
      ) : null}
    </div>
  );
};

/* ——— Tracking ——— */

interface TrackingTabProps {
  entries: EntryComputed[];
  showForm: boolean;
  form: Omit<MonthlyEntry, 'id'>;
  guarantee: number;
  editingId: string | null;
  onOpenAdd: () => void;
  onOpenEdit: (e: MonthlyEntry) => void;
  onCloseForm: () => void;
  onSave: (e: React.FormEvent) => void;
  onDelete: (id: string) => void;
  onFormChange: React.Dispatch<React.SetStateAction<Omit<MonthlyEntry, 'id'>>>;
  onMonthPickerChange: (ym: string) => void;
  onOpenOilTab: () => void;
  oilChanges: OilChangeRecord[];
  lateCount: number;
  paidCount: number;
  totalRemaining: number;
}

const TrackingTab: React.FC<TrackingTabProps> = ({
  entries,
  showForm,
  form,
  guarantee,
  editingId,
  onOpenAdd,
  onOpenEdit,
  onCloseForm,
  onSave,
  onDelete,
  onFormChange,
  onMonthPickerChange,
  onOpenOilTab,
  oilChanges,
  lateCount,
  paidCount,
  totalRemaining,
}) => {
  const previewRemaining = Math.max(0, guarantee - (form.driverPaid || 0));
  const previewStatus = previewRemaining > 0 ? 'متأخر' : 'مدفوع';
  const expenseDetails = normalizeExpenseDetails(form.expenseDetails, form.expenses);
  const monthOilFromTab = useMemo(() => {
    const mk = monthKey(form.date || '');
    if (!mk) return 0;
    return oilChanges
      .filter((o) => {
        if (editingId && o.entryId === editingId) return true;
        return !o.entryId && monthKey(o.changeDate) === mk;
      })
      .reduce((s, o) => s + (o.cost || 0), 0);
  }, [form.date, oilChanges, editingId]);
  const formExpenseTotal = sumExpenses({ ...expenseDetails, oil: 0 }) + monthOilFromTab;
  const monthPickerValue = form.date ? form.date.slice(0, 7) : '';

  const setExpenseField = (key: keyof ExpenseBreakdown, value: number) => {
    onFormChange((f) => {
      const nextDetails = normalizeExpenseDetails(f.expenseDetails, f.expenses);
      const updated = { ...nextDetails, [key]: value };
      return { ...f, expenseDetails: updated, expenses: sumExpenses(updated) };
    });
  };

  const isEditMode = Boolean(editingId);
  const formRef = useRef<HTMLFormElement>(null);
  const [filters, setFilters] = useState<EntryFilters>(EMPTY_ENTRY_FILTERS);
  const [page, setPage] = useState(1);

  const driverOptions = useMemo(() => getUniqueDriverNames(entries), [entries]);

  const filteredEntries = useMemo(
    () => filterEntries(entries, filters),
    [entries, filters]
  );

  const pagination = useMemo(
    () => paginateEntries(filteredEntries, page, TRACKING_PAGE_SIZE),
    [filteredEntries, page]
  );

  const hasActiveFilters =
    filters.query.trim() !== '' || filters.status !== 'all' || filters.driver !== 'all';

  const clearFilters = () => {
    setFilters(EMPTY_ENTRY_FILTERS);
    setPage(1);
  };

  useEffect(() => {
    setPage(1);
  }, [filters.query, filters.status, filters.driver]);

  useEffect(() => {
    if (!editingId) return;
    const targetPage = findEntryPage(filteredEntries, editingId, TRACKING_PAGE_SIZE);
    if (targetPage != null) setPage(targetPage);
  }, [editingId, filteredEntries]);

  useEffect(() => {
    if (page > pagination.totalPages) setPage(pagination.totalPages);
  }, [page, pagination.totalPages]);

  useEffect(() => {
    if (showForm && formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [showForm, editingId]);

  return (
    <div className="space-y-4">
      {entries.length > 0 && lateCount > 0 && (
        <button
          type="button"
          onClick={() => {
            setFilters((f) => ({ ...f, status: 'متأخر' }));
            setPage(1);
          }}
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-800 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-100 text-right w-full sm:w-auto justify-center sm:justify-start"
          title="عرض الأشهر المتأخرة في الجدول"
        >
          <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
          <span className="tabular-nums">
            {fmtInt(lateCount)} شهر متأخر — متبقي {fmt(totalRemaining)} د.أ
          </span>
        </button>
      )}
      {entries.length > 0 && lateCount === 0 && (
        <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-800 border border-green-200 rounded-lg text-sm font-medium w-full sm:w-auto justify-center sm:justify-start">
          <span className="text-green-600">✓</span>
          كل الأشهر مدفوعة ({fmtInt(paidCount)} شهر)
        </span>
      )}

      <div className="flex justify-between items-center gap-2 flex-wrap">
        <p className="text-sm text-slate-600">
          {isEditMode ? (
            <span className="text-amber-700 font-medium">
              أنت في وضع التعديل — عدّل الحقول ثم اضغط «حفظ التعديلات»
            </span>
          ) : (
            'أضف سجلاً واحداً لكل شهر'
          )}
        </p>
        <button
          type="button"
          onClick={onOpenAdd}
          disabled={isEditMode}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + شهر جديد
        </button>
      </div>

      {showForm && (
        <form
          ref={formRef}
          onSubmit={onSave}
          className={`rounded-xl p-5 shadow-md space-y-4 transition-colors ${
            isEditMode
              ? 'bg-amber-50 border-2 border-amber-400 ring-4 ring-amber-100'
              : 'bg-white border border-slate-200'
          }`}
        >
          {isEditMode ? (
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-amber-200">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center px-3 py-1 rounded-full bg-amber-500 text-white text-xs font-bold">
                  وضع التعديل
                </span>
                <h2 className="font-bold text-amber-900">
                  تعديل سجل شهر {form.month || formatMonthLabel(form.date)}
                </h2>
              </div>
              <p className="text-xs text-amber-800">التغييرات تُطبَّق على هذا السجل فقط</p>
            </div>
          ) : (
            <h2 className="font-semibold text-slate-800">إضافة شهر جديد</h2>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <label className="block">
              <span className="text-xs font-medium text-slate-500">الشهر / السنة</span>
              <input
                type="month"
                required
                value={monthPickerValue}
                onChange={(e) => onMonthPickerChange(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm tabular-nums"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500">رقم الشهر</span>
              <input
                type="text"
                readOnly
                value={formatMonthNumber(form.date)}
                className="mt-1 w-full border border-slate-100 bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-600 tabular-nums text-center font-medium"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500">الفترة (MM/YYYY)</span>
              <input
                type="text"
                readOnly
                value={form.month || formatMonthLabel(form.date)}
                className="mt-1 w-full border border-slate-100 bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-600 tabular-nums"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500">اسم السائق</span>
              <input
                type="text"
                value={form.driverName}
                onChange={(e) => onFormChange((f) => ({ ...f, driverName: e.target.value }))}
                placeholder="اسم السائق لهذا الشهر"
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500">الإيراد (د.أ)</span>
              <input
                type="number"
                min={0}
                step={1}
                value={form.revenue}
                onChange={(e) =>
                  onFormChange((f) => ({ ...f, revenue: Number(e.target.value) || 0 }))
                }
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500">مدفوع السائق (د.أ)</span>
              <input
                type="number"
                min={0}
                step={1}
                value={form.driverPaid}
                onChange={(e) =>
                  onFormChange((f) => ({ ...f, driverPaid: Number(e.target.value) || 0 }))
                }
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="border border-orange-200 rounded-xl p-4 bg-orange-50/50 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-orange-900">تفاصيل المصاريف (اختياري)</h3>
              <span className="text-sm font-bold text-orange-800 tabular-nums">
                المجموع: {fmt(formExpenseTotal)} د.أ
              </span>
            </div>
            <p className="text-xs text-slate-500">يمكن الحفظ بدون مصاريف — اترك الحقول فارغة</p>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-orange-200 bg-white px-3 py-2.5">
              <p className="text-xs text-orange-900 leading-relaxed">
                مصروف <strong>الزيت</strong> يُسجَّل من تبويب «متابعة الزيت» (نوع، عيار، عداد) ويُحسب
                تلقائياً في الأرباح والملخص.
                {monthOilFromTab > 0 && (
                  <span className="block mt-1 font-semibold tabular-nums">
                    زيت هذا الشهر من التبويب: {fmt(monthOilFromTab)} د.أ
                  </span>
                )}
              </p>
              <button
                type="button"
                onClick={onOpenOilTab}
                className="shrink-0 text-xs font-semibold text-orange-700 underline hover:text-orange-900"
              >
                تبويب الزيت ←
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {VISIBLE_EXPENSE_KEYS.map((key) => (
                <label key={key} className="block">
                  <span className="text-xs font-medium text-slate-600">
                    {EXPENSE_FIELD_LABELS[key]} <span className="text-slate-400">(اختياري)</span>
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={expenseDetails[key] || ''}
                    onChange={(e) => setExpenseField(key, Number(e.target.value) || 0)}
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                  />
                </label>
              ))}
            </div>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">ملاحظات (اختياري)</span>
              <textarea
                value={form.notes ?? ''}
                onChange={(e) => onFormChange((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder="مثال: 10 أيام توقف، موازنة إطارات..."
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white resize-none"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-4 text-sm bg-slate-50 rounded-lg p-3 border border-slate-100">
            <span>
              الضمان الشهري: <strong>{fmt(guarantee)}</strong> د.أ
            </span>
            <span>
              المتبقي: <strong className={previewRemaining > 0 ? 'text-red-600' : 'text-green-600'}>
                {fmt(previewRemaining)}
              </strong>{' '}
              د.أ
            </span>
            <span
              className={`px-2 py-0.5 rounded font-medium ${
                previewStatus === 'متأخر'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-green-100 text-green-700'
              }`}
            >
              {previewStatus}
            </span>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onCloseForm}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              {isEditMode ? 'إلغاء التعديل' : 'إلغاء'}
            </button>
            <button
              type="submit"
              className={`px-4 py-2 text-white text-sm font-medium rounded-lg ${
                isEditMode
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isEditMode ? 'حفظ التعديلات' : 'حفظ'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3">
          <label className="flex-1 block">
            <span className="sr-only">بحث</span>
            <input
              type="search"
              value={filters.query}
              onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
              placeholder="بحث ذكي: شهر، سائق، مبلغ، مصاريف، ملاحظات..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
            />
          </label>
          <div className="flex flex-wrap gap-2 sm:min-w-[280px]">
            <select
              value={filters.status}
              onChange={(e) =>
                setFilters((f) => ({ ...f, status: e.target.value as EntryFilters['status'] }))
              }
              className="flex-1 min-w-[120px] border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white"
              aria-label="تصفية الحالة"
            >
              <option value="all">كل الحالات</option>
              <option value="مدفوع">مدفوع فقط</option>
              <option value="متأخر">متأخر فقط</option>
            </select>
            <select
              value={filters.driver}
              onChange={(e) => setFilters((f) => ({ ...f, driver: e.target.value }))}
              className="flex-1 min-w-[120px] border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white"
              aria-label="تصفية السائق"
            >
              <option value="all">كل السائقين</option>
              {driverOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="px-3 py-2.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap"
              >
                مسح
              </button>
            )}
          </div>
        </div>

        <p className="text-xs text-slate-500">
          {entries.length === 0 ? (
            'لا توجد سجلات'
          ) : hasActiveFilters ? (
            <>
              نتائج البحث:{' '}
              <span className="font-semibold text-slate-700 tabular-nums">
                {fmtInt(filteredEntries.length)}
              </span>{' '}
              من {fmtInt(entries.length)}
            </>
          ) : (
            <>
              إجمالي السجلات:{' '}
              <span className="font-semibold text-slate-700 tabular-nums">{fmtInt(entries.length)}</span>
            </>
          )}
        </p>

        {filteredEntries.length > TRACKING_PAGE_SIZE && (
          <PaginationBar
            page={pagination.page}
            totalPages={pagination.totalPages}
            rangeStart={pagination.rangeStart}
            rangeEnd={pagination.rangeEnd}
            total={pagination.total}
            onPageChange={setPage}
          />
        )}

        <div className="tracking-table-outer border border-slate-100 rounded-lg">
        <div className="tracking-table-scroll">
        <table className="tracking-table w-full text-sm min-w-[960px]">
          <thead>
            <tr className="bg-blue-600 text-white text-sm">
              <th className="py-3.5 px-4 text-right font-semibold whitespace-nowrap">#</th>
              <th className="py-3.5 px-4 text-right font-semibold whitespace-nowrap">MM/YYYY</th>
              <th className="py-3.5 px-4 text-right font-semibold">السائق</th>
              <th className="py-3.5 px-4 text-right font-semibold whitespace-nowrap">الإيراد</th>
              <th className="py-3.5 px-4 text-right font-semibold whitespace-nowrap">المصاريف</th>
              <th className="py-3.5 px-4 text-right font-semibold min-w-[160px]">تفاصيل</th>
              <th className="py-3.5 px-4 text-right font-semibold whitespace-nowrap">مدفوع</th>
              <th className="py-3.5 px-4 text-right font-semibold whitespace-nowrap">الضمان</th>
              <th className="py-3.5 px-4 text-right font-semibold whitespace-nowrap">المتبقي</th>
              <th className="py-3.5 px-4 text-right font-semibold">الحالة</th>
              <th className="py-3.5 px-4 w-28"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {entries.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-14 text-center text-slate-400">
                  لا توجد سجلات — اضغط «شهر جديد» للبدء
                </td>
              </tr>
            ) : filteredEntries.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-14 text-center text-slate-500">
                  لا توجد نتائج — غيّر البحث أو اضغط «مسح»
                </td>
              </tr>
            ) : (
              pagination.items.map((row, idx) => {
                const isRowEditing = editingId === row.id;
                const rowNum = pagination.rangeStart + idx;
                return (
                <tr
                  key={row.id}
                  className={
                    isRowEditing
                      ? 'bg-amber-100 ring-2 ring-inset ring-amber-400'
                      : row.status === 'متأخر'
                        ? 'bg-red-50/50'
                        : ''
                  }
                >
                  <td className="py-3.5 px-4 tabular-nums text-center text-slate-500 font-medium">
                    {fmtInt(rowNum)}
                  </td>
                  <td className="py-3.5 px-4 tabular-nums font-semibold text-slate-800 whitespace-nowrap">
                    {row.month}
                  </td>
                  <td className="py-3.5 px-4 font-medium text-slate-800">{row.driverName}</td>
                  <td className="py-3.5 px-4 tabular-nums text-green-700 font-semibold">{fmt(row.revenue)}</td>
                  <td className="py-3.5 px-4 tabular-nums text-orange-700 font-semibold">{fmt(row.expenses)}</td>
                  <td className="py-3.5 px-4 align-top">
                    <ExpenseDetailsCell row={row} />
                  </td>
                  <td className="py-3.5 px-4 tabular-nums font-medium">{fmt(row.driverPaid)}</td>
                  <td className="py-3.5 px-4 tabular-nums text-slate-500">{fmt(row.guarantee)}</td>
                  <td
                    className={`py-3.5 px-4 tabular-nums font-semibold ${
                      row.remaining > 0 ? 'text-red-600' : 'text-slate-400'
                    }`}
                  >
                    {fmt(row.remaining)}
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-block px-2.5 py-1 rounded-md text-xs font-bold ${
                        row.status === 'متأخر'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-green-100 text-green-700'
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {isRowEditing ? (
                      <span className="text-amber-700 text-xs font-bold">جاري التعديل ↑</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onOpenEdit(row)}
                        className="text-blue-600 hover:underline text-sm font-medium ml-2"
                      >
                        تعديل
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onDelete(row.id)}
                      disabled={isRowEditing}
                      className="text-red-600 hover:underline text-sm font-medium disabled:opacity-40"
                    >
                      حذف
                    </button>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>
        </div>

        {filteredEntries.length > 0 && (
          <PaginationBar
            page={pagination.page}
            totalPages={pagination.totalPages}
            rangeStart={pagination.rangeStart}
            rangeEnd={pagination.rangeEnd}
            total={pagination.total}
            onPageChange={setPage}
          />
        )}
      </div>
    </div>
  );
};

/* ——— التأمين والحوادث ——— */

const emptyAccidentForm = (defaultDriver = ''): Omit<AccidentRecord, 'id'> => ({
  accidentDate: new Date().toISOString().slice(0, 10),
  responsibleDriver: defaultDriver,
  downtimeDays: 0,
  details: '',
  cost: 0,
  insurancePending: 0,
  insuranceReceived: 0,
});

function getTaxiDisplayTheme(): string {
  return document.getElementById('taxi-app')?.getAttribute('data-theme') ?? 'default';
}

const ClaimTooltipContent: React.FC<{
  claim: ReturnType<typeof computeClaimBreakdown>;
}> = ({ claim }) => (
  <>
    <span className="claim-cell-tooltip-title">مطالبة التأمين</span>
    <span className="claim-cell-tooltip-body">
      {claim.downtimeLine && (
        <span className="claim-cell-tooltip-line claim-cell-tooltip-line--downtime">
          {claim.downtimeLine}
        </span>
      )}
      {claim.repairCost > 0 && (
        <span className="claim-cell-tooltip-line claim-cell-tooltip-line--repair">
          إصلاح · {fmt(claim.repairCost)}
        </span>
      )}
      <span className="claim-cell-tooltip-total">= {fmt(claim.totalClaim)}</span>
    </span>
  </>
);

const ClaimCell: React.FC<{ accident: AccidentRecord; dailyRate: number }> = ({
  accident,
  dailyRate,
}) => {
  const claim = computeClaimBreakdown(accident, dailyRate);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [tipPos, setTipPos] = useState<{
    top?: number;
    bottom?: number;
    right: number;
    above: boolean;
  } | null>(null);

  const updateTipPos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const estimatedHeight = 130;
    const spaceBelow = window.innerHeight - rect.bottom;
    const above = spaceBelow < estimatedHeight && rect.top > estimatedHeight;
    setTipPos({
      above,
      right: Math.max(8, window.innerWidth - rect.right),
      ...(above
        ? { bottom: window.innerHeight - rect.top + 8 }
        : { top: rect.bottom + 8 }),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updateTipPos();
    const onScrollOrResize = () => updateTipPos();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, updateTipPos]);

  if (claim.totalClaim <= 0) {
    return <span className="text-slate-400">—</span>;
  }

  const tipLines: string[] = [];
  if (claim.downtimeLine) tipLines.push(claim.downtimeLine);
  if (claim.repairCost > 0) tipLines.push(`إصلاح · ${fmt(claim.repairCost)}`);

  return (
    <>
      <span
        ref={triggerRef}
        className="claim-cell-tooltip"
        tabIndex={0}
        aria-label={`مطالبة التأمين: ${tipLines.join(' + ')} = ${fmt(claim.totalClaim)}`}
        onMouseEnter={() => {
          updateTipPos();
          setOpen(true);
        }}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => {
          updateTipPos();
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
      >
        <span className="claim-cell-tooltip-trigger tabular-nums font-semibold text-indigo-800">
          {fmt(claim.totalClaim)}
        </span>
      </span>
      {open &&
        tipPos &&
        createPortal(
          <div
            className={`claim-cell-tooltip-panel claim-cell-tooltip-panel--portal${
              tipPos.above ? ' claim-cell-tooltip-panel--above' : ''
            }`}
            data-theme={getTaxiDisplayTheme()}
            role="tooltip"
            style={{
              position: 'fixed',
              zIndex: 300,
              right: tipPos.right,
              top: tipPos.top,
              bottom: tipPos.bottom,
            }}
          >
            <ClaimTooltipContent claim={claim} />
          </div>,
          document.body
        )}
    </>
  );
};

const InsuranceAccidentsTab: React.FC<{
  accidents: AccidentRecord[];
  accidentSummary: AccidentSummary;
  monthlyGuarantee: number;
  defaultDriver: string;
  onAccidentsChange: (accidents: AccidentRecord[]) => void;
}> = ({
  accidents,
  accidentSummary,
  monthlyGuarantee,
  defaultDriver,
  onAccidentsChange,
}) => {
  const [form, setForm] = useState(() => emptyAccidentForm(defaultDriver));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const resetForm = () => {
    setForm(emptyAccidentForm(defaultDriver));
    setEditingId(null);
    setShowForm(false);
  };

  const openAdd = () => {
    setForm(emptyAccidentForm(defaultDriver));
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (a: AccidentRecord) => {
    setForm({
      accidentDate: a.accidentDate,
      responsibleDriver: a.responsibleDriver,
      downtimeDays: a.downtimeDays,
      details: a.details,
      cost: a.cost,
      insurancePending: a.insurancePending,
      insuranceReceived: a.insuranceReceived,
    });
    setEditingId(a.id);
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.accidentDate) {
      alert('يرجى إدخال التاريخ');
      return;
    }
    const record: AccidentRecord = {
      id: editingId ?? `acc-${Date.now()}`,
      ...form,
      responsibleDriver: form.responsibleDriver.trim(),
      details: form.details.trim(),
    };
    const next = editingId
      ? accidents.map((a) => (a.id === editingId ? record : a))
      : [...accidents, record];
    onAccidentsChange(
      [...next].sort(
        (a, b) => new Date(b.accidentDate).getTime() - new Date(a.accidentDate).getTime()
      )
    );
    resetForm();
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('حذف سجل هذا الحادث؟')) return;
    onAccidentsChange(accidents.filter((a) => a.id !== id));
    if (editingId === id) resetForm();
  };

  const sorted = [...accidents].sort(
    (a, b) => new Date(b.accidentDate).getTime() - new Date(a.accidentDate).getTime()
  );

  const totalsRepair = accidentSummary.totalCost;
  const totalsCompensation = accidentSummary.totalReceivedFromAccidents;
  const dailyRate = accidentSummary.downtimeDailyRate;
  const formClaimPreview = computeClaimBreakdown(
    {
      id: '',
      ...form,
    },
    dailyRate
  );

  return (
    <div className="insurance-accidents-tab space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">التأمين والحوادث</h2>
          <p className="text-sm app-text-muted mt-1">
            مطالبة التأمين = أيام التعطل × ({fmt(dailyRate)} د.أ/يوم من الضمان {fmt(monthlyGuarantee)})
            + الإصلاح
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700"
        >
          + إضافة حادث
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 text-center">
          <p className="text-xs text-slate-600">مجموع الإصلاح</p>
          <p className="text-lg font-bold text-orange-800 tabular-nums">−{fmt(totalsRepair)}</p>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-xl p-3 text-center">
          <p className="text-xs text-slate-600">تعويض التأمين</p>
          <p className="text-lg font-bold text-green-800 tabular-nums">+{fmt(totalsCompensation)}</p>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
          <p className="text-xs text-slate-600">قيد الانتظار</p>
          <p className="text-lg font-bold text-amber-800 tabular-nums">
            {fmtInt(accidentSummary.totalPending)}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">بلا مستلم تأمين</p>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
          <p className="text-xs text-slate-600">أيام التعطل</p>
          <p className="text-lg font-bold text-blue-800 tabular-nums">
            {fmtInt(accidentSummary.totalDowntimeDays)}
          </p>
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="accident-form-panel border border-amber-200 rounded-xl p-4 bg-amber-50/40"
        >
          <h3 className="text-sm font-semibold text-amber-900 mb-3">
            {editingId ? 'تعديل سجل حادث' : 'حادث جديد'}
          </h3>
          <div className="accident-form-grid">
            <label className="accident-form-field">
              <span className="accident-form-label">التاريخ</span>
              <input
                type="date"
                required
                value={form.accidentDate}
                onChange={(e) => setForm((f) => ({ ...f, accidentDate: e.target.value }))}
                className="accident-form-input"
              />
            </label>
            <label className="accident-form-field">
              <span className="accident-form-label">السائق المسبب</span>
              <input
                type="text"
                value={form.responsibleDriver}
                onChange={(e) =>
                  setForm((f) => ({ ...f, responsibleDriver: e.target.value }))
                }
                placeholder="اسم السائق"
                className="accident-form-input"
              />
            </label>
            <label className="accident-form-field">
              <span className="accident-form-label">عدد أيام التعطل</span>
              <input
                type="number"
                min={0}
                step={1}
                value={form.downtimeDays || ''}
                onChange={(e) =>
                  setForm((f) => ({ ...f, downtimeDays: Number(e.target.value) || 0 }))
                }
                className="accident-form-input"
              />
            </label>
            <label className="accident-form-field">
              <span className="accident-form-label">قيمة الإصلاح (د.أ)</span>
              <input
                type="number"
                min={0}
                step={1}
                value={form.cost || ''}
                onChange={(e) => setForm((f) => ({ ...f, cost: Number(e.target.value) || 0 }))}
                className="accident-form-input"
              />
            </label>
            <label className="accident-form-field">
              <span className="accident-form-label">مستلم من التأمين (د.أ)</span>
              <input
                type="number"
                min={0}
                step={1}
                value={form.insuranceReceived || ''}
                onChange={(e) =>
                  setForm((f) => ({ ...f, insuranceReceived: Number(e.target.value) || 0 }))
                }
                className="accident-form-input"
              />
            </label>
            <label className="accident-form-field accident-form-field-full">
              <span className="accident-form-label">تفاصيل</span>
              <textarea
                value={form.details}
                onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))}
                rows={2}
                placeholder="وصف الحادث، الأضرار..."
                className="accident-form-input resize-none"
              />
            </label>
          </div>
          {formClaimPreview.totalClaim > 0 && (
            <p className="text-sm text-indigo-900 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 mt-2">
              <span className="font-medium">مطالبة التأمين: </span>
              {formClaimPreview.downtimeLine && (
                <span className="tabular-nums">{formClaimPreview.downtimeLine}</span>
              )}
              {formClaimPreview.downtimeLine && formClaimPreview.repairCost > 0 && ' + '}
              {formClaimPreview.repairCost > 0 && (
                <span className="tabular-nums">إصلاح {fmt(formClaimPreview.repairCost)}</span>
              )}
              <span className="font-bold tabular-nums"> = {fmt(formClaimPreview.totalClaim)} د.أ</span>
            </p>
          )}
          <div className="flex gap-2 mt-3">
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-amber-700 text-white text-sm font-medium hover:bg-amber-800"
            >
              {editingId ? 'حفظ التعديل' : 'حفظ الحادث'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50"
            >
              إلغاء
            </button>
          </div>
        </form>
      )}

      <div className="tracking-table-outer insurance-table-section border border-slate-200 rounded-xl app-surface">
        <div className="tracking-table-scroll">
        <table className="tracking-table w-full text-sm min-w-[720px]">
          <thead>
            <tr className="bg-slate-700 text-white text-sm">
              <th className="py-3 px-3 text-right font-semibold whitespace-nowrap">التاريخ</th>
              <th className="py-3 px-3 text-right font-semibold">السائق المسبب</th>
              <th className="py-3 px-3 text-right font-semibold whitespace-nowrap">أيام التعطل</th>
              <th className="py-3 px-3 text-right font-semibold whitespace-nowrap">
                قيمة الإصلاح
              </th>
              <th className="py-3 px-3 text-right font-semibold min-w-[120px]">
                مطالبة التأمين
              </th>
              <th className="py-3 px-3 text-right font-semibold whitespace-nowrap">
                مستلم من التأمين
              </th>
              <th className="py-3 px-3 text-right font-semibold min-w-[140px]">تفاصيل</th>
              <th className="py-3 px-3 w-24"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400">
                  لا توجد حوادث — اضغط «إضافة حادث»
                </td>
              </tr>
            ) : (
              sorted.map((a) => (
                <tr
                  key={a.id}
                  className={editingId === a.id ? 'bg-amber-50' : 'hover:bg-slate-50/80'}
                >
                  <td className="py-3 px-3 tabular-nums font-medium text-slate-800 whitespace-nowrap">
                    {a.accidentDate}
                  </td>
                  <td className="py-3 px-3 text-slate-800">{a.responsibleDriver || '—'}</td>
                  <td className="py-3 px-3 tabular-nums text-slate-700">
                    {fmtInt(a.downtimeDays)}
                  </td>
                  <td className="py-3 px-3 tabular-nums text-orange-700 font-semibold">
                    {fmt(a.cost)}
                  </td>
                  <td className="py-3 px-3 align-top claim-cell-td">
                    <ClaimCell accident={a} dailyRate={dailyRate} />
                  </td>
                  <td className="py-3 px-3 tabular-nums text-green-700 font-semibold">
                    {a.insuranceReceived > 0 ? fmt(a.insuranceReceived) : '—'}
                  </td>
                  <td className="py-3 px-3 text-slate-600 text-sm align-top">
                    {a.details || '—'}
                  </td>
                  <td className="py-3 px-3 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openEdit(a)}
                      className="text-blue-600 text-xs font-medium hover:underline ml-2"
                    >
                      تعديل
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(a.id)}
                      className="text-red-600 text-xs font-medium hover:underline"
                    >
                      حذف
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {sorted.length > 0 && (
            <tfoot>
              <tr className="bg-slate-100 font-semibold text-sm">
                <td className="py-3 px-3" colSpan={2}>
                  المجموع
                </td>
                <td className="py-3 px-3 tabular-nums text-slate-800">
                  {fmtInt(accidentSummary.totalDowntimeDays)}
                </td>
                <td className="py-3 px-3 tabular-nums text-orange-800">{fmt(totalsRepair)}</td>
                <td className="py-3 px-3 tabular-nums text-indigo-800">
                  {fmt(accidentSummary.totalClaimAmount)}
                </td>
                <td className="py-3 px-3 tabular-nums text-green-800">{fmt(totalsCompensation)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
        </div>
      </div>

      <p className="text-xs app-text-muted shrink-0">
        في تبويب «الملخص»: إجمالي المصاريف يشمل الإصلاح، وصافي الربح يشمل مستلم التأمين
      </p>
    </div>
  );
};

const emptyLicenseForm = (): Omit<LicenseRecord, 'id'> => {
  const today = new Date().toISOString().slice(0, 10);
  return {
    licenseDate: today,
    licenseYear: parseInt(today.slice(0, 4), 10),
    amountPaid: 0,
    notes: '',
  };
};

const LicenseRenewalBadge: React.FC<{ info: LicenseRenewalInfo; compact?: boolean }> = ({
  info,
  compact,
}) => {
  const styles =
    info.status === 'overdue'
      ? 'bg-red-100 text-red-800 border-red-200'
      : info.status === 'due'
        ? 'bg-amber-100 text-amber-900 border-amber-200'
        : 'bg-yellow-50 text-yellow-900 border-yellow-200';
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded border text-xs font-medium ${styles} ${compact ? '' : 'whitespace-normal'}`}
    >
      {formatRenewalLabel(info)}
    </span>
  );
};

const LicensesTab: React.FC<{
  licenses: LicenseRecord[];
  licenseSummary: LicenseSummary;
  onLicensesChange: (licenses: LicenseRecord[]) => void;
}> = ({ licenses, licenseSummary, onLicensesChange }) => {
  const [form, setForm] = useState(emptyLicenseForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const resetForm = () => {
    setForm(emptyLicenseForm());
    setEditingId(null);
    setShowForm(false);
  };

  const openAdd = () => {
    setForm(emptyLicenseForm());
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (l: LicenseRecord) => {
    setForm({
      licenseDate: l.licenseDate,
      licenseYear: l.licenseYear,
      amountPaid: l.amountPaid,
      notes: l.notes,
    });
    setEditingId(l.id);
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.licenseDate) {
      alert('يرجى إدخال تاريخ الترخيص');
      return;
    }
    const year = parseInt(form.licenseDate.slice(0, 4), 10);
    const record: LicenseRecord = {
      id: editingId ?? `lic-${Date.now()}`,
      licenseDate: form.licenseDate,
      licenseYear: year,
      amountPaid: form.amountPaid || 0,
      notes: form.notes.trim(),
    };
    const duplicate = licenses.some(
      (l) => l.id !== editingId && l.licenseDate === record.licenseDate
    );
    if (duplicate) {
      alert('يوجد سجل ترخيص بنفس التاريخ مسبقاً');
      return;
    }
    const next = editingId
      ? licenses.map((l) => (l.id === editingId ? record : l))
      : [...licenses, record];
    onLicensesChange(
      [...next].sort(
        (a, b) => new Date(b.licenseDate).getTime() - new Date(a.licenseDate).getTime()
      )
    );
    resetForm();
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('حذف سجل الترخيص لهذه السنة؟')) return;
    onLicensesChange(licenses.filter((l) => l.id !== id));
    if (editingId === id) resetForm();
  };

  const sorted = [...licenses].sort(
    (a, b) => new Date(b.licenseDate).getTime() - new Date(a.licenseDate).getTime()
  );
  const formRenewal = form.licenseDate ? getLicenseRenewalInfo(form.licenseDate) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">تكلفة الترخيص السنوي</h2>
          <p className="text-sm app-text-muted mt-1">
            يُضاف المبلغ إلى إجمالي المصاريف — تنبيه التجديد بعد سنة من تاريخ الترخيص
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700"
        >
          + إضافة ترخيص
        </button>
      </div>

      {licenseSummary.renewalAlerts.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-900">تنبيه تجديد الترخيص</p>
          <ul className="text-sm space-y-1.5">
            {licenseSummary.renewalAlerts.map(({ record, info }) => (
              <li key={record.id} className="flex flex-wrap items-center gap-2 text-amber-950">
                <span className="tabular-nums font-medium">{record.licenseDate}</span>
                <LicenseRenewalBadge info={info} />
                {record.amountPaid > 0 && (
                  <span className="text-xs text-slate-600">({fmt(record.amountPaid)} د.أ)</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-teal-50 border border-teal-100 rounded-xl p-4 text-center max-w-xs">
        <p className="text-xs text-slate-600">مجموع الترخيص</p>
        <p className="text-2xl font-bold text-teal-800 tabular-nums">
          {fmt(licenseSummary.totalPaid)} د.أ
        </p>
        <p className="text-[10px] text-slate-500 mt-0.5">
          {fmtInt(licenseSummary.count)} سنة مسجّلة
        </p>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="accident-form-panel border border-teal-200 rounded-xl p-4 bg-teal-50/40"
        >
          <h3 className="text-sm font-semibold text-teal-900 mb-3">
            {editingId ? 'تعديل ترخيص' : 'ترخيص جديد'}
          </h3>
          <div className="accident-form-grid">
            <label className="accident-form-field">
              <span className="accident-form-label">تاريخ الترخيص</span>
              <input
                type="date"
                required
                value={form.licenseDate}
                onChange={(e) => {
                  const licenseDate = e.target.value;
                  setForm((f) => ({
                    ...f,
                    licenseDate,
                    licenseYear: licenseDate
                      ? parseInt(licenseDate.slice(0, 4), 10)
                      : f.licenseYear,
                  }));
                }}
                className="accident-form-input"
              />
            </label>
            <label className="accident-form-field">
              <span className="accident-form-label">المبلغ المدفوع (د.أ)</span>
              <input
                type="number"
                min={0}
                step={1}
                value={form.amountPaid || ''}
                onChange={(e) =>
                  setForm((f) => ({ ...f, amountPaid: Number(e.target.value) || 0 }))
                }
                className="accident-form-input"
              />
            </label>
            <label className="accident-form-field accident-form-field-full">
              <span className="accident-form-label">ملاحظات</span>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder="مكان الدفع، رقم الوثيقة..."
                className="accident-form-input resize-none"
              />
            </label>
          </div>
          {formRenewal && form.licenseDate && (
            <p className="text-sm mt-2 flex flex-wrap items-center gap-2">
              <span className="text-slate-600">موعد التجديد القادم:</span>
              <span className="tabular-nums font-medium">{getLicenseRenewalDueDate(form.licenseDate)}</span>
              <LicenseRenewalBadge info={formRenewal} compact />
            </p>
          )}
          <div className="flex gap-2 mt-3">
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-teal-700 text-white text-sm font-medium hover:bg-teal-800"
            >
              {editingId ? 'حفظ التعديل' : 'حفظ'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50"
            >
              إلغاء
            </button>
          </div>
        </form>
      )}

      <div className="tracking-table-outer border border-slate-200 rounded-xl app-surface">
        <div className="tracking-table-scroll">
        <table className="tracking-table w-full text-sm">
          <thead>
            <tr className="bg-slate-700 text-white text-sm">
              <th className="py-3 px-3 text-right font-semibold whitespace-nowrap">تاريخ الترخيص</th>
              <th className="py-3 px-3 text-right font-semibold whitespace-nowrap">موعد التجديد</th>
              <th className="py-3 px-3 text-right font-semibold">المبلغ المدفوع</th>
              <th className="py-3 px-3 text-right font-semibold min-w-[100px]">ملاحظات</th>
              <th className="py-3 px-3 w-24"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-slate-400">
                  لا توجد سجلات — اضغط «إضافة ترخيص»
                </td>
              </tr>
            ) : (
              sorted.map((l) => {
                const renewal = getLicenseRenewalInfo(l.licenseDate);
                return (
                <tr
                  key={l.id}
                  className={
                    editingId === l.id
                      ? 'bg-teal-50'
                      : renewal.status !== 'ok'
                        ? 'bg-amber-50/50'
                        : 'hover:bg-slate-50/80'
                  }
                >
                  <td className="py-3 px-3 tabular-nums font-semibold text-slate-800 whitespace-nowrap">
                    {l.licenseDate}
                  </td>
                  <td className="py-3 px-3 align-top">
                    <div className="space-y-0.5">
                      <span className="tabular-nums text-sm text-slate-700 block">
                        {renewal.dueDate}
                      </span>
                      {renewal.status !== 'ok' && <LicenseRenewalBadge info={renewal} compact />}
                    </div>
                  </td>
                  <td className="py-3 px-3 tabular-nums text-orange-700 font-semibold">
                    {fmt(l.amountPaid)}
                  </td>
                  <td className="py-3 px-3 text-slate-600 text-sm align-top">
                    {l.notes || '—'}
                  </td>
                  <td className="py-3 px-3 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openEdit(l)}
                      className="text-blue-600 text-xs font-medium hover:underline ml-2"
                    >
                      تعديل
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(l.id)}
                      className="text-red-600 text-xs font-medium hover:underline"
                    >
                      حذف
                    </button>
                  </td>
                </tr>
              );
              })
            )}
          </tbody>
          {sorted.length > 0 && (
            <tfoot>
              <tr className="bg-slate-100 font-semibold text-sm">
                <td className="py-3 px-3" colSpan={2}>
                  المجموع
                </td>
                <td className="py-3 px-3 tabular-nums text-teal-800">
                  {fmt(licenseSummary.totalPaid)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
        </div>
      </div>
    </div>
  );
};

const AccessibilityIcon: React.FC<{ className?: string }> = ({ className = 'w-7 h-7' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden
  >
    <circle cx="12" cy="4" r="2" />
    <path d="M12 7c-2.2 0-4 1.8-4 4v1H5l4.5 9.5 2.5-5 2.5 5L19 12h-3V11c0-2.2-1.8-4-4-4z" />
  </svg>
);

const DisplayAccessibilityPanel: React.FC<{
  open: boolean;
  onClose: () => void;
  settings: TaxiSettings;
  onChange: (s: TaxiSettings) => void;
}> = ({ open, onClose, settings, onChange }) => {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if ((target as Element).closest?.('.display-access-fab-btn')) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="display-access-popup app-surface"
      role="dialog"
      aria-modal="false"
      aria-label="أدوات سهولة العرض"
    >
      <div className="display-access-popup-header">
        <div>
          <h3 className="font-bold text-slate-800 text-base">أدوات سهولة العرض</h3>
          <p className="text-xs app-text-muted mt-0.5">الحجم، الألوان، وقراءة أوضح</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="display-access-close"
          aria-label="إغلاق"
        >
          ×
        </button>
      </div>
      <div className="display-access-popup-body">
        <DisplayPreferencesPanel settings={settings} onChange={onChange} compact />
      </div>
    </div>
  );
};

/* ——— Settings UI helpers ——— */

const SettingsToggle: React.FC<{
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ label, hint, checked, onChange }) => (
  <div className="settings-row">
    <div>
      <p className="text-sm font-medium text-slate-800">{label}</p>
      {hint && <p className="text-xs app-text-muted mt-0.5">{hint}</p>}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="settings-toggle"
      onClick={() => onChange(!checked)}
      aria-label={label}
    />
  </div>
);

const SettingsSection: React.FC<{
  title: string;
  subtitle?: string;
  icon?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}> = ({ title, subtitle, icon, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="app-surface border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-right hover:bg-slate-50/80 transition-colors"
      >
        <span className="text-slate-400 text-sm tabular-nums">{open ? '▾' : '◂'}</span>
        <div className="flex-1">
          <h3 className="font-semibold text-slate-800 flex items-center justify-end gap-2">
            {icon && <span aria-hidden>{icon}</span>}
            {title}
          </h3>
          {subtitle && <p className="text-xs app-text-muted mt-0.5">{subtitle}</p>}
        </div>
      </button>
      {open && <div className="px-5 pb-5 pt-1 border-t border-slate-100 space-y-4">{children}</div>}
    </section>
  );
};

const DisplayPreferencesPanel: React.FC<{
  settings: TaxiSettings;
  onChange: (s: TaxiSettings) => void;
  compact?: boolean;
}> = ({ settings, onChange, compact = false }) => {
  const themes: { id: DisplayThemeOption; icon: string; label: string }[] = [
    { id: 'default', icon: '☀', label: DISPLAY_THEME_LABELS.default },
    { id: 'comfort', icon: '🌿', label: DISPLAY_THEME_LABELS.comfort },
    { id: 'dark', icon: '🌙', label: DISPLAY_THEME_LABELS.dark },
    { id: 'contrast', icon: '◐', label: DISPLAY_THEME_LABELS.contrast },
  ];

  const sizes: FontSizeOption[] = ['normal', 'large', 'xlarge'];

  return (
    <div className={compact ? 'space-y-4' : 'space-y-5'}>
      <div>
        <p className="text-sm font-medium text-slate-700 mb-2">مظهر الألوان</p>
        <div className="theme-pill w-full flex justify-center sm:justify-start">
          {themes.map((t) => (
            <button
              key={t.id}
              type="button"
              title={t.label}
              aria-pressed={settings.displayTheme === t.id}
              aria-label={t.label}
              onClick={() => onChange({ ...settings, displayTheme: t.id })}
            >
              {t.icon}
            </button>
          ))}
        </div>
        <p className="text-xs app-text-muted mt-2 text-center sm:text-right">
          {DISPLAY_THEME_LABELS[settings.displayTheme ?? 'default']}
        </p>
      </div>

      <div>
        <p className="text-sm font-medium text-slate-700 mb-2">حجم النص والأرقام</p>
        <div className="font-size-grid">
          {sizes.map((size) => (
            <button
              key={size}
              type="button"
              className="font-size-card"
              aria-pressed={settings.fontSize === size}
              onClick={() => onChange({ ...settings, fontSize: size })}
            >
              <div className={`preview ${size}`}>750</div>
              <div className="text-xs font-medium text-slate-600">{FONT_SIZE_LABELS[size]}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-100 overflow-hidden px-4 app-surface-muted">
        <SettingsToggle
          label="تكبير أزرار الأداة"
          hint="أزرار أكبر للمس على الجوال واللابتوب"
          checked={settings.largeButtons ?? false}
          onChange={(largeButtons) => onChange({ ...settings, largeButtons })}
        />
        <SettingsToggle
          label="أرقام أوضح"
          hint="جعل المبالغ والأرقام بخط عريض"
          checked={settings.boldNumbers ?? false}
          onChange={(boldNumbers) => onChange({ ...settings, boldNumbers })}
        />
        <SettingsToggle
          label="تجربة قراءة مريحة"
          hint="تباعد أسطر أوسع في الجداول والنصوص"
          checked={settings.comfortableReading ?? false}
          onChange={(comfortableReading) => onChange({ ...settings, comfortableReading })}
        />
      </div>

      {!compact && (
        <div className="display-preview-box">
          <p className="text-xs app-text-muted mb-2">معاينة مباشرة</p>
          <p className="font-semibold text-slate-800">VIP limousine CARS — 05/2026</p>
          <p className="tabular-nums text-green-700 font-semibold mt-1">إيراد: {fmt(750)} د.أ</p>
          <p className="tabular-nums text-orange-700 mt-0.5">مصاريف: {fmt(120)} د.أ</p>
        </div>
      )}
    </div>
  );
};

/* ——— Settings ——— */

const SettingsTab: React.FC<{
  settings: TaxiSettings;
  entryCount: number;
  onOpenOilTab: () => void;
  onChange: (s: TaxiSettings) => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  backupInputRef: React.RefObject<HTMLInputElement | null>;
  backupStatus: BackupStatus;
  storageSource: StorageSource;
  onClearEntries: () => void;
  isExporting: boolean;
  onExportExcel: () => void;
  onExportPdf: () => void;
  onBack: () => void;
  lang: UiLanguage;
}> = ({
  settings,
  entryCount,
  onOpenOilTab,
  onChange,
  onExportBackup,
  onImportBackup,
  backupInputRef,
  backupStatus,
  storageSource,
  onClearEntries,
  isExporting,
  onExportExcel,
  onExportPdf,
  onBack,
  lang,
}) => (
  <div className="max-w-3xl space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-xl font-bold text-slate-800">
          {lang === 'ar' ? 'الإعدادات' : 'Settings'}
        </h2>
        <p className="text-sm app-text-muted mt-1">
          {lang === 'ar'
            ? 'بيانات السيارة، التقارير، والنسخ الاحتياطي — الحوادث في تبويب «التأمين والحوادث»'
            : 'Vehicle, reports, and backups — accidents are under Insurance tab'}
        </p>
      </div>
      <button
        type="button"
        onClick={onBack}
        className="px-3 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
      >
        {lang === 'ar' ? '← رجوع' : '← Back'}
      </button>
    </div>

    <SettingsSection title="إعدادات العمل" subtitle="الضمان، السائق، واسم السيارة" icon="🚕">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium text-slate-600">قيمة الضمان الشهري (د.أ)</span>
          <input
            type="number"
            min={0}
            step={1}
            value={settings.monthlyGuarantee}
            onChange={(e) =>
              onChange({ ...settings, monthlyGuarantee: Number(e.target.value) || 0 })
            }
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 app-surface"
          />
          <p className="text-xs app-text-muted mt-1">الافتراضي: 750 — لكل الأشهر الجديدة</p>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-600">اسم السائق الحالي</span>
          <input
            type="text"
            value={settings.currentDriverName}
            onChange={(e) => onChange({ ...settings, currentDriverName: e.target.value })}
            placeholder="يُعبَّأ تلقائياً عند شهر جديد"
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 app-surface"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium text-slate-600">اسم السيارة / الوصف</span>
          <input
            type="text"
            value={settings.vehicleLabel}
            onChange={(e) => onChange({ ...settings, vehicleLabel: e.target.value })}
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 app-surface"
          />
          <p className="text-xs app-text-muted mt-1">صورة السيارة: اضغط المربع بجانب الاسم في أعلى الصفحة</p>
        </label>
      </div>
      <p className="text-xs app-text-muted">
        يمكن تغيير اسم السائق لكل شهر — السجلات القديمة تحتفظ بالاسم السابق
      </p>
    </SettingsSection>

    <SettingsSection
      title="متابعة الزيت والعداد"
      subtitle="نوع الزيت، العيار، والعداد — في تبويب مخصص"
      icon="🛢️"
    >
      <p className="text-sm text-slate-600 leading-relaxed">
        سجلات الزيت الكاملة (النوع، العيار، العداد، التنبيهات) في تبويب منفصل لسهولة
        المتابعة.
      </p>
      <button
        type="button"
        onClick={onOpenOilTab}
        className="mt-3 inline-flex items-center gap-2 px-4 py-2.5 bg-orange-600 text-white text-sm font-semibold rounded-xl hover:bg-orange-700"
      >
        فتح تبويب متابعة الزيت ←
      </button>
    </SettingsSection>

    <SettingsSection title="استرداد رأس المال" subtitle="تكلفة السيارة ومدة الاستخدام" icon="📊">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-600">تكلفة السيارة (د.أ)</span>
          <input
            type="number"
            min={0}
            step={100}
            value={settings.vehicleCost}
            onChange={(e) =>
              onChange({ ...settings, vehicleCost: Number(e.target.value) || 0 })
            }
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 app-surface"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-600">مدة قبل الشطب (سنوات)</span>
          <input
            type="number"
            min={1}
            max={30}
            step={1}
            value={settings.vehicleLifeYears}
            onChange={(e) =>
              onChange({ ...settings, vehicleLifeYears: Number(e.target.value) || 7 })
            }
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 app-surface"
          />
        </label>
      </div>
    </SettingsSection>

    <SettingsSection title="تصدير التقارير" subtitle="Excel و PDF لكل السجلات الشهرية" icon="📄">
      {entryCount === 0 ? (
        <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-4 text-center">
          لا توجد سجلات للتصدير — أضف أشهراً من تبويب المتابعة الشهرية أولاً
        </p>
      ) : (
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            disabled={isExporting}
            onClick={onExportExcel}
            className="flex-1 py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {isExporting ? 'جاري التصدير...' : 'تصدير Excel'}
          </button>
          <button
            type="button"
            onClick={onExportPdf}
            className="flex-1 py-2.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700"
          >
            تصدير PDF
          </button>
        </div>
      )}
      <p className="text-xs app-text-muted">
        يشمل الملخص، المتابعة الشهرية، والإعدادات — متاح فقط من هذا التبويب
      </p>
    </SettingsSection>

    <SettingsSection title="الحفظ والنسخ الاحتياطي" subtitle="SQLite والملفات الاحتياطية" icon="💾">
      <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg p-3">
        {storageSource === 'sql'
          ? '✓ يتم الحفظ في SQLite (data/taxi.db)'
          : '✓ حفظ في المتصفح — شغّل START-VIP-limousine-CARS.bat لتفعيل SQL'}
      </p>
      <div
        className={`rounded-lg p-3 text-sm border ${
          backupStatus.isOverdue
            ? 'bg-amber-50 border-amber-200 text-amber-900'
            : 'bg-green-50 border-green-200 text-green-800'
        }`}
      >
        {backupStatus.hasBackupBefore ? (
          backupStatus.isOverdue ? (
            <p>
              آخر نسخة: قبل{' '}
              <strong className="tabular-nums">{fmtInt(backupStatus.daysSinceBackup ?? 0)}</strong>{' '}
              يوم — حان وقت نسخة جديدة
            </p>
          ) : (
            <p>
              ✓ آخر نسخة: قبل{' '}
              <strong className="tabular-nums">{fmtInt(backupStatus.daysSinceBackup ?? 0)}</strong>{' '}
              يوم — التالية بعد{' '}
              <strong className="tabular-nums">{fmtInt(backupStatus.daysUntilDue ?? 0)}</strong> يوم
            </p>
          )
        ) : (
          <p>لم تُصدَّر نسخة بعد — صدّر JSON واحفظه على جهازك</p>
        )}
      </div>
      <p className="text-xs app-text-muted">
        السجلات: <span className="font-semibold tabular-nums">{fmtInt(entryCount)}</span> شهر
      </p>
      <button
        type="button"
        onClick={onExportBackup}
        className="w-full py-2.5 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900"
      >
        تصدير نسخة احتياطية (JSON)
      </button>
      <input
        ref={backupInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onImportBackup(file);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => backupInputRef.current?.click()}
        className="w-full py-2.5 rounded-lg border border-slate-300 text-slate-800 text-sm font-medium hover:bg-slate-50"
      >
        استيراد نسخة احتياطية (JSON)
      </button>
      {entryCount > 0 && (
        <div className="space-y-2 pt-2 border-t border-red-100">
          <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg p-3">
            ⚠ حذف السجلات الشهرية <strong>نهائي</strong>. يُطلب تأكيد مزدوج قبل التنفيذ.
          </p>
          <button
            type="button"
            onClick={onClearEntries}
            className="w-full py-2.5 rounded-lg border-2 border-red-300 text-red-700 text-sm font-semibold hover:bg-red-50"
          >
            حذف كل السجلات الشهرية
          </button>
        </div>
      )}
    </SettingsSection>
  </div>
);

/* ——— ROI / Break-even ——— */

const RoiSection: React.FC<{ roi: RoiAnalysis; settings: TaxiSettings }> = ({
  roi,
  settings,
}) => {
  const chartPoints = roi.chartData.filter(
    (pt) => pt.monthIndex % 6 === 1 || pt.monthIndex === roi.lifeMonths
  );

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
      <div>
        <h3 className="font-semibold text-slate-800">استرداد رأس المال</h3>
        <p className="text-sm text-slate-500 mt-1">
          تكلفة السيارة: {fmt(settings.vehicleCost)} د.أ — مدة الاستخدام:{' '}
          {fmtInt(settings.vehicleLifeYears)} سنوات ({fmtInt(roi.lifeMonths)} شهر) ثم الشطب
        </p>
      </div>

      {roi.monthsRecorded === 0 ? (
        <p className="text-slate-400 text-sm">أضف سجلات شهرية لحساب متى يعود رأس المال</p>
      ) : roi.avgMonthlyNet <= 0 ? (
        <p className="text-red-600 text-sm">
          صافي الربح الشهري سالب أو صفر — لا يمكن حساب استرداد رأس المال بهذا المعدل
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-xs text-slate-600">متوسط الصافي الشهري</p>
              <p className="text-xl font-bold text-blue-800 tabular-nums">
                {fmt(roi.avgMonthlyNet)} د.أ
              </p>
              <p className="text-xs text-slate-400 mt-1">من {fmtInt(roi.monthsRecorded)} شهر مسجّل</p>
            </div>
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
              <p className="text-xs text-slate-600">مدة استرداد رأس المال</p>
              <p className="text-xl font-bold text-indigo-800 tabular-nums">
                {fmtInt(roi.breakEvenMonths)} شهر
              </p>
              <p className="text-xs text-indigo-700 mt-1">≈ {roi.breakEvenDuration}</p>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
              <p className="text-xs text-slate-600">متوقع استرداد كامل بحلول</p>
              <p className="text-xl font-bold text-purple-800 tabular-nums">
                {roi.breakEvenPeriodLabel}
              </p>
              {roi.monthsRemainingToBreakEven > 0 && (
                <p className="text-xs text-slate-400 mt-1">
                  متبقي: {fmtInt(roi.monthsRemainingToBreakEven)} شهر
                </p>
              )}
            </div>
            <div
              className={`rounded-xl p-4 border ${
                roi.recoversWithinLife
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
              }`}
            >
              <p className="text-xs text-slate-600">قبل الشطب ({fmtInt(settings.vehicleLifeYears)} سنوات)</p>
              <p
                className={`text-lg font-bold ${
                  roi.recoversWithinLife ? 'text-green-700' : 'text-red-700'
                }`}
              >
                {roi.recoversWithinLife ? '✓ نعم — تسترد رأس المال' : '✗ لا — لن تسترد كاملاً'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
              <span className="text-slate-600">مجموع الصافي خلال {fmtInt(settings.vehicleLifeYears)} سنوات:</span>{' '}
              <strong className="text-slate-900 tabular-nums">{fmt(roi.totalProfitOverLife)} د.أ</strong>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
              <span className="text-slate-600">صافي الربح بعد استرداد التكلفة:</span>{' '}
              <strong
                className={`tabular-nums ${
                  roi.netGainAfterCost >= 0 ? 'text-green-700' : 'text-red-700'
                }`}
              >
                {fmt(roi.netGainAfterCost)} د.أ
              </strong>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartPoints} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => `${fmtInt(Math.round(v / 1000))}k`}
                />
                <Tooltip formatter={(v: number) => `${fmt(v)} د.أ`} />
                <ReferenceLine
                  y={roi.vehicleCost}
                  stroke="#dc2626"
                  strokeDasharray="5 5"
                  label={{ value: 'رأس المال', position: 'insideTopRight', fontSize: 11 }}
                />
                <Area
                  type="monotone"
                  dataKey="cumulative"
                  name="الصافي التراكمي"
                  stroke="#2563eb"
                  fill="#93c5fd"
                  fillOpacity={0.4}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-slate-400">
            الخط الأحمر = تكلفة السيارة ({fmt(roi.vehicleCost)} د.أ). عندما يتجاوز المنحنى الأزرق الخط
            الأحمر يكون رأس المال مسترداً.
          </p>
        </>
      )}
    </div>
  );
};

/* ——— Dashboard ——— */

const DashboardTab: React.FC<{
  totals: DashboardTotals;
  baseTotals: DashboardTotals;
  accidentSummary: ReturnType<typeof computeAccidentSummary>;
  licenseSummary: LicenseSummary;
  accidents: AccidentRecord[];
  chartData: { name: string; الإيراد: number; المصاريف: number }[];
  chartCaption?: string;
  entries: EntryComputed[];
  roi: RoiAnalysis;
  settings: TaxiSettings;
}> = ({
  totals,
  baseTotals,
  accidentSummary,
  licenseSummary,
  accidents,
  chartData,
  chartCaption,
  entries,
  roi,
  settings,
}) => (
  <div className="space-y-6">
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <StatCard
        label="إجمالي الإيرادات"
        value={totals.totalRevenue}
        color="text-green-700"
        tooltipTitle="كيف يُحسب إجمالي الإيرادات؟"
        tooltipLines={[
          { label: 'مجموع عمود الإيراد في كل شهر', amount: totals.totalRevenue },
          { label: 'عدد الأشهر المسجلة', count: entries.length },
        ]}
      />
      <StatCard
        label="إجمالي المصاريف"
        value={totals.totalExpenses}
        color="text-orange-700"
        tooltipTitle="كيف يُحسب إجمالي المصاريف؟"
        tooltipLines={[
          { label: 'مصاريف الشهور (جدول المتابعة)', amount: baseTotals.totalExpenses },
          ...(accidentSummary.totalCost > 0
            ? [{ label: 'إصلاح حوادث', amount: accidentSummary.totalCost, sign: '+' as const }]
            : []),
          ...(licenseSummary.totalPaid > 0
            ? [{ label: 'ترخيص سنوي', amount: licenseSummary.totalPaid, sign: '+' as const }]
            : []),
          { label: 'المجموع', amount: totals.totalExpenses, sign: '=', emphasize: true },
        ]}
      />
      <StatCard
        label="صافي الربح"
        value={totals.netProfit}
        color={totals.netProfit >= 0 ? 'text-blue-700' : 'text-red-700'}
        tooltipTitle="كيف يُحسب صافي الربح؟"
        tooltipLines={[
          {
            label: 'صافي الشهور (إيراد − مصاريف شهرية)',
            amount: baseTotals.netProfit,
          },
          ...(accidentSummary.totalCost > 0
            ? [{ label: 'إصلاح حوادث', amount: accidentSummary.totalCost, sign: '−' as const }]
            : []),
          ...(accidentSummary.totalInsuranceReceived > 0
            ? [
                {
                  label: 'تأمين مستلم',
                  amount: accidentSummary.totalInsuranceReceived,
                  sign: '+' as const,
                },
              ]
            : []),
          ...(licenseSummary.totalPaid > 0
            ? [{ label: 'ترخيص سنوي', amount: licenseSummary.totalPaid, sign: '−' as const }]
            : []),
          { label: 'صافي الربح', amount: totals.netProfit, sign: '=', emphasize: true },
        ]}
      />
      <StatCard
        label="مجموع المدفوع"
        value={totals.totalPaid}
        color="text-slate-800"
        tooltipTitle="كيف يُحسب مجموع المدفوع؟"
        tooltipLines={[
          { label: 'مجموع عمود «مدفوع» لكل شهر', amount: totals.totalPaid },
          {
            label: 'ملاحظة',
            note: 'ليس نفس الإيراد — يخص الضمان والتحصيل',
          },
        ]}
      />
      <StatCard
        label="مجموع المتبقي"
        value={totals.totalRemaining}
        color="text-red-600"
        tooltipTitle="كيف يُحسب المتبقي؟"
        tooltipLines={[
          { label: 'مجموع (الضمان − المدفوع) لكل شهر', amount: totals.totalRemaining },
          { label: 'أشهر متأخرة', count: totals.lateCount },
        ]}
      />
    </div>

    {(accidentSummary.count > 0 || accidentSummary.totalInsuranceReceived > 0) && (
      <div className="bg-white border border-amber-200 rounded-xl p-5 shadow-sm space-y-4">
        <h3 className="font-semibold text-slate-800">الحوادث والتأمين</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 text-center">
            <p className="text-xs text-slate-600">تكاليف الحوادث</p>
            <p className="text-lg font-bold text-orange-800 tabular-nums">
              {fmt(accidentSummary.totalCost)}
            </p>
          </div>
          <div className="bg-green-50 border border-green-100 rounded-lg p-3 text-center">
            <p className="text-xs text-slate-600">تأمين مستلم</p>
            <p className="text-lg font-bold text-green-800 tabular-nums">
              {fmt(accidentSummary.totalInsuranceReceived)}
            </p>
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-center">
            <p className="text-xs text-slate-600">قيد الانتظار</p>
            <p className="text-lg font-bold text-amber-800 tabular-nums">
              {fmtInt(accidentSummary.totalPending)}
            </p>
            <p className="text-[10px] text-slate-500">حادث بلا مستلم تأمين</p>
          </div>
          <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 text-center">
            <p className="text-xs text-slate-600">مجموع المطالبة</p>
            <p className="text-lg font-bold text-indigo-800 tabular-nums">
              {fmt(accidentSummary.totalClaimAmount)}
            </p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
            <p className="text-xs text-slate-600 font-semibold">صافي بعد الحوادث والتأمين</p>
            <p
              className={`text-lg font-bold tabular-nums ${
                accidentSummary.adjustedNetProfit >= 0 ? 'text-blue-800' : 'text-red-700'
              }`}
            >
              {fmt(accidentSummary.adjustedNetProfit)}
            </p>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          صافي الشهور ({fmt(baseTotals.netProfit)}) + تأمين ({fmt(accidentSummary.totalInsuranceReceived)})
          − إصلاح ({fmt(accidentSummary.totalCost)}) = {fmt(accidentSummary.adjustedNetProfit)} — حوادث:{' '}
          {fmtInt(accidentSummary.count)} — تعطل: {fmtInt(accidentSummary.totalDowntimeDays)} يوم
        </p>
        {accidents.length > 0 && (
          <ul className="text-sm space-y-2 border-t border-slate-100 pt-3 max-h-40 overflow-y-auto">
            {[...accidents]
              .sort(
                (a, b) =>
                  new Date(b.accidentDate).getTime() - new Date(a.accidentDate).getTime()
              )
              .map((a) => (
                <li key={a.id} className="flex flex-wrap justify-between gap-2 text-slate-700">
                  <span>
                    <span className="font-medium tabular-nums">{a.accidentDate}</span>
                    {a.details ? ` — ${a.details}` : ''}
                  </span>
                  <span className="tabular-nums text-orange-700">{fmt(a.cost)} د.أ</span>
                </li>
              ))}
          </ul>
        )}
      </div>
    )}

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
        <p className="text-2xl font-bold text-green-700 tabular-nums">{fmtInt(totals.paidCount)}</p>
        <p className="text-sm text-green-800">شهر مدفوع</p>
      </div>
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
        <p className="text-2xl font-bold text-red-700 tabular-nums">{fmtInt(totals.lateCount)}</p>
        <p className="text-sm text-red-800">شهر متأخر</p>
      </div>
    </div>

    <RoiSection roi={roi} settings={settings} />

    {totals.expenseByCategory.grandTotal > 0 && (
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h3 className="font-semibold text-slate-800 mb-4">تفاصيل المصاريف (إجمالي)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          {REPORT_EXPENSE_KEYS.map((key) => {
            const val = totals.expenseByCategory[key];
            if (val <= 0) return null;
            return (
              <div key={key} className="bg-orange-50 border border-orange-100 rounded-lg p-3 text-center">
                <p className="text-xs text-slate-600">{EXPENSE_FIELD_LABELS[key]}</p>
                <p className="text-lg font-bold text-orange-800 tabular-nums">{fmt(val)}</p>
              </div>
            );
          })}
          <div className="bg-orange-100 border border-orange-200 rounded-lg p-3 text-center">
            <p className="text-xs text-slate-600 font-semibold">المجموع</p>
            <p className="text-lg font-bold text-orange-900 tabular-nums">
              {fmt(totals.expenseByCategory.grandTotal)}
            </p>
          </div>
        </div>
      </div>
    )}

    {chartData.length > 0 && (
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <h3 className="font-semibold text-slate-800">الإيراد مقابل المصاريف</h3>
          {chartCaption && <p className="text-xs text-slate-500">{chartCaption}</p>}
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmt(v)} />
              <Tooltip formatter={(v: number) => `${fmt(v)} د.أ`} />
              <Legend />
              <Bar dataKey="الإيراد" fill="#16a34a" radius={[4, 4, 0, 0]} />
              <Bar dataKey="المصاريف" fill="#ea580c" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    )}

    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <h3 className="font-semibold text-slate-800 mb-3">هل السائق ملتزم؟</h3>
      {entries.length === 0 ? (
        <p className="text-slate-400 text-sm">أضف سجلات شهرية لرؤية التقييم</p>
      ) : totals.lateCount === 0 ? (
        <p className="text-green-700 font-medium">✓ السائق ملتزم — كل الأشهر مدفوعة</p>
      ) : (
        <p className="text-red-700 font-medium">
          ⚠ يوجد {fmtInt(totals.lateCount)} شهر/أشهر متأخرة — المتبقي الإجمالي:{' '}
          {fmt(totals.totalRemaining)} د.أ
        </p>
      )}
      <h3 className="font-semibold text-slate-800 mt-4 mb-2">هل السيارة مربحة؟</h3>
      {totals.netProfit > 0 ? (
        <p className="text-green-700 font-medium">✓ نعم — صافي الربح: {fmt(totals.netProfit)} د.أ</p>
      ) : totals.netProfit < 0 ? (
        <p className="text-red-700 font-medium">✗ خسارة — الصافي: {fmt(totals.netProfit)} د.أ</p>
      ) : (
        <p className="text-slate-600">متعادل — لا ربح ولا خسارة</p>
      )}
    </div>
  </div>
);

type StatTooltipLine = {
  label: string;
  amount?: number;
  count?: number;
  sign?: '+' | '−' | '=';
  emphasize?: boolean;
  note?: string;
};

const StatCard: React.FC<{
  label: string;
  value: number;
  color: string;
  tooltipTitle?: string;
  tooltipLines?: StatTooltipLine[];
}> = ({ label, value, color, tooltipTitle, tooltipLines }) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [tipPos, setTipPos] = useState<{ top: number; left: number } | null>(null);
  const hasTooltip = Boolean(tooltipTitle && tooltipLines?.length);

  const updateTipPos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const menuWidth = Math.min(260, window.innerWidth - 16);
    const isRtl = document.getElementById('taxi-app')?.dir === 'rtl';
    const left = isRtl
      ? Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8))
      : Math.min(window.innerWidth - menuWidth - 8, rect.left);
    setTipPos({ top: rect.bottom + 8, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    updateTipPos();
    const onScrollOrResize = () => updateTipPos();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, updateTipPos]);

  const tooltipPanel =
    open &&
    hasTooltip &&
    tipPos &&
    createPortal(
      <div
        className="claim-cell-tooltip-panel claim-cell-tooltip-panel--portal stat-card-tooltip-panel"
        data-theme={getTaxiDisplayTheme()}
        role="tooltip"
        style={{
          position: 'fixed',
          top: tipPos.top,
          left: tipPos.left,
          width: Math.min(260, window.innerWidth - 16),
          zIndex: 300,
          pointerEvents: 'none',
        }}
      >
        <div className="claim-cell-tooltip-title">{tooltipTitle}</div>
        <div className="claim-cell-tooltip-body stat-card-tooltip-body">
          {tooltipLines!.map((line, i) =>
            line.note ? (
              <div key={i} className="stat-card-tooltip-note">
                {line.label}: {line.note}
              </div>
            ) : (
              <div
                key={i}
                className={`stat-card-tooltip-line${line.emphasize ? ' stat-card-tooltip-line--total' : ''}`}
              >
                <span className="stat-card-tooltip-line-label">
                  {line.sign === '+' && <span className="text-green-600">+ </span>}
                  {line.sign === '−' && <span className="text-red-600">− </span>}
                  {line.sign === '=' && <span className="text-slate-700">= </span>}
                  {line.label}
                </span>
                <span className="tabular-nums font-medium shrink-0">
                  {line.count != null ? fmtInt(line.count) : `${fmt(line.amount ?? 0)} د.أ`}
                </span>
              </div>
            )
          )}
        </div>
      </div>,
      document.body
    );

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <div
        ref={triggerRef}
        className={`stat-card-label-row${hasTooltip ? ' stat-card-label-row--has-tip' : ''}`}
        onMouseEnter={() => {
          if (!hasTooltip) return;
          updateTipPos();
          setOpen(true);
        }}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => {
          if (!hasTooltip) return;
          updateTipPos();
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        tabIndex={hasTooltip ? 0 : undefined}
        role={hasTooltip ? 'button' : undefined}
        aria-label={hasTooltip ? `${label} — اعرض طريقة الحساب` : undefined}
      >
        <p className="text-xs text-slate-500">{label}</p>
        {hasTooltip && (
          <span className="stat-card-info-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
          </span>
        )}
      </div>
      <p className={`text-xl font-bold tabular-nums ${color}`}>{fmt(value)} د.أ</p>
      {hasTooltip && (
        <p className="text-[10px] text-slate-400 mt-1">مرّر للتفاصيل</p>
      )}
      {tooltipPanel}
    </div>
  );
};

export default TaxiTrackerApp;
