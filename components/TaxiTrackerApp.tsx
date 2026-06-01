import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import ProfileMenu from './ProfileMenu';
import UsersAdminPanel from './UsersAdminPanel';
import VehicleAssignmentSettings from './VehicleAssignmentSettings';
import DeletionApprovalsPanel, { DeletionApprovalsButton } from './DeletionApprovalsPanel';
import HomeSettingsTab from './HomeSettingsTab';
import { DisplayPreferencesPanel, SettingsSection } from './SettingsUi';
import MonthlyEntryConfirmModal from './MonthlyEntryConfirmModal';
import type { UiLanguage } from './TaxiLogin';
import type { UserSession } from '../utils/taxiAuth';
import {
  canClearAllEntries,
  canDeleteVehicle,
  canImportBackup,
  canManageUsers,
  canReassignVehicle,
  canReviewDeletions,
  isAdmin,
  vehicleVisibleToUser,
} from '../utils/permissions';
import { gateDeletion } from '../utils/deletionGate';
import {
  fetchPendingDeletionCount,
  type DeletionRequestRecord,
} from '../utils/deletionRequestsApi';
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
  DRIVER_PAYMENT_LABELS,
} from '../taxiTypes';
import { emptyAppState } from '../utils/taxiPersistence';
import {
  loadFleet,
  loadFleetFromLocal,
  loadVehicleState,
  peekVehicleStateLocal,
  scheduleSaveVehicleState,
  flushSaveVehicleState,
  createVehicle,
  removeVehicle,
  updateFleetIndexVehicleMeta,
  saveFleetGlobalSettings,
  type StorageSource,
} from '../utils/taxiFleetPersistence';
import AppModal, { AppModalBody, AppModalFooter, AppModalHeader } from './AppModal';
import VehicleGarage from './VehicleGarage';
import OilChangeDialog from './OilChangeDialog';
import OilMaintenanceTab from './OilMaintenanceTab';
import ConfirmDialog from './ConfirmDialog';
import AppToast, { type AppToastTone } from './AppToast';
import type { FleetData, FleetGlobalSettings, VehicleCreateInput } from '../taxiTypes';
import { appDir, loadingCopy } from '../utils/uiCopy';
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
import { sumOilChangeCosts } from '../utils/taxiOilChange';
import { formatNumber, formatInteger } from '../utils/taxiFormat';
import {
  fileToVehicleImageDataUrl,
  hasVehicleImage,
  VEHICLE_IMAGE_REQUIRED_MSG,
} from '../utils/vehicleImage';
import {
  TRACKING_PAGE_SIZE,
  LIST_TABLE_PAGE_SIZE,
  EMPTY_ENTRY_FILTERS,
  EntryFilters,
  filterEntries,
  sortEntriesByMonth,
  paginateEntries,
  findEntryPage,
  getUniqueDriverNames,
  loadTrackingViewMode,
  loadTrackingSortOrder,
  TRACKING_VIEW_STORAGE_KEY,
  TRACKING_SORT_STORAGE_KEY,
  type TrackingViewMode,
  type EntrySortOrder,
} from '../utils/taxiEntryFilters';
import { useFitPageSize } from '../utils/useFitPageSize';
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
  resolvePaymentStatus,
  paymentStatusBadgeClass,
} from '../utils/taxiCalculations';
import {
  normalizeDriverPayments,
  sumDriverPayments,
  splitRevenueToInstallments,
  entryTotalDue,
  type DriverPaymentTriple,
} from '../utils/taxiDriverPayments';

type Tab = 'tracking' | 'dashboard' | 'insurance' | 'licenses' | 'oil' | 'settings';
type HomeTab = 'fleet' | 'settings';

const emptyForm = (defaultAmount = 750): Omit<MonthlyEntry, 'id'> => ({
  date: new Date().toISOString().slice(0, 7) + '-01',
  month: '',
  driverName: '',
  revenue: defaultAmount,
  expenses: 0,
  expenseDetails: { ...EMPTY_EXPENSES },
  notes: '',
  driverPaid: 0,
  driverPayments: [0, 0, 0],
  paymentComplete: false,
});

const fmt = formatNumber;
const fmtInt = formatInteger;

