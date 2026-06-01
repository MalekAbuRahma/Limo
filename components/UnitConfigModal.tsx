import React, { useState } from 'react';
import { Car } from '../types';
import { translations, Language } from '../translations';

interface UnitConfigModalProps {
  car: Car;
  lang: Language;
  onSave: (updatedFields: Partial<Car>) => void;
  onClose: () => void;
}

const UnitConfigModal: React.FC<UnitConfigModalProps> = ({ car, lang, onSave, onClose }) => {
  const t = translations[lang];
  const isRtl = lang === 'ar';

  const [localConfig, setLocalConfig] = useState({
    monthlyRent: car.monthlyRent,
    purchaseCost: car.purchaseCost,
    durationYears: car.durationYears
  });

  const totalExpenses = (Object.values(car.expenses || {}) as number[]).reduce((a, b) => a + b, 0);
  const liveNetMonthly = localConfig.monthlyRent - totalExpenses;
  const liveYearly = liveNetMonthly * 12;
  const liveDurationProfit = liveNetMonthly * 12 * localConfig.durationYears;

  const allowNumericKey = (e: React.KeyboardEvent<HTMLInputElement>, integersOnly = false) => {
    const key = e.key;
    const allowed = ['Backspace', 'Tab', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (allowed.includes(key)) return;
    if (integersOnly) {
      if (!/^\d$/.test(key)) e.preventDefault();
      return;
    }
    if (key === '.' || key === ',') return;
    if (!/^\d$/.test(key)) e.preventDefault();
  };

  const handleLocalConfigChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const numValue = value === '' ? 0 : parseFloat(value);
    const safeNum = name === 'durationYears' ? Math.max(1, Math.min(50, numValue)) : Math.max(0, numValue);
    setLocalConfig(prev => ({ ...prev, [name]: safeNum }));
  };

  const handleSave = () => {
    onSave({
      monthlyRent: localConfig.monthlyRent,
      purchaseCost: localConfig.purchaseCost,
      durationYears: localConfig.durationYears
    });
  };

  const inputClass = 'w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none';
  const labelClass = 'block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5';

  return (
    <div className="fixed inset-0 z-[150] bg-slate-900/60 flex items-center justify-center p-4" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="bg-white rounded-lg w-full max-w-lg shadow-xl border border-slate-200 overflow-hidden">
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">{t.unitConfig}</h2>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg" aria-label={t.close}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className={labelClass}>{t.carModel}</label>
            <div className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 cursor-not-allowed" aria-readonly>
              {car.model}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>{t.monthlyRent}</label>
              <div className="flex items-center gap-2">
                <input type="number" inputMode="numeric" step="10" min="0" name="monthlyRent" value={localConfig.monthlyRent} onKeyDown={(e) => allowNumericKey(e, false)} onChange={handleLocalConfigChange} className={inputClass} />
                <span className="text-xs text-slate-500">{t.currency}</span>
              </div>
            </div>
            <div>
              <label className={labelClass}>{t.purchasePrice}</label>
              <div className="flex items-center gap-2">
                <input type="number" inputMode="numeric" step="100" min="0" name="purchaseCost" value={localConfig.purchaseCost} onKeyDown={(e) => allowNumericKey(e, false)} onChange={handleLocalConfigChange} className={inputClass} />
                <span className="text-xs text-slate-500">{t.currency}</span>
              </div>
            </div>
          </div>
          <div>
            <label className={labelClass}>{t.years}</label>
            <input type="number" inputMode="numeric" step="1" min="1" max="50" name="durationYears" value={localConfig.durationYears} onKeyDown={(e) => allowNumericKey(e, true)} onChange={handleLocalConfigChange} className={inputClass} />
          </div>
          <div className="pt-4 pb-2 border-t border-slate-200 space-y-3">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{t.yearlyForecast}</p>
            <p className="text-xl font-semibold text-slate-900 tabular-nums">{liveYearly.toLocaleString()} {t.currency}</p>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{t.lifetimePerformance}</p>
            <p className="text-xl font-semibold text-slate-900 tabular-nums">{liveDurationProfit.toLocaleString()} {t.currency}</p>
          </div>
          <div className={`flex gap-3 pt-4 ${isRtl ? 'flex-row-reverse' : ''}`}>
            <button type="button" onClick={onClose} className="flex-1 py-2.5 px-4 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">
              {t.cancel}
            </button>
            <button type="button" onClick={handleSave} className="flex-1 py-2.5 px-4 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 border border-slate-700">
              {t.save}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UnitConfigModal;
