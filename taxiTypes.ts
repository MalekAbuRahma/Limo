export interface ExpenseBreakdown {
  office: number;
  insurance: number;
  oil: number;
  maintenance: number;
  /** تعطل بسبب حادث */
  accident: number;
  commission: number;
  other: number;
}

export const EMPTY_EXPENSES: ExpenseBreakdown = {
  office: 0,
  insurance: 0,
  oil: 0,
  maintenance: 0,
  accident: 0,
  commission: 0,
  other: 0,
};

export const EXPENSE_FIELD_LABELS: Record<keyof ExpenseBreakdown, string> = {
  office: 'مكتب',
  insurance: 'تأمين',
  oil: 'زيت',
  maintenance: 'صيانة',
  accident: 'تعطل (حادث)',
  commission: 'كومسيون',
  other: 'أخرى',
};

/** حقول المصاريف في نموذج المتابعة الشهرية — الزيت من تبويب «متابعة الزيت» */
export const VISIBLE_EXPENSE_KEYS = [
  'maintenance',
  'accident',
  'commission',
  'other',
] as const satisfies readonly (keyof ExpenseBreakdown)[];

/** كل بنود المصاريف في الملخص والتصدير (يشمل الزيت من سجلات التبويب) */
export const REPORT_EXPENSE_KEYS = [
  'oil',
  ...VISIBLE_EXPENSE_KEYS,
] as const satisfies readonly (keyof ExpenseBreakdown)[];

/** سجل حادث / تأمين */
export interface AccidentRecord {
  id: string;
  accidentDate: string;
  /** السائق المسبب */
  responsibleDriver: string;
  /** عدد أيام التعطل */
  downtimeDays: number;
  details: string;
  /** قيمة الإصلاح (د.أ) — تُخصم من الملخص */
  cost: number;
  /** مبلغ سيدفعه التأمين لاحقاً */
  insurancePending: number;
  /** التعويض من التأمين (مستلم) */
  insuranceReceived: number;
}

export const DRIVER_PAYMENT_LABELS = ['دفع ضمان ١', 'دفع ضمان ٢', 'دفع ضمان ٣'] as const;
export type DriverPaymentTriple = [number, number, number];

export interface MonthlyEntry {
  id: string;
  date: string;
  month: string;
  driverName: string;
  revenue: number;
  /** مجموع المصاريف (يُحسب من التفاصيل) */
  expenses: number;
  expenseDetails: ExpenseBreakdown;
  notes?: string;
  /** مدفوع السائق — مجموع الأقساط (يُحدَّث عند الحفظ) */
  driverPaid: number;
  /** ثلاث دفعات: الإيراد ÷ ٣ (مثلاً ٢٥٠ + ٢٥٠ + ٢٥٠ عند إيراد ٧٥٠) */
  driverPayments?: DriverPaymentTriple;
  /** تسديد مكتمل يدوياً (حتى لو المتبقي > 0) */
  paymentComplete?: boolean;
  /** الضمان المطبّق عند الحفظ — لا يتغيّر إذا غيّرت الإعدادات لاحقاً */
  monthlyGuarantee?: number;
}

export type FontSizeOption = 'normal' | 'large' | 'xlarge';

/** مظهر العرض: فاتح، مريح، داكن، تباين عالٍ */
export type DisplayThemeOption = 'default' | 'comfort' | 'dark' | 'contrast';

export const FONT_SIZE_LABELS: Record<FontSizeOption, string> = {
  normal: 'عادي',
  large: 'كبير',
  xlarge: 'كبير جداً',
};

export const DISPLAY_THEME_LABELS: Record<DisplayThemeOption, string> = {
  default: 'فاتح',
  comfort: 'مريح',
  dark: 'داكن',
  contrast: 'تباين عالٍ',
};