const VehicleHeaderBrand: React.FC<{
  vehicleLabel: string;
  ownerName?: string;
  onLabelChange: (label: string) => void;
}> = ({ vehicleLabel, ownerName, onLabelChange }) => {
  const labelInputRef = useRef<HTMLInputElement>(null);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(vehicleLabel);
  useEffect(() => {
    if (!editingLabel) setLabelDraft(vehicleLabel);
  }, [vehicleLabel, editingLabel]);

  useEffect(() => {
    if (editingLabel) labelInputRef.current?.focus();
  }, [editingLabel]);

  const commitLabel = () => {
    const trimmed = labelDraft.trim();
    if (trimmed && trimmed !== vehicleLabel) {
      onLabelChange(trimmed);
    } else {
      setLabelDraft(vehicleLabel);
    }
    setEditingLabel(false);
  };

  const startEditLabel = () => {
    setLabelDraft(vehicleLabel);
    setEditingLabel(true);
  };

  return (
    <div className="vehicle-header-brand flex items-center gap-2 min-w-0">
      <div className="vehicle-header-title-wrap min-w-0 flex-1">
        {editingLabel ? (
          <input
            ref={labelInputRef}
            type="text"
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitLabel();
              }
              if (e.key === 'Escape') {
                setLabelDraft(vehicleLabel);
                setEditingLabel(false);
              }
            }}
            className="vehicle-header-title-input w-full text-base sm:text-lg font-bold text-slate-900 border border-blue-300 rounded-lg px-2 py-0.5 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
            aria-label="اسم السيارة"
            maxLength={120}
          />
        ) : (
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <h1
              className="text-base sm:text-lg font-bold text-slate-900 truncate cursor-pointer hover:text-blue-700 leading-tight"
              onClick={startEditLabel}
              title="انقر لتغيير اسم السيارة"
            >
              {vehicleLabel || 'متابعة سيارة أجرة'}
            </h1>
            {ownerName && (
              <span className="vehicle-owner-tag shrink-0" title="مالك السيارة">
                {ownerName}
              </span>
            )}
            <button
              type="button"
              onClick={startEditLabel}
              className="vehicle-header-rename-btn shrink-0 p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg"
              aria-label="تغيير اسم السيارة"
              title="تغيير اسم السيارة"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="w-4 h-4"
                aria-hidden
              >
                <path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const VehicleImageSettingsField: React.FC<{
  vehicleImage?: string;
  onImageChange: (image: string) => void;
  lang: UiLanguage;
}> = ({ vehicleImage, onImageChange, lang }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState('');

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await fileToVehicleImageDataUrl(file);
      onImageChange(dataUrl);
      setUploadError('');
    } catch (err) {
      setUploadError(
        err instanceof Error
          ? err.message
          : lang === 'ar'
            ? 'تعذّر رفع الصورة'
            : 'Could not upload image'
      );
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="vehicle-settings-photo flex flex-wrap items-center gap-3">
      {vehicleImage ? (
        <img
          src={vehicleImage}
          alt=""
          className="w-16 h-12 object-cover rounded-lg border border-slate-200"
        />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className={`px-3 py-1.5 text-sm border rounded-lg hover:bg-slate-50 ${
            uploadError ? 'border-red-400 bg-red-50' : 'border-slate-300'
          }`}
        >
          {vehicleImage
            ? lang === 'ar'
              ? 'تغيير الصورة'
              : 'Change image'
            : lang === 'ar'
              ? 'رفع صورة السيارة'
              : 'Upload vehicle photo'}
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      {uploadError && (
        <p className="w-full text-xs text-red-600" role="alert">
          {uploadError}
        </p>
      )}
      <p className="w-full text-xs app-text-muted">
        {lang === 'ar'
          ? 'تظهر على بطاقة السيارة في صفحة الأسطول فقط — ليست في شريط العنوان أعلاه.'
          : 'Shown on the garage card only — not in the header bar above.'}
      </p>
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
    case 'settings':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
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
  const [authError, setAuthError] = useState(false);
  const [tab, setTab] = useState<Tab>('tracking');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingEntry, setPendingEntry] = useState<MonthlyEntry | null>(null);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [successMessage, setSuccessMessage] = useState('تم الحفظ بنجاح و اضافة المبلغ');
  const [isExporting, setIsExporting] = useState(false);
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);
  const [pendingDeletionCount, setPendingDeletionCount] = useState(0);
  const [homeTab, setHomeTab] = useState<HomeTab>('fleet');
  const [showDisplayPanel, setShowDisplayPanel] = useState(false);
  const [oilDialogOpen, setOilDialogOpen] = useState(false);
  const [standaloneOilEdit, setStandaloneOilEdit] = useState<OilChangeRecord | 'new' | null>(
    null
  );
  const [toast, setToast] = useState<{ message: string; tone: AppToastTone } | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [importBackupConfirm, setImportBackupConfirm] = useState<{
    file: File;
    currentCount: number;
    importedCount: number;
  } | null>(null);
  const [entryFormError, setEntryFormError] = useState('');
  const skipSaveRef = useRef(true);

  const showToast = useCallback((message: string, tone: AppToastTone = 'info') => {
    setToast({ message, tone });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  const notifyDeletion = useCallback(
    (message: string, tone: AppToastTone = 'info') => showToast(message, tone),
    [showToast]
  );

  const filterFleetForSession = useCallback(
    (data: FleetData): FleetData => ({
      ...data,
      vehicles: data.vehicles.filter((v) => vehicleVisibleToUser(v, session)),
    }),
    [session]
  );

  const refreshFleet = useCallback(async () => {
    const { fleet: loaded, source, authError: auth, apiUnreachable } = await loadFleet();
    setAuthError(Boolean(auth));
    if (auth) {
      setLoadError(
        lang === 'ar'
          ? 'انتهت الجلسة — سجّل الدخول مرة أخرى (admin / كلمة المرور)'
          : 'Session expired — please sign in again'
      );
    } else if (apiUnreachable && !loaded?.vehicles.length) {
      setLoadError(
        lang === 'ar'
          ? 'الخادم يعمل لكن تعذّر تحميل البيانات — تحقق من PostgreSQL و npm run db:init'
          : 'Server is up but data failed to load — check PostgreSQL and npm run db:init'
      );
    } else {
      setLoadError(null);
    }
    const filtered = loaded ? filterFleetForSession(loaded) : loaded;
    setFleet(filtered);
    setStorageSource(source);
    return filtered;
  }, [filterFleetForSession, lang]);

  useEffect(() => {
    const cached = loadFleetFromLocal();
    if (cached) {
      setFleet(filterFleetForSession(cached));
      setIsLoading(false);
    }

    let cancelled = false;
    void refreshFleet()
      .then(() => {
        if (cancelled) return;
        setLoadError(null);
      })
      .catch(() => {
        if (cancelled) return;
        if (!cached) {
          setLoadError(
            lang === 'ar' ? 'تعذّر تحميل الأسطول' : 'Could not load fleet'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshFleet, filterFleetForSession]);

  const refreshPendingDeletionCount = useCallback(() => {
    if (!canReviewDeletions(session)) return;
    void fetchPendingDeletionCount().then(setPendingDeletionCount);
  }, [session]);

  useEffect(() => {
    refreshPendingDeletionCount();
  }, [refreshPendingDeletionCount]);

  const handleDeletionReviewed = useCallback(
    async (req: DeletionRequestRecord) => {
      if (req.requestType === 'vehicle') {
        const updated = await refreshFleet();
        if (selectedVehicleId === req.vehicleId) {
          setSelectedVehicleId(null);
        }
        setFleet(updated);
        return;
      }
      if (selectedVehicleId === req.vehicleId) {
        const { state: fresh } = await loadVehicleState(req.vehicleId);
        setState(fresh);
        skipSaveRef.current = true;
      }
      await refreshFleet();
    },
    [selectedVehicleId, refreshFleet]
  );

  useEffect(() => {
    if (!selectedVehicleId) return;
    let cancelled = false;
    skipSaveRef.current = true;
    setEditingId(null);
    setShowForm(false);

    const cached = peekVehicleStateLocal(selectedVehicleId);
    if (cached) {
      setState(cached);
      setVehicleLoading(false);
    } else {
      setVehicleLoading(true);
    }

    void loadVehicleState(selectedVehicleId)
      .then(({ state: loaded, source }) => {
        if (cancelled) return;
        setState(loaded);
        setStorageSource(source);
        setTab('tracking');
      })
      .catch(() => {
        if (cancelled) return;
        if (!cached) {
          showToast(
            lang === 'ar' ? 'تعذّر تحميل بيانات السيارة' : 'Could not load vehicle data',
            'error'
          );
          setSelectedVehicleId(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setVehicleLoading(false);
          skipSaveRef.current = false;
        }
      });
    return () => {
      cancelled = true;
      skipSaveRef.current = true;
    };
  }, [selectedVehicleId]);

  useEffect(() => {
    if (isLoading || vehicleLoading || !selectedVehicleId || skipSaveRef.current) return;
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
      try {
        await flushSaveVehicleState(selectedVehicleId, state);
      } catch (err) {
        showToast(
          err instanceof Error
            ? err.message
            : lang === 'ar'
              ? 'تعذّر حفظ بيانات السيارة'
              : 'Could not save vehicle data',
          'error'
        );
        return;
      }
    }
    setSelectedVehicleId(null);
    void refreshFleet().then(setFleet);
  };

  const handleAddVehicle = async (input: VehicleCreateInput): Promise<string> => {
    const id = await createVehicle(input);
    const updated = await refreshFleet();
    setFleet(updated);
    return id;
  };

  const handleDeleteVehicle = async (vehicleId: string): Promise<boolean> => {
    const v = fleet?.vehicles.find((x) => x.id === vehicleId);
    const summary =
      lang === 'ar'
        ? `حذف السيارة: ${v?.label ?? vehicleId}`
        : `Delete vehicle: ${v?.label ?? vehicleId}`;

    let success = false;
    await gateDeletion(
      session,
      lang,
      {
        vehicleId,
        requestType: 'vehicle',
        targetId: vehicleId,
        summary,
        details: { label: v?.label },
      },
      async () => {
        const ok = await removeVehicle(vehicleId);
        if (!ok) {
          showToast(
            lang === 'ar'
              ? 'تعذّر الحذف — يجب بقاء سيارة واحدة على الأقل'
              : 'Cannot delete — at least one vehicle must remain',
            'error'
          );
          return;
        }
        const updated = await refreshFleet();
        setFleet(updated);
        success = true;
      },
      notifyDeletion
    );
    if (!success && canReviewDeletions(session)) return false;
    return success || !canReviewDeletions(session);
  };

  const currentVehicleMeta = fleet?.vehicles.find((v) => v.id === selectedVehicleId);

  const globalSettings: FleetGlobalSettings =
    fleet?.globalSettings ?? {
      fontSize: settings.fontSize,
      displayTheme: settings.displayTheme,
      boldNumbers: settings.boldNumbers,
      largeButtons: settings.largeButtons,
      comfortableReading: settings.comfortableReading,
    };

  const applyGlobalSettings = useCallback((g: FleetGlobalSettings) => {
    setFleet((f) => (f ? { ...f, globalSettings: g } : f));
    saveFleetGlobalSettings(g);
  }, []);

  const handleExportBackup = () => {
    exportBackupJson(state, settings.vehicleLabel || 'taxi');
    setBackupBannerDismissed(true);
    setBackupTick((t) => t + 1);
  };

  const showBackupReminder =
    entries.length > 0 && backupStatus.isOverdue && !backupBannerDismissed;

  const handleImportBackup = async (file: File) => {
    if (!canImportBackup(session)) {
      showToast(
        lang === 'ar'
          ? 'استيراد النسخة الاحتياطية متاح للمدير فقط'
          : 'Only administrators can import backups',
        'error'
      );
      return;
    }
    try {
      const text = await file.text();
      const imported = parseBackupJson(text);
      setImportBackupConfirm({
        file,
        currentCount: entries.length,
        importedCount: imported.entries.length,
      });
    } catch {
      showToast(
        lang === 'ar'
          ? 'فشل استيراد الملف — تأكد أنه ملف JSON صادر من هذا التطبيق'
          : 'Import failed — use a JSON backup exported from this app',
        'error'
      );
    }
  };

  const confirmImportBackup = async () => {
    if (!importBackupConfirm) return;
    try {
      const text = await importBackupConfirm.file.text();
      const imported = parseBackupJson(text);
      persist({
        settings: { ...settings, ...imported.settings },
        entries: imported.entries,
        accidents: imported.accidents ?? [],
        licenses: imported.licenses ?? [],
      });
      setEditingId(null);
      setShowForm(false);
      setImportBackupConfirm(null);
      showToast(
        lang === 'ar'
          ? 'تم استيراد النسخة الاحتياطية بنجاح'
          : 'Backup imported successfully',
        'success'
      );
      setBackupTick((t) => t + 1);
    } catch {
      showToast(
        lang === 'ar'
          ? 'فشل استيراد الملف — تأكد أنه ملف JSON صادر من هذا التطبيق'
          : 'Import failed — use a JSON backup exported from this app',
        'error'
      );
      setImportBackupConfirm(null);
    }
  };

  const executeClearAllEntries = async () => {
    if (!selectedVehicleId) return;
    await gateDeletion(
      session,
      lang,
      {
        vehicleId: selectedVehicleId,
        requestType: 'clear_all_entries',
        summary:
          lang === 'ar'
            ? `حذف كل السجلات الشهرية (${entries.length}) — ${settings.vehicleLabel}`
            : `Clear all monthly entries (${entries.length}) — ${settings.vehicleLabel}`,
        details: { count: entries.length },
      },
      () => {
        persist({ ...state, entries: [] });
        setEditingId(null);
        setShowForm(false);
        setShowDeleteAllDialog(false);
        setSuccessMessage(
          lang === 'ar' ? 'تم حذف كل السجلات الشهرية' : 'All monthly entries deleted'
        );
        setShowSuccessDialog(true);
      },
      notifyDeletion
    );
    setShowDeleteAllDialog(false);
  };

  const openAdd = () => {
    const today = new Date().toISOString().slice(0, 10);
    setEditingId(null);
    setEntryFormError('');
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
    setEntryFormError('');
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
      driverPaid: computed.driverPaid,
      driverPayments: [...computed.driverPayments],
      paymentComplete: Boolean(entry.paymentComplete),
    });
    setShowForm(true);
  };

  const handleMonthPickerChange = (ym: string) => {
    if (!ym) return;
    const date = `${ym}-01`;
    setEntryFormError('');
    setForm((f) => ({ ...f, date, month: formatMonthLabel(date) }));
  };

  const finishEntrySave = (
    entry: MonthlyEntry,
    nextEntries: MonthlyEntry[],
    wasEdit: boolean
  ) => {
    persist({ ...state, entries: nextEntries });
    setShowForm(false);
    setShowConfirmDialog(false);
    setPendingEntry(null);
    setEditingId(null);
    setSuccessMessage(
      wasEdit ? 'تم حفظ التعديلات بنجاح' : 'تم الحفظ بنجاح و اضافة المبلغ'
    );
    setShowSuccessDialog(true);
  };

  const buildEntryFromForm = (): MonthlyEntry | null => {
    const expenseDetails = {
      ...normalizeExpenseDetails(form.expenseDetails, form.expenses),
      oil: 0,
    };
    const expenses = sumExpenses(expenseDetails);
    const existing = editingId ? entries.find((x) => x.id === editingId) : undefined;
    const driverPayments = normalizeDriverPayments(
      form.driverPayments,
      undefined,
      form.revenue
    );
    const driverPaid = sumDriverPayments(driverPayments);
    const entry: MonthlyEntry = {
      id: editingId ?? Date.now().toString(),
      ...form,
      expenseDetails,
      expenses,
      driverPayments,
      driverPaid,
      paymentComplete: form.paymentComplete ?? false,
      month: formatMonthLabel(form.date),
      driverName: form.driverName.trim() || settings.currentDriverName || '—',
      monthlyGuarantee: existing?.monthlyGuarantee ?? guarantee,
    };

    const duplicate = entries.some(
      (x) => x.id !== editingId && monthKey(x.date) === monthKey(entry.date)
    );
    if (duplicate) {
      setEntryFormError(
        lang === 'ar'
          ? 'يوجد سجل لهذا الشهر مسبقاً. عدّل السجل الحالي أو اختر شهراً آخر.'
          : 'An entry for this month already exists. Edit it or choose another month.'
      );
      return null;
    }

    return entry;
  };

  const handleSaveEntry = (e: React.FormEvent) => {
    e.preventDefault();
    setEntryFormError('');
    const entry = buildEntryFromForm();
    if (!entry) return;
    setPendingEntry(entry);
    setShowConfirmDialog(true);
  };

  const handleConfirmSave = () => {
    if (!pendingEntry) return;
    const wasEdit = Boolean(editingId);
    const nextEntries = editingId
      ? entries.map((x) => (x.id === editingId ? pendingEntry : x))
      : [...entries, pendingEntry];
    finishEntrySave(pendingEntry, nextEntries, wasEdit);
  };

  const closeEntryForm = () => {
    setShowForm(false);
    setShowConfirmDialog(false);
    setPendingEntry(null);
    setEditingId(null);
    setEntryFormError('');
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

  const handleDeleteOilRecord = async (id: string) => {
    if (!selectedVehicleId) return;
    const rec = oilChanges.find((o) => o.id === id);
    await gateDeletion(
      session,
      lang,
      {
        vehicleId: selectedVehicleId,
        requestType: 'oil_change',
        targetId: id,
        summary:
          lang === 'ar'
            ? `حذف سجل زيت ${rec?.changeDate ?? ''}`
            : `Delete oil record ${rec?.changeDate ?? ''}`,
        details: { changeDate: rec?.changeDate },
      },
      () => {
        persist({ ...state, oilChanges: oilChanges.filter((o) => o.id !== id) });
      },
      notifyDeletion
    );
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      await exportTaxiToExcel(computedEntries, settings, totals, roi);
    } catch {
      showToast(
        lang === 'ar' ? 'فشل تصدير Excel' : 'Excel export failed',
        'error'
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPdf = () => {
    try {
      exportTaxiToPdf(computedEntries, settings, totals, roi);
    } catch (err) {
      showToast(
        err instanceof Error && err.message === 'POPUP_BLOCKED'
          ? lang === 'ar'
            ? 'يرجى السماح بالنوافذ المنبثقة لتصدير PDF'
            : 'Allow pop-ups to export PDF'
          : lang === 'ar'
            ? 'فشل تصدير PDF'
            : 'PDF export failed',
        'error'
      );
    }
  };

  const handleDeleteEntry = async (id: string) => {
    if (!selectedVehicleId) return;
    const entry = entries.find((x) => x.id === id);
    await gateDeletion(
      session,
      lang,
      {
        vehicleId: selectedVehicleId,
        requestType: 'entry',
        targetId: id,
        summary:
          lang === 'ar'
            ? `حذف سجل شهر ${entry?.month || entry?.date || ''}`
            : `Delete monthly entry ${entry?.month || entry?.date || ''}`,
        details: { month: entry?.month, date: entry?.date },
      },
      () => {
        persist({
          ...state,
          entries: entries.filter((x) => x.id !== id),
          oilChanges: oilChanges.filter((o) => o.entryId !== id),
        });
      },
      notifyDeletion
    );
  };

  const handleDeleteAccident = async (id: string) => {
    if (!selectedVehicleId) return;
    const a = accidents.find((x) => x.id === id);
    await gateDeletion(
      session,
      lang,
      {
        vehicleId: selectedVehicleId,
        requestType: 'accident',
        targetId: id,
        summary:
          lang === 'ar'
            ? `حذف حادث ${a?.accidentDate ?? ''}`
            : `Delete accident ${a?.accidentDate ?? ''}`,
        details: { accidentDate: a?.accidentDate },
      },
      () => {
        persistImmediate((prev) => ({
          ...prev,
          accidents: prev.accidents.filter((x) => x.id !== id),
        }));
      },
      notifyDeletion
    );
  };

  const handleDeleteLicense = async (id: string) => {
    if (!selectedVehicleId) return;
    const l = licenses.find((x) => x.id === id);
    await gateDeletion(
      session,
      lang,
      {
        vehicleId: selectedVehicleId,
        requestType: 'license',
        targetId: id,
        summary:
          lang === 'ar'
            ? `حذف ترخيص ${l?.licenseYear ?? ''}`
            : `Delete license ${l?.licenseYear ?? ''}`,
        details: { licenseYear: l?.licenseYear },
      },
      () => {
        persistImmediate((prev) => ({
          ...prev,
          licenses: prev.licenses.filter((x) => x.id !== id),
        }));
      },
      notifyDeletion
    );
  };

  const handleSetPaymentComplete = (id: string, complete: boolean) => {
    persist({
      ...state,
      entries: entries.map((x) =>
        x.id === id ? { ...x, paymentComplete: complete } : x
      ),
    });
  };

  const applyFullPaymentToEntry = (entry: MonthlyEntry): MonthlyEntry => {
    const driverPayments = splitRevenueToInstallments(entry.revenue);
    const driverPaid = sumDriverPayments(driverPayments);
    return {
      ...entry,
      driverPayments,
      driverPaid,
      paymentComplete: false,
    };
  };

  const handleConfirmPayFullAmount = (entry: MonthlyEntry) => {
    persist({
      ...state,
      entries: entries.map((x) => (x.id === entry.id ? applyFullPaymentToEntry(x) : x)),
    });
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'tracking', label: lang === 'ar' ? 'المتابعة الشهرية' : 'Monthly tracking' },
    { id: 'dashboard', label: lang === 'ar' ? 'الملخص' : 'Summary' },
    { id: 'oil', label: lang === 'ar' ? 'متابعة الزيت' : 'Oil maintenance' },
    { id: 'insurance', label: lang === 'ar' ? 'التأمين والحوادث' : 'Insurance & accidents' },
    { id: 'licenses', label: lang === 'ar' ? 'الترخيص السنوي' : 'Annual license' },
    { id: 'settings', label: lang === 'ar' ? 'الإعدادات' : 'Settings' },
  ];

  if (isLoading) {
    return (
      <div
        id="taxi-app"
        className="min-h-screen bg-slate-100 flex items-center justify-center"
        dir={appDir(lang)}
      >
        <div className="text-center p-8">
          <p className="text-slate-600 text-lg">{loadingCopy[lang].fleet}</p>
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
        className="app-layout app-compact bg-slate-100"
        dir={appDir(lang)}
      >
        {toast && (
          <AppToast
            message={toast.message}
            tone={toast.tone}
            onDismiss={dismissToast}
            dir={appDir(lang)}
          />
        )}
        <ConfirmDialog
          open={showLogoutConfirm}
          title={lang === 'ar' ? 'تسجيل الخروج' : 'Sign out'}
          message={lang === 'ar' ? 'هل تريد تسجيل الخروج؟' : 'Do you want to sign out?'}
          confirmLabel={lang === 'ar' ? 'نعم، خروج' : 'Yes, sign out'}
          cancelLabel={lang === 'ar' ? 'إلغاء' : 'Cancel'}
          variant="neutral"
          dir={appDir(lang)}
          showIrreversibleNote={false}
          onCancel={() => setShowLogoutConfirm(false)}
          onConfirm={() => {
            setShowLogoutConfirm(false);
            onLogout();
          }}
        />
        <header className="app-layout__header app-header bg-white border-b border-slate-200 z-40">
          <div className="max-w-5xl mx-auto px-3 sm:px-4 py-2 flex items-center justify-between gap-3">
            <h1 className="text-sm sm:text-base font-bold text-slate-900 truncate">VIP limousine CARS</h1>
            <div className="flex items-center gap-2">
              {canReviewDeletions(session) && (
                <DeletionApprovalsButton
                  lang={lang}
                  pendingCount={pendingDeletionCount}
                  onRefreshCount={refreshPendingDeletionCount}
                  onReviewed={(req) => void handleDeletionReviewed(req)}
                />
              )}
            <ProfileMenu
              session={session}
              lang={lang}
              setLang={setLang}
              settings={{ ...DEFAULT_SETTINGS, ...globalSettings }}
              onSettingsChange={(s) => {
                applyGlobalSettings({
                  fontSize: s.fontSize,
                  displayTheme: s.displayTheme,
                  boldNumbers: s.boldNumbers,
                  largeButtons: s.largeButtons,
                  comfortableReading: s.comfortableReading,
                });
              }}
              onOpenAccessibility={() => setShowDisplayPanel(true)}
              onLogout={() => setShowLogoutConfirm(true)}
            />
            </div>
          </div>
          <nav className="home-page-nav border-b border-slate-200 bg-white" aria-label={lang === 'ar' ? 'تبويبات الصفحة الرئيسية' : 'Home page tabs'}>
            <div className="home-page-nav__inner max-w-5xl mx-auto px-3 sm:px-4">
              <div className="home-page-nav__tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={homeTab === 'fleet'}
                  onClick={() => setHomeTab('fleet')}
                  className={`app-nav-tab flex-shrink-0 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                    homeTab === 'fleet'
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <span className="app-nav-tab-label">
                    {lang === 'ar' ? 'الأسطول' : 'Fleet'}
                  </span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={homeTab === 'settings'}
                  onClick={() => setHomeTab('settings')}
                  className={`app-nav-tab flex-shrink-0 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                    homeTab === 'settings'
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <span className="app-nav-tab-label">
                    {lang === 'ar' ? 'الإعدادات' : 'Settings'}
                  </span>
                </button>
              </div>
            </div>
          </nav>
        </header>
        <main className="app-layout__main vehicle-garage-page max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-5 w-full">
          {authError && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {loadError}
            </div>
          )}
          {loadError && !authError && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {loadError}
            </div>
          )}
          {!isAdmin(session) &&
            (fleet?.vehicles.length ?? 0) === 0 &&
            !loadError &&
            storageSource === 'sql' && (
              <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                {lang === 'ar'
                  ? 'لا توجد سيارات مسندة لحسابك. اطلب من المدير فتح الإعدادات وتعيين سيارة لك.'
                  : 'No vehicles are assigned to your account. Ask an admin to assign a car to you in Settings.'}
              </div>
            )}
          {homeTab === 'fleet' ? (
            <VehicleGarage
              session={session}
              lang={lang}
              vehicles={fleet?.vehicles ?? []}
              onSelect={(id) => {
                setHomeTab('fleet');
                setSelectedVehicleId(id);
              }}
              onAddVehicle={handleAddVehicle}
              onDeleteVehicle={
                canDeleteVehicle(session) ? handleDeleteVehicle : undefined
              }
            />
          ) : (
            <HomeSettingsTab
              session={session}
              lang={lang}
              storageSource={storageSource}
              vehicleCount={fleet?.vehicles.length ?? 0}
              onDeletionReviewed={(req) => void handleDeletionReviewed(req)}
            />
          )}
        </main>
        <DisplayAccessibilityPanel
          open={showDisplayPanel}
          onClose={() => setShowDisplayPanel(false)}
          settings={{ ...DEFAULT_SETTINGS, ...globalSettings }}
          onChange={(s) =>
            applyGlobalSettings({
              fontSize: s.fontSize,
              displayTheme: s.displayTheme,
              boldNumbers: s.boldNumbers,
              largeButtons: s.largeButtons,
              comfortableReading: s.comfortableReading,
            })
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
        dir={appDir(lang)}
      >
        <p className="text-slate-600 text-lg">{loadingCopy[lang].vehicle}</p>
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
      data-entry-form-open={showForm ? 'true' : 'false'}
      className="app-layout app-compact"
      dir={appDir(lang)}
    >
      {toast && (
        <AppToast
          message={toast.message}
          tone={toast.tone}
          onDismiss={dismissToast}
          dir={appDir(lang)}
        />
      )}
      <ConfirmDialog
        open={showLogoutConfirm}
        title={lang === 'ar' ? 'تسجيل الخروج' : 'Sign out'}
        message={lang === 'ar' ? 'هل تريد تسجيل الخروج؟' : 'Do you want to sign out?'}
        confirmLabel={lang === 'ar' ? 'نعم، خروج' : 'Yes, sign out'}
        cancelLabel={lang === 'ar' ? 'إلغاء' : 'Cancel'}
        variant="neutral"
        dir={appDir(lang)}
        showIrreversibleNote={false}
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={() => {
          setShowLogoutConfirm(false);
          onLogout();
        }}
      />
      <ConfirmDialog
        open={importBackupConfirm != null}
        title={lang === 'ar' ? 'استيراد نسخة احتياطية' : 'Import backup'}
        message={
          importBackupConfirm ? (
            importBackupConfirm.currentCount > 0 ? (
              lang === 'ar' ? (
                <>
                  سيتم استبدال{' '}
                  <strong className="tabular-nums">{importBackupConfirm.currentCount}</strong>{' '}
                  سجل/سجلات حالية بالنسخة الاحتياطية (
                  <strong className="tabular-nums">{importBackupConfirm.importedCount}</strong>{' '}
                  شهر). متابعة؟
                </>
              ) : (
                <>
                  Replace{' '}
                  <strong className="tabular-nums">{importBackupConfirm.currentCount}</strong>{' '}
                  current entries with the backup (
                  <strong className="tabular-nums">{importBackupConfirm.importedCount}</strong>{' '}
                  months). Continue?
                </>
              )
            ) : lang === 'ar' ? (
              <>
                استيراد{' '}
                <strong className="tabular-nums">{importBackupConfirm.importedCount}</strong>{' '}
                سجل/سجلات من النسخة الاحتياطية. متابعة؟
              </>
            ) : (
              <>
                Import{' '}
                <strong className="tabular-nums">{importBackupConfirm.importedCount}</strong>{' '}
                entries from backup. Continue?
              </>
            )
          ) : (
            ''
          )
        }
        confirmLabel={lang === 'ar' ? 'نعم، استيراد' : 'Yes, import'}
        cancelLabel={lang === 'ar' ? 'إلغاء' : 'Cancel'}
        variant="neutral"
        dir={appDir(lang)}
        showIrreversibleNote={false}
        onCancel={() => setImportBackupConfirm(null)}
        onConfirm={() => void confirmImportBackup()}
      />
      {showConfirmDialog && pendingEntry && (
        <MonthlyEntryConfirmModal
          open={showConfirmDialog}
          entry={pendingEntry}
          guarantee={guarantee}
          oilChanges={oilChanges}
          isEditMode={Boolean(editingId)}
          onConfirm={handleConfirmSave}
          onBack={() => {
            setShowConfirmDialog(false);
            setPendingEntry(null);
          }}
        />
      )}
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
        <div className="app-layout__banner app-backup-strip">
          <div className="max-w-6xl mx-auto px-3 py-1.5 flex items-center justify-between gap-2">
            <p className="text-xs text-amber-900 truncate min-w-0">
              <span className="font-semibold">نسخ احتياطي:</span>{' '}
              {backupStatus.hasBackupBefore ? (
                <>
                  آخر نسخة قبل{' '}
                  <span className="tabular-nums">{fmtInt(backupStatus.daysSinceBackup ?? 0)}</span> يوم
                </>
              ) : (
                <>لم تُسجَّل نسخة بعد</>
              )}
            </p>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handleExportBackup}
                className="px-2.5 py-1 bg-amber-600 text-white text-xs font-medium rounded-md hover:bg-amber-700"
              >
                تصدير
              </button>
              <button
                type="button"
                onClick={() => setBackupBannerDismissed(true)}
                className="px-2 py-1 text-amber-800 text-xs rounded-md hover:bg-amber-100"
                aria-label="إخفاء التذكير"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
      <header className="app-layout__header app-vehicle-header bg-white border-b border-slate-200 z-40">
        <div className="max-w-6xl mx-auto px-3 py-2">
          <div className="app-vehicle-header__row flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <VehicleHeaderBrand
                vehicleLabel={settings.vehicleLabel}
                ownerName={settings.ownerName}
                onLabelChange={(label) =>
                  persist({
                    ...state,
                    settings: { ...settings, vehicleLabel: label },
                  })
                }
              />
            </div>
            <div className="app-header-actions flex items-center gap-1.5 shrink-0">
              {licenseSummary.renewalAlerts.length > 0 && (
                <button
                  type="button"
                  onClick={() => setTab('licenses')}
                  className="hidden sm:inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-900 border border-amber-200 rounded-md text-xs font-medium hover:bg-amber-100"
                  title="عرض تنبيهات تجديد الترخيص"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                  <span>ترخيص ({fmtInt(licenseSummary.renewalAlerts.length)})</span>
                </button>
              )}
              {canReviewDeletions(session) && (
                <DeletionApprovalsButton
                  lang={lang}
                  pendingCount={pendingDeletionCount}
                  onRefreshCount={refreshPendingDeletionCount}
                  onReviewed={(req) => void handleDeletionReviewed(req)}
                />
              )}
              <ProfileMenu
                session={session}
                lang={lang}
                setLang={setLang}
                settings={settings}
                onSettingsChange={(s) => persist({ ...state, settings: s })}
                onOpenAccessibility={() => setShowDisplayPanel(true)}
                onLogout={() => setShowLogoutConfirm(true)}
              />
              <button
                type="button"
                onClick={() => void handleBackToGarage()}
                className="app-back-btn shrink-0 px-2.5 py-1 text-xs sm:text-sm font-medium text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50"
              >
                {lang === 'ar' ? 'السيارات →' : '← Fleet'}
              </button>
            </div>
          </div>
          {!hasVehicleImage(settings.vehicleImage) && (
            <p className="mt-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-2 py-1">
              {VEHICLE_IMAGE_REQUIRED_MSG} —{' '}
              <button
                type="button"
                className="font-semibold underline hover:text-amber-900"
                onClick={() => setTab('settings')}
              >
                رفع الصورة من الإعدادات
              </button>
            </p>
          )}
          <nav
            className="app-nav-tabs mt-2 border-b border-slate-200 -mb-px"
            aria-label={lang === 'ar' ? 'تبويبات السيارة' : 'Vehicle tabs'}
          >
            <div className="flex overflow-x-auto" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`app-nav-tab flex-shrink-0 px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium border-b-2 transition-colors ${
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
            </div>
          </nav>
        </div>
      </header>

      <main className="app-layout__main max-w-6xl mx-auto px-3 sm:px-4 py-3 sm:py-4 w-full">
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
            onCloseForm={closeEntryForm}
            onSave={handleSaveEntry}
            onDeleteEntry={handleDeleteEntry}
            onSetPaymentComplete={handleSetPaymentComplete}
            onConfirmPayFullAmount={handleConfirmPayFullAmount}
            onFormChange={setForm}
            onMonthPickerChange={handleMonthPickerChange}
            onOpenOilTab={() => setTab('oil')}
            oilChanges={oilChanges}
            lateCount={totals.lateCount}
            paidCount={totals.paidCount}
            totalRemaining={totals.totalRemaining}
            formError={entryFormError}
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
            onDeleteAccident={handleDeleteAccident}
          />
        )}
        {tab === 'licenses' && (
          <LicensesTab
            licenses={licenses}
            licenseSummary={licenseSummary}
            onLicensesChange={(next) =>
              persistImmediate((prev) => ({ ...prev, licenses: next }))
            }
            onDeleteLicense={handleDeleteLicense}
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
            session={session}
            onOpenOilTab={() => setTab('oil')}
            onChange={(s) => persist({ ...state, settings: s })}
            onImageChange={(image) => {
              if (!hasVehicleImage(image)) {
                showToast(VEHICLE_IMAGE_REQUIRED_MSG, 'error');
                return;
              }
              persist({
                ...state,
                settings: { ...settings, vehicleImage: image },
              });
            }}
            onExportBackup={handleExportBackup}
            onImportBackup={handleImportBackup}
            backupInputRef={backupInputRef}
            backupStatus={backupStatus}
            storageSource={storageSource}
            onClearEntries={() => {
              if (entries.length > 0) setShowDeleteAllDialog(true);
            }}
            isExporting={isExporting}
            onExportExcel={handleExportExcel}
            onExportPdf={handleExportPdf}
            onBack={() => setTab('tracking')}
            lang={lang}
            vehicleId={selectedVehicleId ?? ''}
            assignedUserId={currentVehicleMeta?.assignedUserId}
            assignedUserDisplayName={currentVehicleMeta?.assignedUserDisplayName}
            onVehicleReassigned={() => void refreshFleet()}
            onDeletionReviewed={(req) => void handleDeletionReviewed(req)}
          />
        )}
        {tab === 'dashboard' && (
          <DashboardTab
            totals={totals}
            baseTotals={baseTotals}
            accidentSummary={accidentSummary}
            licenseSummary={licenseSummary}
            accidents={accidents}
            oilChanges={oilChanges}
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

/* ——— Delete single entry confirmation ——— */

const IconTrash: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);

const DeleteEntryConfirmDialog: React.FC<{
  entry: EntryComputed;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ entry, onCancel, onConfirm }) => (
  <AppModal open onClose={onCancel} size="sm" zIndex={60} panelClassName="border border-red-200">
    <AppModalHeader variant="danger">
      <div className="flex items-center gap-2">
        <IconTrash className="w-5 h-5 shrink-0 opacity-90" />
        <h2 className="text-base font-bold">تأكيد الحذف</h2>
      </div>
    </AppModalHeader>
    <AppModalBody>
      <p className="text-sm text-slate-700 leading-relaxed">
        هل أنت متأكد أنك تريد حذف سجل شهر{' '}
        <strong className="tabular-nums text-slate-900">{entry.month}</strong>
        {entry.driverName?.trim() ? (
          <>
            {' '}
            للسائق <strong>{entry.driverName}</strong>
          </>
        ) : null}
        ؟
      </p>
      <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mt-4">
        لا يمكن التراجع عن هذا الإجراء.
      </p>
    </AppModalBody>
    <AppModalFooter>
      <div className="flex flex-col-reverse sm:flex-row gap-2 pt-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-800 text-sm font-medium hover:bg-slate-50 min-h-[44px]"
        >
          لا، إلغاء
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="flex-1 py-2.5 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700 min-h-[44px]"
        >
          نعم، احذف
        </button>
      </div>
    </AppModalFooter>
  </AppModal>
);

const PayFullAmountConfirmDialog: React.FC<{
  entry: EntryComputed;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ entry, onCancel, onConfirm }) => (
  <AppModal open onClose={onCancel} size="sm" zIndex={60} panelClassName="border border-emerald-200">
    <AppModalHeader variant="success">
      <h2 className="text-base font-bold">تسديد المبلغ</h2>
    </AppModalHeader>
    <AppModalBody>
      <p className="text-sm text-slate-700 leading-relaxed">هل أنت متأكد من دفع المبلغ كامل؟</p>
      <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2.5 text-sm space-y-1 mt-4">
        <p className="text-slate-600">
          الشهر: <strong className="tabular-nums text-slate-900">{entry.month}</strong>
        </p>
        <p className="text-slate-600">
          المبلغ الكامل:{' '}
          <strong className="tabular-nums text-emerald-800">{fmt(entry.totalDue)} د.أ</strong>
        </p>
        {entry.remaining > 0 && (
          <p className="text-slate-600">
            المتبقي الآن:{' '}
            <strong className="tabular-nums text-red-600">{fmt(entry.remaining)} د.أ</strong>
          </p>
        )}
        <p className="text-xs text-emerald-800 pt-1">
          سيُسجَّل كـ ٣ دفعات ضمان:{' '}
          <span className="tabular-nums font-semibold">
            {entry.installmentTargets.map((p) => fmt(p)).join(' + ')}
          </span>
        </p>
      </div>
    </AppModalBody>
    <AppModalFooter>
      <div className="flex flex-col-reverse sm:flex-row gap-2 pt-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-800 text-sm font-medium hover:bg-slate-50 min-h-[44px]"
        >
          لا، إلغاء
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="flex-1 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 min-h-[44px]"
        >
          نعم، تسديد كامل
        </button>
      </div>
    </AppModalFooter>
  </AppModal>
);

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
    <AppModal
      open
      onClose={onCancel}
      size="md"
      zIndex={60}
      panelClassName="border-2 border-red-300"
      aria-labelledby="delete-all-title"
    >
      <AppModalHeader variant="danger">
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
      </AppModalHeader>

      <AppModalBody className="space-y-4">
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

      </AppModalBody>

      <AppModalFooter>
        <div className="flex flex-col-reverse sm:flex-row gap-2 pt-3">
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
      </AppModalFooter>
    </AppModal>
  );
};

/* ——— Success dialog ——— */

const SuccessDialog: React.FC<{ message: string; onClose: () => void }> = ({
  message,
  onClose,
}) => (
  <AppModal open onClose={onClose} size="sm" zIndex={50} panelClassName="border border-green-200">
    <AppModalBody className="text-center !py-6">
      <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center text-2xl text-green-600">
        ✓
      </div>
      <p className="text-lg font-semibold text-slate-800 leading-relaxed">{message}</p>
    </AppModalBody>
    <AppModalFooter>
      <button
        type="button"
        onClick={onClose}
        className="w-full py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
      >
        حسناً
      </button>
    </AppModalFooter>
  </AppModal>
);

/* ——— Tracking pagination ——— */

const PaginationBar: React.FC<{
  page: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}> = ({ page, totalPages, rangeStart, rangeEnd, total, pageSize, onPageChange }) => {
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
        {fmtInt(pageSize)} لكل صفحة
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

const PaymentStatusControl: React.FC<{
  row: EntryComputed;
  onSetComplete: (id: string, complete: boolean) => void;
}> = ({ row, onSetComplete }) => {
  const showMarkComplete = row.remaining > 0 && !row.paymentComplete;
  const showMarkIncomplete = row.paymentComplete;

  return (
    <div className="payment-status-control">
      <span
        className={`payment-status-control__badge ${paymentStatusBadgeClass(row.status)}`}
      >
        {row.status}
      </span>
      {showMarkComplete && (
        <button
          type="button"
          className="payment-status-control__btn payment-status-control__btn--complete"
          onClick={(e) => {
            e.stopPropagation();
            onSetComplete(row.id, true);
          }}
        >
          مكتمل
        </button>
      )}
      {showMarkIncomplete && (
        <button
          type="button"
          className="payment-status-control__btn payment-status-control__btn--incomplete"
          onClick={(e) => {
            e.stopPropagation();
            onSetComplete(row.id, false);
          }}
        >
          غير مكتمل
        </button>
      )}
    </div>
  );
};

const TrackingEntryCard: React.FC<{
  row: EntryComputed;
  rowNum: number;
  isRowEditing: boolean;
  onOpenEdit: (row: EntryComputed) => void;
  onRequestDelete: (row: EntryComputed) => void;
  onRequestPayFull: (row: EntryComputed) => void;
  onSetPaymentComplete: (id: string, complete: boolean) => void;
}> = ({
  row,
  rowNum,
  isRowEditing,
  onOpenEdit,
  onRequestDelete,
  onRequestPayFull,
  onSetPaymentComplete,
}) => {
  const cardTone = isRowEditing
    ? 'tracking-entry-card--editing'
    : row.status === 'غير مكتمل'
      ? 'tracking-entry-card--late'
      : row.status === 'مكتمل'
        ? 'tracking-entry-card--settled'
        : '';

  return (
    <article
      className={`tracking-entry-card ${cardTone}`}
      aria-label={`سجل شهر ${row.month}`}
    >
      {!isRowEditing && (
        <EntryActionsMenu
          variant="card"
          row={row}
          isRowEditing={isRowEditing}
          onOpenEdit={onOpenEdit}
          onRequestDelete={onRequestDelete}
          onRequestPayFull={onRequestPayFull}
        />
      )}

      <header className="tracking-entry-card__head">
        <div className="tracking-entry-card__head-top">
          <p className="tracking-entry-card__month tabular-nums">{row.month}</p>
          <span className="tracking-entry-card__num tabular-nums">#{fmtInt(rowNum)}</span>
        </div>
        <div className="tracking-entry-card__badges">
          <PaymentStatusControl row={row} onSetComplete={onSetPaymentComplete} />
          {row.driverName?.trim() && (
            <span className="tracking-entry-card__driver-chip" title="السائق">
              {row.driverName}
            </span>
          )}
        </div>
      </header>

      <div className="tracking-entry-card__body">
        <div className="tracking-entry-card__finance">
          <dl className="tracking-entry-card__finance-list">
            <div className="tracking-entry-card__finance-row">
              <dt>الإيراد</dt>
              <dd className="text-green-700">{fmt(row.revenue)}</dd>
            </div>
            <div className="tracking-entry-card__finance-row">
              <dt>المصاريف</dt>
              <dd className="text-orange-700">{fmt(row.expenses)}</dd>
            </div>
            <div className="tracking-entry-card__finance-row">
              <dt>الصافي</dt>
              <dd className={row.net >= 0 ? 'text-blue-700' : 'text-red-600'}>{fmt(row.net)}</dd>
            </div>
            <div className="tracking-entry-card__finance-row">
              <dt>المتبقي</dt>
              <dd className={row.remaining > 0 ? 'text-red-600' : 'text-slate-400'}>
                {fmt(row.remaining)}
              </dd>
            </div>
          </dl>
          <div className="tracking-entry-card__finance-paid">
            <div className="tracking-entry-card__finance-paid-head">
              <span className="tracking-entry-card__finance-paid-label">المدفوع (٣ دفعات ضمان)</span>
              <span className="tracking-entry-card__finance-paid-total tabular-nums">
                {fmt(row.driverPaid)} د.أ
              </span>
            </div>
            <p className="tracking-entry-card__finance-paid-breakdown tabular-nums">
              <span>{row.driverPayments.map((p) => fmt(p)).join(' + ')}</span>
              <span className="tracking-entry-card__finance-paid-sep">/</span>
              <span>{fmt(row.totalDue)}</span>
            </p>
          </div>
          {!isRowEditing && row.remaining > 0 && (
            <button
              type="button"
              className="tracking-entry-card__pay-btn"
              onClick={(e) => {
                e.stopPropagation();
                onRequestPayFull(row);
              }}
            >
              تسديد المبلغ
            </button>
          )}
        </div>

        {(REPORT_EXPENSE_KEYS.some((k) => row.expenseDetails[k] > 0) || row.notes) && (
          <div className="tracking-entry-card__extras">
            <ExpenseDetailsCell row={row} />
          </div>
        )}
      </div>

      {isRowEditing && (
        <p className="tracking-entry-card__editing-hint text-amber-700 text-xs font-bold text-center py-2">
          جاري التعديل في النموذج ↑
        </p>
      )}
    </article>
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

const IconDotsVertical: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <circle cx="12" cy="5" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="12" cy="19" r="2" />
  </svg>
);

const EntryActionsMenu: React.FC<{
  variant: 'card' | 'table';
  row: EntryComputed;
  rowNum?: number;
  isRowEditing: boolean;
  onOpenEdit: (row: EntryComputed) => void;
  onRequestDelete: (row: EntryComputed) => void;
  onRequestPayFull: (row: EntryComputed) => void;
}> = ({
  variant,
  row,
  rowNum,
  isRowEditing,
  onOpenEdit,
  onRequestDelete,
  onRequestPayFull,
}) => {
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);

  const menuItems = (
    <>
      <button
        type="button"
        role="menuitem"
        className="tracking-row-menu__item"
        onClick={() => {
          onOpenEdit(row);
          setOpen(false);
        }}
      >
        تعديل
      </button>
      {row.remaining > 0 && (
        <button
          type="button"
          role="menuitem"
          className="tracking-row-menu__item tracking-row-menu__item--complete"
          onClick={() => {
            onRequestPayFull(row);
            setOpen(false);
          }}
        >
          تسديد المبلغ
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        className="tracking-row-menu__item tracking-row-menu__item--danger"
        onClick={() => {
          onRequestDelete(row);
          setOpen(false);
        }}
      >
        <IconTrash className="w-3.5 h-3.5 shrink-0" />
        حذف
      </button>
    </>
  );

  const updatePanelPosition = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPanelPos({ top: rect.bottom + 4, left: rect.left });
  };

  const toggleOpen = () => {
    setOpen((wasOpen) => {
      if (!wasOpen) {
        updatePanelPosition();
        return true;
      }
      return false;
    });
  };

  useEffect(() => {
    if (!open) return;
    if (variant === 'table') updatePanelPosition();
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (portalRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onScroll = () => setOpen(false);
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  if (isRowEditing) {
    return (
      <span className="text-amber-700 text-xs font-bold whitespace-nowrap">جاري التعديل ↑</span>
    );
  }

  return (
    <div
      className={`tracking-row-menu tracking-row-menu--${variant}`}
      ref={rootRef}
      onClick={(e) => e.stopPropagation()}
    >
      {variant === 'table' && rowNum != null && (
        <span className="text-slate-400 text-xs tabular-nums shrink-0">#{fmtInt(rowNum)}</span>
      )}
      <button
        ref={triggerRef}
        type="button"
        className="tracking-row-menu__trigger"
        onClick={(e) => {
          e.stopPropagation();
          toggleOpen();
        }}
        aria-label={`إجراءات سجل ${row.month}`}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <IconDotsVertical />
      </button>
      {open && variant === 'card' && (
        <div className="tracking-row-menu__panel" role="menu">
          {menuItems}
        </div>
      )}
      {open &&
        variant === 'table' &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={portalRef}
            className="tracking-row-menu-portal"
            style={{ top: panelPos.top, left: panelPos.left }}
            dir={document.getElementById('taxi-app')?.getAttribute('dir') ?? 'rtl'}
          >
            <div className="tracking-row-menu__panel" role="menu">
              {menuItems}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

const TrackingEntriesTable: React.FC<{
  rows: EntryComputed[];
  rangeStart: number;
  editingId: string | null;
  onOpenEdit: (row: EntryComputed) => void;
  onRequestDelete: (row: EntryComputed) => void;
  onRequestPayFull: (row: EntryComputed) => void;
  onSetPaymentComplete: (id: string, complete: boolean) => void;
}> = ({
  rows,
  rangeStart,
  editingId,
  onOpenEdit,
  onRequestDelete,
  onRequestPayFull,
  onSetPaymentComplete,
}) => (
  <div className="tracking-table-outer border border-slate-100 rounded-lg">
    <div className="tracking-table-scroll">
      <table className="tracking-table w-full text-sm min-w-0 lg:min-w-[720px]">
        <thead>
          <tr className="bg-blue-600 text-white text-sm">
            <th className="py-3 px-3 text-right font-semibold whitespace-nowrap">الشهر</th>
            <th className="py-3 px-3 text-right font-semibold tracking-col-driver">السائق</th>
            <th className="py-3 px-3 text-right font-semibold whitespace-nowrap">الإيراد</th>
            <th className="py-3 px-3 text-right font-semibold whitespace-nowrap tracking-col-optional">
              المصاريف
            </th>
            <th className="py-3 px-3 text-right font-semibold whitespace-nowrap tracking-col-optional">
              الصافي
            </th>
            <th className="py-3 px-3 text-right font-semibold whitespace-nowrap">المدفوع</th>
            <th className="py-3 px-3 text-right font-semibold whitespace-nowrap">المتبقي</th>
            <th className="py-3 px-3 text-right font-semibold">الحالة</th>
            <th className="py-3 px-3 text-right font-semibold whitespace-nowrap w-[72px]">
              إجراءات
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {rows.map((row, idx) => {
            const isRowEditing = editingId === row.id;
            const rowNum = rangeStart + idx;
            return (
              <tr
                key={row.id}
                className={
                  isRowEditing
                    ? 'bg-amber-100 ring-2 ring-inset ring-amber-400'
                    : row.status === 'غير مكتمل'
                      ? 'bg-red-50/50'
                      : row.status === 'مكتمل'
                        ? 'bg-green-50/40'
                        : ''
                }
              >
                <td className="py-3 px-3 tabular-nums font-semibold text-slate-800 whitespace-nowrap">
                  {row.month}
                </td>
                <td className="py-3 px-3 font-medium text-slate-800 tracking-col-driver">
                  {row.driverName}
                </td>
                <td className="py-3 px-3 tabular-nums text-green-700 font-semibold">
                  {fmt(row.revenue)}
                </td>
                <td className="py-3 px-3 tabular-nums text-orange-700 font-semibold tracking-col-optional">
                  {fmt(row.expenses)}
                </td>
                <td
                  className={`py-3 px-3 tabular-nums font-semibold tracking-col-optional ${
                    row.net >= 0 ? 'text-blue-700' : 'text-red-600'
                  }`}
                >
                  {fmt(row.net)}
                </td>
                <td className="py-3 px-3 tabular-nums text-sm">
                  <div className="font-medium text-slate-800">{fmt(row.driverPaid)}</div>
                  <div className="text-xs text-slate-500 tabular-nums">
                    {row.driverPayments.map((p) => fmt(p)).join(' + ')}
                  </div>
                </td>
                <td
                  className={`py-3 px-3 tabular-nums font-semibold ${
                    row.remaining > 0 ? 'text-red-600' : 'text-slate-400'
                  }`}
                >
                  {fmt(row.remaining)}
                </td>
                <td className="py-3 px-3">
                  <PaymentStatusControl row={row} onSetComplete={onSetPaymentComplete} />
                </td>
                <td className="py-3 px-2 align-middle tracking-table-actions-cell">
                  <EntryActionsMenu
                    variant="table"
                    row={row}
                    rowNum={rowNum}
                    isRowEditing={isRowEditing}
                    onOpenEdit={onOpenEdit}
                    onRequestDelete={onRequestDelete}
                    onRequestPayFull={onRequestPayFull}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
);

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
  onDeleteEntry: (id: string) => void;
  onSetPaymentComplete: (id: string, complete: boolean) => void;
  onConfirmPayFullAmount: (entry: MonthlyEntry) => void;
  onFormChange: React.Dispatch<React.SetStateAction<Omit<MonthlyEntry, 'id'>>>;
  onMonthPickerChange: (ym: string) => void;
  onOpenOilTab: () => void;
  oilChanges: OilChangeRecord[];
  lateCount: number;
  paidCount: number;
  totalRemaining: number;
  formError?: string;
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
  onDeleteEntry,
  onSetPaymentComplete,
  onConfirmPayFullAmount,
  onFormChange,
  onMonthPickerChange,
  onOpenOilTab,
  oilChanges,
  lateCount,
  paidCount,
  totalRemaining,
  formError,
}) => {
  const editingEntry = editingId ? entries.find((e) => e.id === editingId) : undefined;
  const formGuarantee = editingEntry?.guarantee ?? guarantee;
  const installmentTargets = useMemo(
    () => splitRevenueToInstallments(form.revenue || 0),
    [form.revenue]
  );
  const formPayments = useMemo(
    () => normalizeDriverPayments(form.driverPayments, form.driverPaid, form.revenue || 0),
    [form.driverPayments, form.driverPaid, form.revenue]
  );
  const formPaidTotal = sumDriverPayments(formPayments);
  const previewTotalDue = entryTotalDue(form.revenue || 0, formGuarantee);
  const previewRemaining = Math.max(0, previewTotalDue - formPaidTotal);
  const previewStatus = resolvePaymentStatus(
    previewRemaining,
    Boolean(form.paymentComplete)
  );

  const setInstallment = (index: 0 | 1 | 2, value: number) => {
    onFormChange((f) => {
      const payments = normalizeDriverPayments(f.driverPayments, f.driverPaid, f.revenue || 0);
      const next: DriverPaymentTriple = [...payments];
      next[index] = Math.max(0, value);
      return { ...f, driverPayments: next, driverPaid: sumDriverPayments(next) };
    });
  };
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
  const previewNet = (form.revenue || 0) - formExpenseTotal;
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
  const [entryPendingDelete, setEntryPendingDelete] = useState<EntryComputed | null>(null);
  const [entryPendingPayFull, setEntryPendingPayFull] = useState<EntryComputed | null>(null);
  const [viewMode, setViewMode] = useState<TrackingViewMode>(loadTrackingViewMode);
  const [sortOrder, setSortOrder] = useState<EntrySortOrder>(loadTrackingSortOrder);

  const driverOptions = useMemo(() => getUniqueDriverNames(entries), [entries]);

  const filteredEntries = useMemo(
    () => filterEntries(entries, filters),
    [entries, filters]
  );

  const sortedEntries = useMemo(
    () => sortEntriesByMonth(filteredEntries, sortOrder),
    [filteredEntries, sortOrder]
  );

  const pageSize = useFitPageSize(
    {
      rowHeight: viewMode === 'table' ? 38 : 100,
      reservedTop: showForm ? 460 : 280,
      min: 5,
      max: 10,
    },
    [viewMode, showForm]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 900px)');
    const apply = () => {
      if (mq.matches && viewMode === 'table') setViewModePersisted('cards');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [viewMode]);

  const pagination = useMemo(
    () => paginateEntries(sortedEntries, page, pageSize),
    [sortedEntries, page, pageSize]
  );

  const setViewModePersisted = (mode: TrackingViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(TRACKING_VIEW_STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  };

  const setSortOrderPersisted = (order: EntrySortOrder) => {
    setSortOrder(order);
    setPage(1);
    try {
      localStorage.setItem(TRACKING_SORT_STORAGE_KEY, order);
    } catch {
      /* ignore */
    }
  };

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
    const targetPage = findEntryPage(sortedEntries, editingId, pageSize);
    if (targetPage != null) setPage(targetPage);
  }, [editingId, sortedEntries, pageSize]);

  useEffect(() => {
    if (page > pagination.totalPages) setPage(pagination.totalPages);
  }, [page, pagination.totalPages]);

  useEffect(() => {
    setPage(1);
  }, [pageSize, viewMode]);

  return (
    <div className="tracking-tab space-y-2 sm:space-y-3">
      {entryPendingDelete && (
        <DeleteEntryConfirmDialog
          entry={entryPendingDelete}
          onCancel={() => setEntryPendingDelete(null)}
          onConfirm={() => {
            onDeleteEntry(entryPendingDelete.id);
            setEntryPendingDelete(null);
          }}
        />
      )}
      {entryPendingPayFull && (
        <PayFullAmountConfirmDialog
          entry={entryPendingPayFull}
          onCancel={() => setEntryPendingPayFull(null)}
          onConfirm={() => {
            onConfirmPayFullAmount(entryPendingPayFull);
            setEntryPendingPayFull(null);
          }}
        />
      )}
      {entries.length > 0 && lateCount > 0 && (
        <button
          type="button"
          onClick={() => {
            setFilters((f) => ({ ...f, status: 'غير مكتمل' }));
            setPage(1);
          }}
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-800 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-100 text-right w-full sm:w-auto justify-center sm:justify-start"
          title="عرض الأشهر غير المكتملة"
        >
          <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
          <span className="tabular-nums">
            {fmtInt(lateCount)} شهر غير مكتمل — متبقي {fmt(totalRemaining)} د.أ
          </span>
        </button>
      )}
      {entries.length > 0 && lateCount === 0 && (
        <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-800 border border-green-200 rounded-lg text-sm font-medium w-full sm:w-auto justify-center sm:justify-start">
          <span className="text-green-600">✓</span>
          كل الأشهر مكتملة ({fmtInt(paidCount)} شهر)
        </span>
      )}

      <div className="tracking-tab-toolbar">
        <p className="text-sm text-slate-600 flex-1 min-w-0">
          {isEditMode ? (
            <span className="text-amber-700 font-medium">
              أنت في وضع التعديل — عدّل الحقول ثم اضغط «مراجعة التعديلات»
            </span>
          ) : (
            'أضف سجلاً واحداً لكل شهر'
          )}
        </p>
        <button
          type="button"
          onClick={onOpenAdd}
          disabled={isEditMode}
          className="tracking-tab-add-btn"
        >
          + دفع ضمان
        </button>
      </div>

      {showForm && (
        <form
          ref={formRef}
          onSubmit={onSave}
          className={`entry-form-panel rounded-xl shadow-md space-y-4 transition-colors ${
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
            <h2 className="font-semibold text-slate-800">إضافة دفع ضمان</h2>
          )}
          {formError && (
            <div
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
              role="alert"
            >
              {formError}
            </div>
          )}
          <div className="entry-form-meta grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <label className="block sm:col-span-2 lg:col-span-1">
              <span className="text-xs font-medium text-slate-500">الشهر / السنة</span>
              <input
                type="month"
                required
                value={monthPickerValue}
                onChange={(e) => onMonthPickerChange(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2.5 text-base sm:text-sm tabular-nums entry-touch-input"
              />
            </label>
            <label className="block entry-form-meta-extra hidden sm:block">
              <span className="text-xs font-medium text-slate-500">رقم الشهر</span>
              <input
                type="text"
                readOnly
                value={formatMonthNumber(form.date)}
                className="mt-1 w-full border border-slate-100 bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-600 tabular-nums text-center font-medium"
              />
            </label>
            <label className="block entry-form-meta-extra hidden sm:block">
              <span className="text-xs font-medium text-slate-500">الفترة (MM/YYYY)</span>
              <input
                type="text"
                readOnly
                value={form.month || formatMonthLabel(form.date)}
                className="mt-1 w-full border border-slate-100 bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-600 tabular-nums"
              />
            </label>
            <label className="block sm:col-span-2 lg:col-span-1">
              <span className="text-xs font-medium text-slate-500">اسم السائق</span>
              <input
                type="text"
                value={form.driverName}
                onChange={(e) => onFormChange((f) => ({ ...f, driverName: e.target.value }))}
                placeholder="اسم السائق لهذا الشهر"
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2.5 text-base sm:text-sm entry-touch-input"
              />
            </label>
            <p className="entry-form-meta-mobile-hint sm:hidden text-xs text-slate-500 tabular-nums col-span-1">
              الفترة: {form.month || formatMonthLabel(form.date)}
            </p>
          </div>

          <div className="entry-payments-card">
            <div className="entry-payments-card__head">
              <h3 className="text-sm font-semibold text-blue-900">دفعات السائق — ٣ دفعات ضمان</h3>
              <span className="text-xs sm:text-sm font-bold text-blue-800 tabular-nums">
                المدفوع {fmt(formPaidTotal)} / {fmt(previewTotalDue)} د.أ
              </span>
            </div>
            <div className="entry-payments-card__body">
              <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6">
                <div className="entry-revenue-field">
                  <span className="text-xs font-medium text-slate-600">الإيراد (د.أ)</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={form.revenue}
                    onChange={(e) =>
                      onFormChange((f) => ({ ...f, revenue: Number(e.target.value) || 0 }))
                    }
                    className="entry-revenue-input"
                    aria-describedby="revenue-split-hint"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p id="revenue-split-hint" className="text-xs text-slate-500 mb-2 text-right">
                    الإيراد ÷ ٣ — كل دفعة ضمان متساوية
                  </p>
                  <div className="entry-installment-chips">
                    {DRIVER_PAYMENT_LABELS.map((label, idx) => (
                      <span key={label} className="entry-installment-chip">
                        <span className="entry-installment-chip__label">{label}</span>
                        <span className="entry-installment-chip__value">
                          {fmt(installmentTargets[idx as 0 | 1 | 2])}
                        </span>
                      </span>
                    ))}
                    <span className="text-xs text-slate-400 tabular-nums self-center">
                      = {fmt(previewTotalDue)} د.أ
                    </span>
                  </div>
                </div>
              </div>

              {previewTotalDue > 0 && (
                <div className="entry-payments-progress" aria-hidden>
                  <div
                    className="entry-payments-progress__bar"
                    style={{
                      width: `${Math.min(100, Math.round((formPaidTotal / previewTotalDue) * 100))}%`,
                    }}
                  />
                </div>
              )}

              <div className="entry-installment-inputs">
                {DRIVER_PAYMENT_LABELS.map((label, idx) => {
                  const i = idx as 0 | 1 | 2;
                  const target = installmentTargets[i];
                  const paid = formPayments[i];
                  const done = paid >= target && target > 0;
                  return (
                    <div key={label} className="entry-installment-field">
                      <span className="text-xs font-medium text-slate-600 mb-1 block">
                        {label}
                        <span className="text-slate-400 font-normal tabular-nums">
                          {' '}
                          / {fmt(target)}
                        </span>
                      </span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={paid || ''}
                        onChange={(e) => setInstallment(i, Number(e.target.value) || 0)}
                        className={`entry-touch-input border rounded-lg px-2 py-2.5 text-base sm:text-sm bg-white tabular-nums w-full max-w-none ${
                          done
                            ? 'border-green-300 ring-1 ring-green-100'
                            : 'border-slate-200'
                        }`}
                        placeholder={String(target)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="border border-orange-200 rounded-xl p-4 bg-orange-50/50 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-orange-900">تفاصيل المصاريف (اختياري)</h3>
              <span className="text-sm font-bold text-orange-800 tabular-nums">
                المجموع: {fmt(formExpenseTotal)} د.أ
              </span>
            </div>
            <p className="text-xs text-slate-500">يمكن الحفظ بدون مصاريف — اترك الحقول فارغة</p>
            {monthOilFromTab > 0 && (
              <p className="text-xs text-orange-800 tabular-nums">
                يشمل زيت هذا الشهر من تبويب «متابعة الزيت»: {fmt(monthOilFromTab)} د.أ
              </p>
            )}
            <div className="entry-expense-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2.5 text-base sm:text-sm bg-white entry-touch-input"
                  />
                </label>
              ))}
            </div>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">ملاحظات (اختياري)</span>
              <textarea
                value={form.notes ?? ''}
                onChange={(e) => onFormChange((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                placeholder="مثال: 10 أيام توقف، موازنة إطارات..."
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2.5 text-base sm:text-sm bg-white resize-none entry-touch-input"
              />
            </label>
          </div>

          <div className="entry-form-summary">
            <div className="entry-form-summary__item text-slate-600">
              المطلوب
              <strong className="text-slate-800">{fmt(previewTotalDue)}</strong>
            </div>
            <div className="entry-form-summary__item text-slate-600">
              المدفوع
              <strong className="text-slate-800">{fmt(formPaidTotal)}</strong>
            </div>
            <div className="entry-form-summary__item text-slate-600">
              المتبقي
              <strong className={previewRemaining > 0 ? 'text-red-600' : 'text-green-700'}>
                {fmt(previewRemaining)}
              </strong>
            </div>
            <div className="entry-form-summary__item text-slate-600">
              صافي الشهر
              <strong className={previewNet >= 0 ? 'text-blue-700' : 'text-red-600'}>
                {fmt(previewNet)}
              </strong>
            </div>
            <div className="entry-form-summary__item text-slate-600">
              الحالة
              <strong>
                <span
                  className={`inline-block mt-0.5 px-2 py-0.5 rounded text-xs font-bold ${paymentStatusBadgeClass(previewStatus)}`}
                >
                  {previewStatus}
                </span>
              </strong>
            </div>
          </div>
          {(previewRemaining > 0 || form.paymentComplete) && (
            <div className="entry-form-complete-row">
              <p className="text-xs text-slate-600 flex-1">
                أحمر عند وجود متبقي — أخضر عند اكتمال السداد. يمكنك تعليم الشهر «مكتمل» يدوياً
                حتى مع وجود متبقي.
              </p>
              {previewRemaining > 0 && !form.paymentComplete && (
                <button
                  type="button"
                  onClick={() => onFormChange((f) => ({ ...f, paymentComplete: true }))}
                  className="entry-form-complete-btn"
                >
                  مكتمل
                </button>
              )}
              {form.paymentComplete && (
                <button
                  type="button"
                  onClick={() => onFormChange((f) => ({ ...f, paymentComplete: false }))}
                  className="entry-form-complete-btn entry-form-complete-btn--off"
                >
                  غير مكتمل
                </button>
              )}
            </div>
          )}
          <div className="entry-form-actions">
            <button
              type="button"
              onClick={onCloseForm}
              className="entry-form-actions__cancel"
            >
              {isEditMode ? 'إلغاء التعديل' : 'إلغاء'}
            </button>
            <button
              type="submit"
              className={`entry-form-actions__submit ${
                isEditMode ? 'entry-form-actions__submit--edit' : ''
              }`}
            >
              {isEditMode ? 'مراجعة التعديلات' : 'مراجعة وإضافة'}
            </button>
          </div>
        </form>
      )}

      <div className="tracking-list-panel bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-3">
        <div className="tracking-filters-row">
          <label className="tracking-filters-search block">
            <span className="sr-only">بحث</span>
            <input
              type="search"
              value={filters.query}
              onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
              placeholder="بحث: شهر، سائق، مبلغ..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-base sm:text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-200 focus:border-blue-400 entry-touch-input"
            />
          </label>
          <div className="tracking-filters-selects">
            <select
              value={filters.status}
              onChange={(e) =>
                setFilters((f) => ({ ...f, status: e.target.value as EntryFilters['status'] }))
              }
              className="tracking-filter-select entry-touch-input"
              aria-label="تصفية الحالة"
            >
              <option value="all">كل الحالات</option>
              <option value="مكتمل">مكتمل</option>
              <option value="غير مكتمل">غير مكتمل</option>
            </select>
            <select
              value={filters.driver}
              onChange={(e) => setFilters((f) => ({ ...f, driver: e.target.value }))}
              className="tracking-filter-select entry-touch-input"
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
              <button type="button" onClick={clearFilters} className="tracking-filter-clear">
                مسح
              </button>
            )}
          </div>
        </div>

        <div className="tracking-display-toolbar">
          <div className="tracking-display-toolbar__group">
            <span className="tracking-display-toolbar__label">الترتيب</span>
            <div className="tracking-segmented" role="group" aria-label="ترتيب الشهور">
              <button
                type="button"
                className={`tracking-segmented__btn ${
                  sortOrder === 'desc' ? 'tracking-segmented__btn--active' : ''
                }`}
                onClick={() => setSortOrderPersisted('desc')}
                aria-pressed={sortOrder === 'desc'}
              >
                الأحدث ← الأقدم
              </button>
              <button
                type="button"
                className={`tracking-segmented__btn ${
                  sortOrder === 'asc' ? 'tracking-segmented__btn--active' : ''
                }`}
                onClick={() => setSortOrderPersisted('asc')}
                aria-pressed={sortOrder === 'asc'}
              >
                الأقدم ← الأحدث
              </button>
            </div>
          </div>
          <div className="tracking-display-toolbar__group">
            <span className="tracking-display-toolbar__label">العرض</span>
            <div className="tracking-segmented" role="group" aria-label="طريقة العرض">
              <button
                type="button"
                className={`tracking-segmented__btn ${
                  viewMode === 'cards' ? 'tracking-segmented__btn--active' : ''
                }`}
                onClick={() => setViewModePersisted('cards')}
                aria-pressed={viewMode === 'cards'}
              >
                بطاقات
              </button>
              <button
                type="button"
                className={`tracking-segmented__btn ${
                  viewMode === 'table' ? 'tracking-segmented__btn--active' : ''
                }`}
                onClick={() => setViewModePersisted('table')}
                aria-pressed={viewMode === 'table'}
              >
                جدول
              </button>
            </div>
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

        {sortedEntries.length > pageSize && (
          <PaginationBar
            page={pagination.page}
            totalPages={pagination.totalPages}
            rangeStart={pagination.rangeStart}
            rangeEnd={pagination.rangeEnd}
            total={pagination.total}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        )}

        {entries.length === 0 ? (
          <p className="py-12 text-center text-slate-400 text-sm">
            لا توجد سجلات — اضغط «دفع ضمان» للبدء
          </p>
        ) : filteredEntries.length === 0 ? (
          <p className="py-12 text-center text-slate-500 text-sm">
            لا توجد نتائج — غيّر البحث أو اضغط «مسح»
          </p>
        ) : viewMode === 'cards' ? (
          <div className="tracking-entry-list">
            {pagination.items.map((row, idx) => (
              <TrackingEntryCard
                key={row.id}
                row={row}
                rowNum={pagination.rangeStart + idx}
                isRowEditing={editingId === row.id}
                onOpenEdit={onOpenEdit}
                onRequestDelete={setEntryPendingDelete}
                onRequestPayFull={setEntryPendingPayFull}
                onSetPaymentComplete={onSetPaymentComplete}
              />
            ))}
          </div>
        ) : (
          <TrackingEntriesTable
            rows={pagination.items}
            rangeStart={pagination.rangeStart}
            editingId={editingId}
            onOpenEdit={onOpenEdit}
            onRequestDelete={setEntryPendingDelete}
            onRequestPayFull={setEntryPendingPayFull}
            onSetPaymentComplete={onSetPaymentComplete}
          />
        )}

        {sortedEntries.length > pageSize && (
          <PaginationBar
            page={pagination.page}
            totalPages={pagination.totalPages}
            rangeStart={pagination.rangeStart}
            rangeEnd={pagination.rangeEnd}
            total={pagination.total}
            pageSize={pageSize}
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
  onDeleteAccident: (id: string) => void | Promise<void>;
}> = ({
  accidents,
  accidentSummary,
  monthlyGuarantee,
  defaultDriver,
  onAccidentsChange,
  onDeleteAccident,
}) => {
  const [form, setForm] = useState(() => emptyAccidentForm(defaultDriver));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');

  const resetForm = () => {
    setForm(emptyAccidentForm(defaultDriver));
    setEditingId(null);
    setShowForm(false);
    setFormError('');
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
      setFormError('يرجى إدخال التاريخ');
      return;
    }
    setFormError('');
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

  const confirmDeleteAccident = () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    if (editingId === id) resetForm();
    void onDeleteAccident(id);
  };

  const sorted = [...accidents].sort(
    (a, b) => new Date(b.accidentDate).getTime() - new Date(a.accidentDate).getTime()
  );

  const [accPage, setAccPage] = useState(1);
  const accPageSize = useFitPageSize(
    { rowHeight: 42, reservedTop: showForm ? 400 : 300, min: 4, max: 6 },
    [showForm]
  );
  const accPagination = useMemo(
    () => paginateEntries(sorted, accPage, accPageSize),
    [sorted, accPage, accPageSize]
  );

  useEffect(() => {
    setAccPage(1);
  }, [accidents.length, showForm]);

  useEffect(() => {
    if (accPage > accPagination.totalPages) setAccPage(accPagination.totalPages);
  }, [accPage, accPagination.totalPages]);

  const pendingAccident = pendingDeleteId
    ? accidents.find((a) => a.id === pendingDeleteId)
    : undefined;

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
    <div className="insurance-accidents-tab space-y-3">
      <ConfirmDialog
        open={pendingDeleteId != null}
        title="تأكيد حذف الحادث"
        message={
          pendingAccident ? (
            <>
              هل أنت متأكد من حذف سجل الحادث بتاريخ{' '}
              <strong className="tabular-nums">{pendingAccident.accidentDate}</strong>
              {pendingAccident.responsibleDriver?.trim() ? (
                <>
                  {' '}
                  — السائق: <strong>{pendingAccident.responsibleDriver}</strong>
                </>
              ) : null}
              ؟
            </>
          ) : (
            'هل أنت متأكد من حذف هذا السجل؟'
          )
        }
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={confirmDeleteAccident}
      />
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
          {formError && (
            <div
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 mb-3"
              role="alert"
            >
              {formError}
            </div>
          )}
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

      {sorted.length > accPageSize && (
        <PaginationBar
          page={accPagination.page}
          totalPages={accPagination.totalPages}
          rangeStart={accPagination.rangeStart}
          rangeEnd={accPagination.rangeEnd}
          total={accPagination.total}
          pageSize={accPageSize}
          onPageChange={setAccPage}
        />
      )}

      <div className="tracking-table-outer insurance-table-section border border-slate-200 rounded-xl app-surface">
        <div className="tracking-table-scroll">
        <table className="tracking-table w-full text-sm min-w-0 lg:min-w-[640px]">
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
              accPagination.items.map((a) => (
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
                      onClick={() => setPendingDeleteId(a.id)}
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

      {sorted.length > accPageSize && (
        <PaginationBar
          page={accPagination.page}
          totalPages={accPagination.totalPages}
          rangeStart={accPagination.rangeStart}
          rangeEnd={accPagination.rangeEnd}
          total={accPagination.total}
          pageSize={accPageSize}
          onPageChange={setAccPage}
        />
      )}

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
  onDeleteLicense: (id: string) => void | Promise<void>;
}> = ({ licenses, licenseSummary, onLicensesChange, onDeleteLicense }) => {
  const [form, setForm] = useState(emptyLicenseForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');

  const resetForm = () => {
    setForm(emptyLicenseForm());
    setEditingId(null);
    setShowForm(false);
    setFormError('');
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
      setFormError('يرجى إدخال تاريخ الترخيص');
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
      setFormError('يوجد سجل ترخيص بنفس التاريخ مسبقاً');
      return;
    }
    setFormError('');
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

  const confirmDeleteLicense = () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    if (editingId === id) resetForm();
    void onDeleteLicense(id);
  };

  const sorted = [...licenses].sort(
    (a, b) => new Date(b.licenseDate).getTime() - new Date(a.licenseDate).getTime()
  );

  const [licPage, setLicPage] = useState(1);
  const licPageSize = useFitPageSize(
    { rowHeight: 42, reservedTop: showForm ? 380 : 280, min: 4, max: 6 },
    [showForm]
  );
  const licPagination = useMemo(
    () => paginateEntries(sorted, licPage, licPageSize),
    [sorted, licPage, licPageSize]
  );

  useEffect(() => {
    setLicPage(1);
  }, [licenses.length, showForm]);

  useEffect(() => {
    if (licPage > licPagination.totalPages) setLicPage(licPagination.totalPages);
  }, [licPage, licPagination.totalPages]);

  const pendingLicense = pendingDeleteId
    ? licenses.find((l) => l.id === pendingDeleteId)
    : undefined;
  const formRenewal = form.licenseDate ? getLicenseRenewalInfo(form.licenseDate) : null;

  return (
    <div className="space-y-5">
      <ConfirmDialog
        open={pendingDeleteId != null}
        title="تأكيد حذف الترخيص"
        message={
          pendingLicense ? (
            <>
              هل أنت متأكد من حذف سجل الترخيص لسنة{' '}
              <strong className="tabular-nums">{pendingLicense.licenseYear}</strong>
              {pendingLicense.amountPaid > 0 ? (
                <>
                  {' '}
                  (مبلغ <strong className="tabular-nums">{fmt(pendingLicense.amountPaid)}</strong>{' '}
                  د.أ)
                </>
              ) : null}
              ؟
            </>
          ) : (
            'هل أنت متأكد من حذف هذا السجل؟'
          )
        }
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={confirmDeleteLicense}
      />
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
          {formError && (
            <div
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 mb-3"
              role="alert"
            >
              {formError}
            </div>
          )}
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

      {sorted.length > licPageSize && (
        <PaginationBar
          page={licPagination.page}
          totalPages={licPagination.totalPages}
          rangeStart={licPagination.rangeStart}
          rangeEnd={licPagination.rangeEnd}
          total={licPagination.total}
          pageSize={licPageSize}
          onPageChange={setLicPage}
        />
      )}

      <div className="tracking-table-outer border border-slate-200 rounded-xl app-surface">
        <div className="tracking-table-scroll">
        <table className="tracking-table w-full text-sm min-w-0">
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
              licPagination.items.map((l) => {
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
                      onClick={() => setPendingDeleteId(l.id)}
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

      {sorted.length > licPageSize && (
        <PaginationBar
          page={licPagination.page}
          totalPages={licPagination.totalPages}
          rangeStart={licPagination.rangeStart}
          rangeEnd={licPagination.rangeEnd}
          total={licPagination.total}
          pageSize={licPageSize}
          onPageChange={setLicPage}
        />
      )}
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

/* ——— Settings ——— */

const SettingsTab: React.FC<{
  settings: TaxiSettings;
  entryCount: number;
  session: UserSession;
  onOpenOilTab: () => void;
  onChange: (s: TaxiSettings) => void;
  onImageChange: (image: string) => void;
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
  vehicleId: string;
  assignedUserId?: string | null;
  assignedUserDisplayName?: string | null;
  onVehicleReassigned: () => void;
  onDeletionReviewed: (req: DeletionRequestRecord) => void;
}> = ({
  settings,
  entryCount,
  session,
  onOpenOilTab,
  onChange,
  onImageChange,
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
  vehicleId,
  assignedUserId,
  assignedUserDisplayName,
  onVehicleReassigned,
  onDeletionReviewed,
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

    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
      {lang === 'ar' ? (
        <>
          إعدادات خاصة بسيارة: <strong>{settings.vehicleLabel || '—'}</strong> — الضمان، التكلفة، ومدة
          الشطب لا تُطبَّق على باقي السيارات.
        </>
      ) : (
        <>
          Settings for: <strong>{settings.vehicleLabel || '—'}</strong> — guarantee, cost, and life
          years are independent per vehicle.
        </>
      )}
    </div>

    {canReassignVehicle(session) && vehicleId && (
      <SettingsSection
        title={lang === 'ar' ? 'تعيين المستخدم' : 'User assignment'}
        subtitle={
          lang === 'ar' ? 'من يرى هذه السيارة في مرآبه' : 'Who sees this car in their garage'
        }
        icon="👤"
      >
        <VehicleAssignmentSettings
          vehicleId={vehicleId}
          assignedUserId={assignedUserId}
          assignedUserDisplayName={assignedUserDisplayName}
          lang={lang}
          onReassigned={onVehicleReassigned}
        />
      </SettingsSection>
    )}

    <SettingsSection title="إعدادات العمل" subtitle="الضمان، السائق، واسم السيارة" icon="🚕">
      <div className="mb-4 pb-4 border-b border-slate-100">
        <p className="text-sm font-medium text-slate-600 mb-2">
          صورة السيارة <span className="text-red-600">*</span>
        </p>
        <VehicleImageSettingsField
          vehicleImage={settings.vehicleImage}
          onImageChange={onImageChange}
          lang={lang}
        />
      </div>
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
            placeholder="يُعبَّأ تلقائياً عند دفع ضمان"
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 app-surface"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium text-slate-600">مالك السيارة</span>
          <input
            type="text"
            value={settings.ownerName ?? ''}
            onChange={(e) => onChange({ ...settings, ownerName: e.target.value })}
            placeholder="اسم المالك — يظهر كوسم على البطاقة"
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

    {canReviewDeletions(session) && (
      <SettingsSection
        title={lang === 'ar' ? 'موافقات الحذف' : 'Deletion approvals'}
        subtitle={
          lang === 'ar'
            ? 'طلبات الحذف من المستخدمين'
            : 'Deletion requests from users'
        }
        icon="🛡️"
      >
        <DeletionApprovalsPanel
          lang={lang}
          onReviewed={onDeletionReviewed}
        />
      </SettingsSection>
    )}

    {canManageUsers(session) && (
      <SettingsSection
        title={lang === 'ar' ? 'المستخدمون والصلاحيات' : 'Users & permissions'}
        subtitle={lang === 'ar' ? 'حسابات الفريق — مدير النظام' : 'Team accounts — system admin'}
        icon="👥"
      >
        <UsersAdminPanel session={session} lang={lang} />
      </SettingsSection>
    )}

    <SettingsSection title="الحفظ والنسخ الاحتياطي" subtitle="PostgreSQL والملفات الاحتياطية" icon="💾">
      <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg p-3">
        {storageSource === 'sql'
          ? '✓ يتم الحفظ في PostgreSQL'
          : '✓ حفظ في المتصفح — شغّل START-VIP-limousine-CARS.bat + PostgreSQL لتفعيل قاعدة البيانات'}
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
      {canImportBackup(session) && (
        <button
          type="button"
          onClick={() => backupInputRef.current?.click()}
          className="w-full py-2.5 rounded-lg border border-slate-300 text-slate-800 text-sm font-medium hover:bg-slate-50"
        >
          {lang === 'ar' ? 'استيراد نسخة احتياطية (JSON)' : 'Import backup (JSON)'}
        </button>
      )}
      {entryCount > 0 && canClearAllEntries(session) && (
        <div className="space-y-2 pt-2 border-t border-red-100">
          <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg p-3">
            ⚠{' '}
            {lang === 'ar'
              ? 'حذف السجلات الشهرية نهائي. يُطلب تأكيد مزدوج قبل التنفيذ.'
              : 'Deleting monthly entries is permanent. Double confirmation required.'}
          </p>
          <button
            type="button"
            onClick={onClearEntries}
            className="w-full py-2.5 rounded-lg border-2 border-red-300 text-red-700 text-sm font-semibold hover:bg-red-50"
          >
            {lang === 'ar' ? 'حذف كل السجلات الشهرية' : 'Delete all monthly entries'}
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

          <div className="chart-panel w-full">
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
  oilChanges: OilChangeRecord[];
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
  oilChanges,
  chartData,
  chartCaption,
  entries,
  roi,
  settings,
}) => {
  const totalOilCost = sumOilChangeCosts(oilChanges);
  const oilInSummary = totals.expenseByCategory.oil;
  const monthlyExpensesExOil = Math.max(
    0,
    baseTotals.expenseByCategory.grandTotal - baseTotals.expenseByCategory.oil
  );

  return (
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
          ...(monthlyExpensesExOil > 0
            ? [{ label: 'مصاريف المتابعة الشهرية', amount: monthlyExpensesExOil }]
            : []),
          ...(oilInSummary > 0
            ? [
                {
                  label: 'تكلفة الزيت (تبويب متابعة الزيت)',
                  amount: oilInSummary,
                  sign: '+' as const,
                },
              ]
            : []),
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
          { label: 'أشهر غير مكتملة', count: totals.lateCount },
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
        <p className="text-sm text-green-800">شهر مكتمل</p>
      </div>
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
        <p className="text-2xl font-bold text-red-700 tabular-nums">{fmtInt(totals.lateCount)}</p>
        <p className="text-sm text-red-800">شهر غير مكتمل</p>
      </div>
    </div>

    <RoiSection roi={roi} settings={settings} />

    {totalOilCost > 0 && (
      <div className="bg-white border border-orange-200 rounded-xl p-5 shadow-sm">
        <h3 className="font-semibold text-slate-800 mb-2">تكلفة الزيت (متابعة الزيت)</h3>
        <p className="text-xs text-slate-500 mb-3 leading-relaxed">
          مجموع حقل «التكلفة» في كل سجلات تبويب متابعة الزيت — مُدرَج في إجمالي المصاريف وصافي
          الربح.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-orange-50 border border-orange-100 rounded-lg p-4 text-center">
            <p className="text-xs text-slate-600">إجمالي تكلفة الزيت</p>
            <p className="text-2xl font-bold text-orange-800 tabular-nums mt-1">
              {fmt(totalOilCost)} د.أ
            </p>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 text-center">
            <p className="text-xs text-slate-600">ضمن ملخص المصاريف</p>
            <p className="text-2xl font-bold text-slate-800 tabular-nums mt-1">
              {fmt(oilInSummary)} د.أ
            </p>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 text-center">
            <p className="text-xs text-slate-600">عدد السجلات</p>
            <p className="text-2xl font-bold text-slate-800 tabular-nums mt-1">
              {fmtInt(oilChanges.length)}
            </p>
          </div>
        </div>
      </div>
    )}

    {totals.totalExpenses > 0 && (
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h3 className="font-semibold text-slate-800 mb-4">تفاصيل المصاريف (إجمالي)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          {REPORT_EXPENSE_KEYS.map((key) => {
            const val = totals.expenseByCategory[key];
            if (val <= 0) return null;
            return (
              <div key={key} className="bg-orange-50 border border-orange-100 rounded-lg p-3 text-center">
                <p className="text-xs text-slate-600">
                  {key === 'oil' ? 'زيت (تبويب الزيت)' : EXPENSE_FIELD_LABELS[key]}
                </p>
                <p className="text-lg font-bold text-orange-800 tabular-nums">{fmt(val)}</p>
              </div>
            );
          })}
          {accidentSummary.totalCost > 0 && (
            <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 text-center">
              <p className="text-xs text-slate-600">إصلاح حوادث</p>
              <p className="text-lg font-bold text-orange-800 tabular-nums">
                {fmt(accidentSummary.totalCost)}
              </p>
            </div>
          )}
          {licenseSummary.totalPaid > 0 && (
            <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 text-center">
              <p className="text-xs text-slate-600">ترخيص سنوي</p>
              <p className="text-lg font-bold text-orange-800 tabular-nums">
                {fmt(licenseSummary.totalPaid)}
              </p>
            </div>
          )}
          <div className="bg-orange-100 border border-orange-200 rounded-lg p-3 text-center">
            <p className="text-xs text-slate-600 font-semibold">إجمالي المصاريف</p>
            <p className="text-lg font-bold text-orange-900 tabular-nums">
              {fmt(totals.totalExpenses)}
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
        <div className="chart-panel w-full">
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
        <p className="text-green-700 font-medium">✓ السائق ملتزم — كل الأشهر مكتملة</p>
      ) : (
        <p className="text-red-700 font-medium">
          ⚠ يوجد {fmtInt(totals.lateCount)} شهر/أشهر غير مكتملة — المتبقي الإجمالي:{' '}
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
};

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
