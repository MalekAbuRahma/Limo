import React, { useState } from 'react';
import { translations, Language } from '../translations';
import AppModal, { AppModalBody, AppModalFooter, AppModalHeader } from './AppModal';

interface HandoverModalProps {
  lang: Language;
  onSave: (data: { driverName: string; startDate: string; endDate?: string; notes: string }) => void;
  onClose: () => void;
  currentDriverStartDate?: string;
}

const HandoverModal: React.FC<HandoverModalProps> = ({ lang, onSave, onClose, currentDriverStartDate }) => {
  const t = translations[lang];
  const isRtl = lang === 'ar';

  const [formData, setFormData] = useState({
    driverName: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    notes: '',
  });

  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.driverName.trim() || !formData.startDate) {
      setError(t.validationRequired);
      return;
    }

    if (currentDriverStartDate && formData.startDate < currentDriverStartDate) {
      setError(t.validationDateOrder);
      return;
    }

    onSave(formData);
  };

  const inputClass =
    'w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none';
  const labelClass = 'block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5';

  return (
    <AppModal open onClose={onClose} size="lg" zIndex={200} dir={isRtl ? 'rtl' : 'ltr'}>
      <form className="flex flex-col min-h-0 overflow-hidden" onSubmit={handleSubmit}>
        <AppModalHeader>
          <div className="flex justify-between items-center gap-3">
            <h2 className="text-lg font-semibold text-slate-900">{t.handoverVehicle}</h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
              aria-label={t.close}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </AppModalHeader>

        <AppModalBody className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm font-medium" role="alert">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="handover-driver" className={labelClass}>
                {t.newDriverName}
              </label>
              <input
                id="handover-driver"
                type="text"
                required
                value={formData.driverName}
                onChange={(e) => setFormData({ ...formData, driverName: e.target.value })}
                className={inputClass}
                placeholder="Driver name"
              />
            </div>
            <div>
              <label htmlFor="handover-date" className={labelClass}>
                {t.startDate}
              </label>
              <input
                id="handover-date"
                type="date"
                required
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label htmlFor="handover-notes" className={labelClass}>
              {t.notes}
            </label>
            <textarea
              id="handover-notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className={`${inputClass} min-h-[80px] resize-y`}
              placeholder="Optional notes"
              rows={3}
            />
          </div>
        </AppModalBody>

        <AppModalFooter>
          <div className={`flex gap-3 pt-3 ${isRtl ? 'flex-row-reverse' : ''}`}>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 px-4 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 border border-slate-700"
            >
              {t.saveHandover}
            </button>
          </div>
        </AppModalFooter>
      </form>
    </AppModal>
  );
};

export default HandoverModal;
