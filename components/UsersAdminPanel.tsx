import React, { useCallback, useEffect, useState } from 'react';
import type { UiLanguage } from './TaxiLogin';
import type { UserRole, UserSession } from '../utils/taxiAuth';
import {
  createAdminUser,
  fetchAdminUsers,
  updateAdminUser,
  type AdminUserRecord,
} from '../utils/authApi';
import { checkApiHealth } from '../utils/taxiApi';
import { roleLabel } from '../utils/permissions';

interface UsersAdminPanelProps {
  session: UserSession;
  lang: UiLanguage;
}

const copy = {
  ar: {
    title: 'إدارة المستخدمين',
    subtitle: 'إضافة مستخدمين وتعيين الصلاحيات — المدير فقط',
    username: 'اسم المستخدم',
    displayName: 'الاسم المعروض',
    password: 'كلمة المرور',
    role: 'الدور',
    admin: 'مدير',
    user: 'مستخدم',
    add: 'إضافة مستخدم',
    refresh: 'تحديث',
    active: 'نشط',
    inactive: 'معطّل',
    deactivate: 'تعطيل',
    activate: 'تفعيل',
    resetPassword: 'تغيير كلمة المرور',
    save: 'حفظ',
    cancel: 'إلغاء',
    noApi: 'يتطلب اتصال الخادم وقاعدة البيانات',
    loading: 'جاري التحميل...',
    empty: 'لا يوجد مستخدمون',
    you: '(أنت)',
    newPassword: 'كلمة مرور جديدة',
  },
  en: {
    title: 'User management',
    subtitle: 'Add users and assign roles — administrators only',
    username: 'Username',
    displayName: 'Display name',
    password: 'Password',
    role: 'Role',
    admin: 'Admin',
    user: 'User',
    add: 'Add user',
    refresh: 'Refresh',
    active: 'Active',
    inactive: 'Disabled',
    deactivate: 'Deactivate',
    activate: 'Activate',
    resetPassword: 'Change password',
    save: 'Save',
    cancel: 'Cancel',
    noApi: 'Requires server and database connection',
    loading: 'Loading...',
    empty: 'No users yet',
    you: '(you)',
    newPassword: 'New password',
  },
} as const;

const UsersAdminPanel: React.FC<UsersAdminPanelProps> = ({ session, lang }) => {
  const t = copy[lang];
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiUp, setApiUp] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    username: '',
    displayName: '',
    password: '',
    role: 'user' as UserRole,
  });
  const [passwordEditId, setPasswordEditId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const load = useCallback(async () => {
    if (!session.token) {
      setApiUp(false);
      setLoading(false);
      return;
    }
    const up = await checkApiHealth();
    setApiUp(up);
    if (!up) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const list = await fetchAdminUsers(session.token);
      setUsers(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [session.token]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session.token) return;
    setError('');
    try {
      await createAdminUser(session.token, {
        username: form.username,
        password: form.password,
        displayName: form.displayName || form.username,
        role: form.role,
      });
      setForm({ username: '', displayName: '', password: '', role: 'user' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  const toggleActive = async (u: AdminUserRecord) => {
    if (!session.token) return;
    setError('');
    try {
      await updateAdminUser(session.token, u.id, { active: !u.active });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  const changeRole = async (u: AdminUserRecord, role: UserRole) => {
    if (!session.token || u.role === role) return;
    setError('');
    try {
      await updateAdminUser(session.token, u.id, { role });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  const savePassword = async (userId: string) => {
    if (!session.token || !newPassword.trim()) return;
    setError('');
    try {
      await updateAdminUser(session.token, userId, { password: newPassword });
      setPasswordEditId(null);
      setNewPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  if (!apiUp && !loading) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {t.noApi}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
        <h3 className="font-semibold text-slate-800">{t.title}</h3>
        <p className="text-xs text-slate-500 mt-0.5">{t.subtitle}</p>
      </div>

      <form onSubmit={handleAdd} className="p-4 border-b border-slate-100 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-500">{t.username}</span>
            <input
              type="text"
              required
              minLength={2}
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              autoComplete="off"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-500">{t.displayName}</span>
            <input
              type="text"
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-500">{t.password}</span>
            <input
              type="password"
              required
              minLength={4}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              autoComplete="new-password"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-500">{t.role}</span>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="user">{t.user}</option>
              <option value="admin">{t.admin}</option>
            </select>
          </label>
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700"
        >
          {t.add}
        </button>
      </form>

      {error && (
        <div className="mx-4 mt-3 p-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
          {error}
        </div>
      )}

      <div className="p-4">
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm font-medium text-slate-600">
            {loading ? t.loading : `${users.length} ${lang === 'ar' ? 'مستخدم' : 'users'}`}
          </span>
          <button
            type="button"
            onClick={() => void load()}
            className="text-xs text-green-700 font-medium hover:underline"
          >
            {t.refresh}
          </button>
        </div>

        {users.length === 0 && !loading ? (
          <p className="text-sm text-slate-500 text-center py-4">{t.empty}</p>
        ) : (
          <ul className="space-y-2">
            {users.map((u) => (
              <li
                key={u.id}
                className={`rounded-lg border px-3 py-2.5 ${
                  u.active ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-75'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-800">
                      {u.displayName}
                      {u.id === session.id && (
                        <span className="text-xs text-slate-400 ms-1">{t.you}</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500 tabular-nums">@{u.username}</p>
                    <span
                      className={`inline-block mt-1 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                        u.role === 'admin'
                          ? 'bg-violet-100 text-violet-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {roleLabel(u.role, lang)}
                      {!u.active && ` · ${t.inactive}`}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <select
                      value={u.role}
                      disabled={u.id === session.id}
                      onChange={(e) => void changeRole(u, e.target.value as UserRole)}
                      className="text-xs border border-slate-200 rounded px-2 py-1"
                      aria-label={t.role}
                    >
                      <option value="user">{t.user}</option>
                      <option value="admin">{t.admin}</option>
                    </select>
                    {u.id !== session.id && (
                      <button
                        type="button"
                        onClick={() => void toggleActive(u)}
                        className="text-xs px-2 py-1 border border-slate-200 rounded hover:bg-slate-50"
                      >
                        {u.active ? t.deactivate : t.activate}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setPasswordEditId(u.id);
                        setNewPassword('');
                      }}
                      className="text-xs px-2 py-1 border border-slate-200 rounded hover:bg-slate-50"
                    >
                      {t.resetPassword}
                    </button>
                  </div>
                </div>
                {passwordEditId === u.id && (
                  <div className="mt-2 flex flex-wrap gap-2 items-end border-t border-slate-100 pt-2">
                    <label className="flex-1 min-w-[140px]">
                      <span className="text-xs text-slate-500">{t.newPassword}</span>
                      <input
                        type="password"
                        minLength={4}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="mt-1 w-full border border-slate-200 rounded px-2 py-1.5 text-sm"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void savePassword(u.id)}
                      className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg"
                    >
                      {t.save}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPasswordEditId(null)}
                      className="px-3 py-1.5 text-xs text-slate-600"
                    >
                      {t.cancel}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default UsersAdminPanel;
