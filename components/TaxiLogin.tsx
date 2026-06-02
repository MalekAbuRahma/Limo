import React, { useState } from 'react';
import { loginViaApi } from '../utils/authApi';
import { checkApiHealth } from '../utils/taxiApi';
import { saveSession, sessionFromApiUser, type UserSession } from '../utils/taxiAuth';

export type UiLanguage = 'ar' | 'en';

const copy = {
  ar: {
    title: 'VIP limousine CARS',
    subtitle: 'تسجيل الدخول للوصول إلى لوحة التحكم',
    username: 'اسم المستخدم',
    password: 'كلمة المرور',
    submit: 'دخول',
    restricted: 'البيانات محفوظة على الخادم — يتطلب حساباً صالحاً',
    serverUnavailable: 'تعذّر الاتصال بالخادم — حاول لاحقاً أو تواصل مع الدعم',
    error: 'تحقق من اسم المستخدم وكلمة المرور',
    staleApi:
      'خادم API قديم — أوقف التطبيق (STOP-VIP-limousine-CARS.bat) ثم شغّله من جديد (START-VIP-limousine-CARS.bat)',
    lang: 'اللغة',
    hint: 'المدير: admin / 1234 — أو admin / admin بعد أول إعداد',
  },
  en: {
    title: 'VIP limousine CARS',
    subtitle: 'Sign in to access your dashboard',
    username: 'Username',
    password: 'Password',
    submit: 'Sign in',
    restricted: 'Data is stored on the server — valid account required',
    serverUnavailable: 'Cannot reach the server — try again later or contact support',
    error: 'Invalid username or password',
    staleApi:
      'API server is outdated — run STOP-VIP-limousine-CARS.bat then START-VIP-limousine-CARS.bat',
    lang: 'Language',
    hint: 'Admin: admin / 1234 — or admin / admin after first setup',
  },
} as const;

interface TaxiLoginProps {
  onLogin: (session: UserSession) => void;
  lang: UiLanguage;
  setLang: (lang: UiLanguage) => void;
}

const TaxiLogin: React.FC<TaxiLoginProps> = ({ onLogin, lang, setLang }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const t = copy[lang];
  const isRtl = lang === 'ar';

  const finish = (session: UserSession) => {
    saveSession(session);
    onLogin(session);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(false);
    setErrorMessage('');
    setBusy(true);

    const apiUp = await checkApiHealth(true);

    if (!apiUp) {
      setError(true);
      setErrorMessage(t.serverUnavailable);
      setBusy(false);
      return;
    }

    const result = await loginViaApi(username, password);
    if (result.ok) {
      finish(sessionFromApiUser(result.user, result.token));
      setBusy(false);
      return;
    }
    setError(true);
    setErrorMessage(result.reason === 'not_found' ? t.staleApi : t.error);
    setBusy(false);
  };

  return (
    <div
      className="login-page min-h-[100dvh] flex items-center justify-center bg-slate-100 px-4 py-8 sm:py-12"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div
        className={`login-page__lang absolute z-10 flex gap-2 top-[max(1rem,env(safe-area-inset-top))] ${
          isRtl
            ? 'start-[max(1rem,env(safe-area-inset-left))]'
            : 'end-[max(1rem,env(safe-area-inset-right))]'
        }`}
      >
        <button
          type="button"
          onClick={() => setLang('en')}
          className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
            lang === 'en'
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          English
        </button>
        <button
          type="button"
          onClick={() => setLang('ar')}
          className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
            lang === 'ar'
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          العربية
        </button>
      </div>

      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
          <div className="px-6 py-8 border-b border-slate-100 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-green-500 to-green-700 rounded-full mb-4 shadow-md">
              <svg
                className="w-7 h-7 text-white"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <path d="M5 17h14l-1.5-5.5a2 2 0 00-1.9-1.4H8.4a2 2 0 00-1.9 1.4L5 17z" />
                <circle cx="7.5" cy="17.5" r="1.5" />
                <circle cx="16.5" cy="17.5" r="1.5" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-slate-900">{t.title}</h1>
            <p className="text-sm text-slate-500 mt-1">{t.subtitle}</p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div
                className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm font-medium"
                role="alert"
              >
                {errorMessage || t.error}
              </div>
            )}
            <label className="block">
              <span className="text-xs font-medium text-slate-500 mb-1.5 block">{t.username}</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:ring-2 focus:ring-green-500/30 focus:border-green-600 outline-none"
                placeholder={lang === 'ar' ? 'admin' : 'admin'}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500 mb-1.5 block">{t.password}</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:ring-2 focus:ring-green-500/30 focus:border-green-600 outline-none"
                placeholder="••••••••"
              />
            </label>
            <div className="pt-2">
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 shadow-sm disabled:opacity-60"
              >
                {busy ? (lang === 'ar' ? 'جاري الدخول...' : 'Signing in...') : t.submit}
              </button>
            </div>
          </form>

          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-400">{t.restricted}</p>
            <p className="text-[10px] text-slate-400 mt-1">{t.hint}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaxiLogin;
