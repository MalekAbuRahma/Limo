import React, { useState } from 'react';
import { Car } from '../types';
import { translations, Language } from '../translations';

interface AddCarModalProps {
  lang: Language;
  onSave: (carData: Partial<Car> & { initialDriverName: string; initialStartDate: string }) => void;
  onClose: () => void;
}

const AddCarModal: React.FC<AddCarModalProps> = ({ lang, onSave, onClose }) => {
  const t = translations[lang];
  const isRtl = lang === 'ar';

  const [formData, setFormData] = useState({
    model: '',
    purchaseCost: 32000,
    monthlyRent: 750,
    initialDriverName: '',
    initialStartDate: new Date().toISOString().split('T')[0],
    durationYears: 8
  });

  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const isNum = ['purchaseCost', 'monthlyRent', 'durationYears'].includes(name);
    setFormData(prev => ({
      ...prev,
      [name]: isNum ? (value === '' ? 0 : parseFloat(value)) : value
    }));
    setError(null);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setTouched(prev => ({ ...prev, [e.target.name]: true }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setTouched({ model: true, initialDriverName: true, initialStartDate: true });

    if (!formData.model.trim() || !formData.initialDriverName.trim() || !formData.initialStartDate) {
      setError(t.validationRequired);
      return;
    }

    if (formData.purchaseCost < 0 || formData.monthlyRent < 0 || formData.durationYears < 1) {
      setError(t.validationPositiveNumber);
      return;
    }

    onSave(formData);
  };

  const inputBase = 'w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors';
  const inputError = 'border-red-500 focus:ring-red-500 focus:border-red-500';
  const labelBase = 'block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5';

  const showError = (name: string) => error && touched[name];

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/60 flex items-center justify-center p-4 overflow-y-auto" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="bg-white rounded-lg w-full max-w-lg shadow-xl border border-slate-200 my-8">
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">{t.addVehicle}</h2>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors" aria-label={t.close}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm font-medium" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-4">
            <div>
              <label htmlFor="add-car-model" className={labelBase}>{t.carModel}</label>
              <input
                id="add-car-model"
                name="model"
                type="text"
                value={formData.model}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="e.g. Toyota Camry 2024"
                className={`${inputBase} ${showError('model') ? inputError : ''}`}
                autoComplete="off"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="add-car-rent" className={labelBase}>{t.initialRent}</label>
                <input
                  id="add-car-rent"
                  name="monthlyRent"
                  type="number"
                  min={0}
                  step={1}
                  value={formData.monthlyRent}
                  onChange={handleChange}
                  className={inputBase}
                />
                <p className="mt-1 text-xs text-slate-400">{t.currency}</p>
              </div>
              <div>
                <label htmlFor="add-car-cost" className={labelBase}>{t.initialCost}</label>
                <input
                  id="add-car-cost"
                  name="purchaseCost"
                  type="number"
                  min={0}
                  step={1}
                  value={formData.purchaseCost}
                  onChange={handleChange}
                  className={inputBase}
                />
                <p className="mt-1 text-xs text-slate-400">{t.currency}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="add-car-date" className={labelBase}>{t.startDate}</label>
                <input
                  id="add-car-date"
                  name="initialStartDate"
                  type="date"
                  value={formData.initialStartDate}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  className={`${inputBase} ${showError('initialStartDate') ? inputError : ''}`}
                />
              </div>
              <div>
                <label htmlFor="add-car-driver" className={labelBase}>{t.initialDriver}</label>
                <input
                  id="add-car-driver"
                  name="initialDriverName"
                  type="text"
                  value={formData.initialDriverName}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="Driver name"
                  className={`${inputBase} ${showError('initialDriverName') ? inputError : ''}`}
                  autoComplete="off"
                />
              </div>
            </div>

            <div>
              <label htmlFor="add-car-years" className={labelBase}>{t.years}</label>
              <input
                id="add-car-years"
                name="durationYears"
                type="number"
                min={1}
                max={30}
                value={formData.durationYears}
                onChange={handleChange}
                className={inputBase}
              />
            </div>
          </div>

          <div className={`flex gap-3 pt-2 ${isRtl ? 'flex-row-reverse' : ''}`}>
            <button type="button" onClick={onClose} className="flex-1 py-2.5 px-4 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
              {t.cancel}
            </button>
            <button type="submit" className="flex-1 py-2.5 px-4 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 border border-slate-700 transition-colors">
              {t.addVehicle}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddCarModal;
