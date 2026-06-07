import React, { useState } from 'react';
import {
  DISPLAY_THEME_LABELS,
  FONT_SIZE_LABELS,
  type DisplayThemeOption,
  type FontSizeOption,
  type TaxiSettings,
} from '../taxiTypes';
import { formatNumber } from '../utils/taxiFormat';

const fmt = formatNumber;

// ── accent palette ───────────────────────────────────────────────────────────
type SectionAccent = 'blue' | 'emerald' | 'amber' | 'violet' | 'rose' | 'slate' | 'orange' | 'teal';

const ACCENT: Record<SectionAccent, { border: string; icon: string; badge: string; dot: string }> = {
  blue:    { border: 'border-blue-500',   icon: 'bg-blue-50 text-blue-600',   badge: 'bg-blue-100 text-blue-700',   dot: 'bg-blue-500'   },
  emerald: { border: 'border-emerald-500',icon: 'bg-emerald-50 text-emerald-600', badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  amber:   { border: 'border-amber-400',  icon: 'bg-amber-50 text-amber-600',  badge: 'bg-amber-100 text-amber-700',  dot: 'bg-amber-400'  },
  violet:  { border: 'border-violet-500', icon: 'bg-violet-50 text-violet-600',badge: 'bg-violet-100 text-violet-700',dot: 'bg-violet-500' },
  rose:    { border: 'border-rose-500',   icon: 'bg-rose-50 text-rose-600',    badge: 'bg-rose-100 text-rose-700',    dot: 'bg-rose-500'   },
  slate:   { border: 'border-slate-400',  icon: 'bg-slate-100 text-slate-600', badge: 'bg-slate-100 text-slate-600',  dot: 'bg-slate-400'  },
  orange:  { border: 'border-orange-500', icon: 'bg-orange-50 text-orange-600',badge: 'bg-orange-100 text-orange-700',dot: 'bg-orange-500' },
  teal:    { border: 'border-teal-500',   icon: 'bg-teal-50 text-teal-600',    badge: 'bg-teal-100 text-teal-700',    dot: 'bg-teal-500'   },
};

// ── SettingsToggle ───────────────────────────────────────────────────────────
export const SettingsToggle: React.FC<{
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

// ── SettingsSection ──────────────────────────────────────────────────────────
export const SettingsSection: React.FC<{
  title: string;
  subtitle?: string;
  icon?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  accent?: SectionAccent;
  badge?: string;
  required?: boolean;
}> = ({
  title,
  subtitle,
  icon,
  children,
  defaultOpen = true,
  accent = 'slate',
  badge,
  required = false,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const a = ACCENT[accent];

  return (
    <section
      dir="rtl"
      className={`app-surface rounded-2xl shadow-sm overflow-hidden border border-slate-200 border-r-4 ${a.border} transition-all`}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-right hover:bg-slate-50/70 transition-colors"
        aria-expanded={open}
      >
        {/* Icon pill */}
        {icon && (
          <span className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-lg ${a.icon}`}>
            {icon}
          </span>
        )}

        {/* Title + subtitle */}
        <div className="flex-1 min-w-0 text-right">
          <div className="flex items-center gap-2 justify-end flex-wrap">
            <h3 className="font-semibold text-slate-800 text-sm leading-snug">{title}</h3>
            {required && <span className="text-red-500 text-xs font-bold">*</span>}
            {badge && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${a.badge}`}>
                {badge}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">{subtitle}</p>
          )}
        </div>

        {/* Chevron */}
        <span
          className={`shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 text-[10px] transition-transform duration-200 ${
            open ? 'rotate-90' : ''
          }`}
        >
          ‹
        </span>
      </button>

      {/* Content */}
      {open && (
        <div className="px-4 pb-5 pt-3 border-t border-slate-100 space-y-4">
          {children}
        </div>
      )}
    </section>
  );
};

// ── FieldRow helper ──────────────────────────────────────────────────────────
export const FieldRow: React.FC<{
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  wide?: boolean;
}> = ({ label, hint, required, children, wide }) => (
  <div className={wide ? 'col-span-full' : ''}>
    <label className="block">
      <span className="text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500 mr-1">*</span>}
      </span>
      <div className="mt-1">{children}</div>
      {hint && <p className="text-[11px] text-slate-400 mt-1 leading-snug">{hint}</p>}
    </label>
  </div>
);

// ── DisplayPreferencesPanel ──────────────────────────────────────────────────
export const DisplayPreferencesPanel: React.FC<{
  settings: TaxiSettings;
  onChange: (s: TaxiSettings) => void;
  compact?: boolean;
  lang?: 'ar' | 'en';
}> = ({ settings, onChange, compact = false, lang = 'ar' }) => {
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
        <p className="text-sm font-medium text-slate-700 mb-2">
          {lang === 'ar' ? 'مظهر الألوان' : 'Color theme'}
        </p>
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
        <p className="text-sm font-medium text-slate-700 mb-2">
          {lang === 'ar' ? 'حجم النص والأرقام' : 'Text size'}
        </p>
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
          label={lang === 'ar' ? 'تكبير أزرار الأداة' : 'Larger buttons'}
          hint={
            lang === 'ar'
              ? 'أزرار أكبر للمس على الجوال واللابتوب'
              : 'Easier to tap on mobile'
          }
          checked={settings.largeButtons ?? false}
          onChange={(largeButtons) => onChange({ ...settings, largeButtons })}
        />
        <SettingsToggle
          label={lang === 'ar' ? 'أرقام أوضح' : 'Bold numbers'}
          hint={lang === 'ar' ? 'جعل المبالغ والأرقام بخط عريض' : 'Bold amounts in tables'}
          checked={settings.boldNumbers ?? false}
          onChange={(boldNumbers) => onChange({ ...settings, boldNumbers })}
        />
        <SettingsToggle
          label={lang === 'ar' ? 'تجربة قراءة مريحة' : 'Comfortable reading'}
          hint={
            lang === 'ar' ? 'تباعد أسطر أوسع في الجداول والنصوص' : 'More line spacing'
          }
          checked={settings.comfortableReading ?? false}
          onChange={(comfortableReading) => onChange({ ...settings, comfortableReading })}
        />
      </div>

      {!compact && (
        <div className="display-preview-box">
          <p className="text-xs app-text-muted mb-2">
            {lang === 'ar' ? 'معاينة مباشرة' : 'Live preview'}
          </p>
          <p className="font-semibold text-slate-800">VIP limousine CARS — 05/2026</p>
          <p className="tabular-nums text-green-700 font-semibold mt-1">
            {lang === 'ar' ? 'إيراد' : 'Revenue'}: {fmt(750)} د.أ
          </p>
          <p className="tabular-nums text-orange-700 mt-0.5">
            {lang === 'ar' ? 'مصاريف' : 'Expenses'}: {fmt(120)} د.أ
          </p>
        </div>
      )}
    </div>
  );
};
