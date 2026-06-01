import React, { useEffect, useState } from 'react';
import type { AssignableUser } from '../taxiTypes';
import { fetchAssignableUsers, updateVehicleAssignmentOnApi } from '../utils/authApi';
import type { UiLanguage } from './TaxiLogin';

interface VehicleAssignmentSettingsProps {
  vehicleId: string;
  assignedUserId?: string | null;
  assignedUserDisplayName?: string | null;
  lang: UiLanguage;
  onReassigned: () => void;
}

const VehicleAssignmentSettings: React.FC<VehicleAssignmentSettingsProps> = ({
  vehicleId,
  assignedUserId,
  assignedUserDisplayName,
  lang,
  onReassigned,
}) => {
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [selected, setSelected] = useState(assignedUserId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setSelected(assignedUserId ?? '');
  }, [assignedUserId]);

  useEffect(() => {
    void fetchAssignableUsers().then(setUsers);
  }, []);

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    setError('');
    const ok = await updateVehicleAssignmentOnApi(vehicleId, selected);
    setSaving(false);
    if (!ok) {
      setError(lang === 'ar' ? 'تعذّر تحديث التعيين' : 'Failed to update assignment');
      return;
    }
    onReassigned();
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        {lang === 'ar' ? 'المستخدم الحالي:' : 'Current assignee:'}{' '}
        <strong>{assignedUserDisplayName || (lang === 'ar' ? 'غير معيّن' : 'Unassigned')}</strong>
      </p>
      <label className="block">
        <span className="text-sm font-medium text-slate-600">
          {lang === 'ar' ? 'نقل السيارة إلى مستخدم' : 'Reassign to user'}
        </span>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">{lang === 'ar' ? '— اختر —' : '— Select —'}</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.displayName} (@{u.username})
            </option>
          ))}
        </select>
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        disabled={saving || !selected || selected === assignedUserId}
        onClick={() => void handleSave()}
        className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
      >
        {saving
          ? lang === 'ar'
            ? 'جاري الحفظ...'
            : 'Saving...'
          : lang === 'ar'
            ? 'حفظ التعيين'
            : 'Save assignment'}
      </button>
    </div>
  );
};

export default VehicleAssignmentSettings;
