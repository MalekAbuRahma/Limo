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

export const SettingsSection: React.FC<{
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