export interface TaxiSettings {
  monthlyGuarantee: number;
  currentDriverName: string;
  vehicleLabel: string;
  /** صورة السيارة (data URL — jpeg مضغوط) */
  vehicleImage?: string;
  /** تكلفة شراء السيارة (رأس المال) */
  vehicleCost: number;
  /** مدة الاستخدام قبل الشطب بالسنوات */
  vehicleLifeYears: number;
  /** حجم النص والأرقام */
  fontSize: FontSizeOption;
  /** مظهر الألوان */
  displayTheme: DisplayThemeOption;
  /** أرقام عريضة أوضح */
  boldNumbers: boolean;
  /** أزرار أكبر للمس (موبايل) */
  largeButtons: boolean;
  /** تباعد أسطر أوسع للقراءة */
  comfortableReading: boolean;
  /** مبالغ تأمين مستلمة (إجمالي — غير مرتبطة بسجل حادث محدد) */
  insuranceReceivedTotal: number;
  /** مالك السيارة — يظهر كوسم (Tag) */
  ownerName: string;
}

/** تكلفة ترخيص السيارة لسنة واحدة */
export interface LicenseRecord {
  id: string;
  /** تاريخ الترخيص YYYY-MM-DD */
  licenseDate: string;
  /** السنة — تُستخرج من التاريخ */
  licenseYear: number;
  /** المبلغ المدفوع (د.أ) */
  amountPaid: number;
  notes: string;
}

/** سجل تغيير زيت مرتبط بشهر في المتابعة */
export interface OilChangeRecord {
  id: string;
  /** ربط بسجل الشهر في المتابعة الشهرية */
  entryId: string;
  /** تاريخ التغيير YYYY-MM-DD */
  changeDate: string;
  /** تكلفة الزيت (د.أ) */
  cost: number;
  /** نوع الزيت — تخليقي، معدني، ... */
  oilType: string;
  /** عيار / لزوجة الزيت — مثل 5W-30 */
  oilGrade: string;
  /** العداد الحالي عند التغيير */
  currentOdometer: number;
  /** المسافة المقطوعة منذ آخر تغيير */
  distanceKm: number;
  /** العداد المتوقع عند التغيير القادم */
  nextOdometer: number;
  notes: string;
}

export interface TaxiAppState {
  settings: TaxiSettings;
  entries: MonthlyEntry[];
  accidents: AccidentRecord[];
  licenses: LicenseRecord[];
  oilChanges: OilChangeRecord[];
}

/** إعدادات عامة للأسطول (مظهر الواجهة) */
export interface FleetGlobalSettings {
  fontSize: FontSizeOption;
  displayTheme: DisplayThemeOption;
  boldNumbers: boolean;
  largeButtons: boolean;
  comfortableReading: boolean;
}

export type VehicleCardPropertyTone = 'ok' | 'warn' | 'danger' | 'neutral';

export interface VehicleCardProperty {
  id: 'current-settlement' | 'license-renewal';
  label: string;
  value: string;
  hint?: string;
  tone: VehicleCardPropertyTone;
}

/** بطاقة سيارة في المرآب */
export interface VehicleListItem {
  id: string;
  label: string;
  vehicleImage: string;
  ownerName: string;
  monthlyGuarantee: number;
  currentDriverName: string;
  vehicleCost: number;
  vehicleLifeYears: number;
  entryCount: number;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  /** تسوية الشهر الحالي + ترخيص السيارة */
  cardProperties: VehicleCardProperty[];
  /** المستخدم المسؤول عن هذه السيارة */
  assignedUserId?: string | null;
  assignedUserDisplayName?: string | null;
  assignedUsername?: string | null;
}

export interface AssignableUser {
  id: string;
  username: string;
  displayName: string;
  role: 'admin' | 'user';
}

export interface FleetData {
  globalSettings: FleetGlobalSettings;
  vehicles: VehicleListItem[];
}

/** Initial per-vehicle business settings when adding a car */
export interface VehicleCreateInput {
  label: string;
  vehicleImage?: string;
  /** مالك السيارة */
  ownerName?: string;
  monthlyGuarantee?: number;
  currentDriverName?: string;
  vehicleCost?: number;
  vehicleLifeYears?: number;
  /** المستخدم المسؤول — إجباري عند الإنشاء */
  assignedUserId: string;
}

export const DEFAULT_SETTINGS: TaxiSettings = {
  monthlyGuarantee: 750,
  currentDriverName: '',
  vehicleLabel: 'VIP limousine CARS',
  vehicleCost: 33000,
  vehicleLifeYears: 7,
  fontSize: 'normal',
  displayTheme: 'default',
  boldNumbers: false,
  largeButtons: false,
  comfortableReading: false,
  insuranceReceivedTotal: 0,
  ownerName: '',
};
