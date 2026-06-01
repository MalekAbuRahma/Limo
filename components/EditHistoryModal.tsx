import React, { useState, useEffect } from 'react';
import { DriverHistoryEntry } from '../types';
import { translations, Language } from '../translations';
import AppModal, { AppModalBody, AppModalFooter, AppModalHeader } from './AppModal';

interface EditHistoryModalProps {
  lang: Language;
  entry: DriverHistoryEntry;
  onSave: (updatedEntry: DriverHistoryEntry) => void;
  onClose: () => void;
}

const EditHistoryModal: React.FC<EditHistoryModalProps> = ({ lang, entry, onSave, onClose }) => {
  const t = translations[lang];
  const isRtl = lang === 'ar';

  const [formData, setFormData] = useState<DriverHistoryEntry>({ ...entry });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFormData({ ...entry });
  }, [entry]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.driverName.trim() || !formData.startDate) {
      setError(t.validationRequired);
      return;
    }

    if (formData.endDate && formData.endDate < formData.startDate) {
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
            <h2 className="text-lg font-semibold text-slate-900">{t.editHistoryEntry}</h2>
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="edit-driver" className={labelClass}>
                {t.driver}
              </label>
              <input
                id="edit-driver"
                type="text"
                required
                value={formData.driverName}
                onChange={(e) => setFormData({ ...formData, driverName: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="edit-start" className={labelClass}>
                {t.startDate}
              </label>
              <input
                id="edit-start"
                type="date"
                required
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="edit-end" className={labelClass}>
                {t.endDate}
              </label>
              <input
                id="edit-end"
                type="date"
                value={formData.endDate || ''}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label htmlFor="edit-notes" className={labelClass}>
              {t.notes}
            </label>
            <textarea
              id="edit-notes"
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className={`${inputClass} min-h-[80px] resize-y`}
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
              {t.updateEntry}
            </button>
          </div>
        </AppModalFooter>
      </form>
    </AppModal>
  );
};

export default EditHistoryModal;
