import React, { useState } from 'react';
import { translations, Language } from '../translations';

interface LoginProps {
  onLogin: (username: string) => void;
  lang: Language;
  setLang: (l: Language) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin, lang, setLang }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  const t = translations[lang];
  const isRtl = lang === 'ar';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(false);
    onLogin(username || 'malek');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4 py-12" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="absolute top-6 right-6 flex gap-2 z-10">
        <button
          onClick={() => setLang('en')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${lang === 'en' ? 'bg-white text-slate-900 border-slate-200 shadow-sm' : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200'}`}
        >
          English
        </button>
        <button
          onClick={() => setLang('ar')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${lang === 'ar' ? 'bg-white text-slate-900 border-slate-200 shadow-sm' : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200'}`}
        >
          العربية
        </button>
      </div>

      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-8 border-b border-slate-200 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-slate-800 rounded-lg mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1h-1m-6-1a1 1 0 001-1V7a1 1 0 011-1h2a1 1 0 011 1v7a1 1 0 01-1 1h-1z" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-slate-900">Limo rent</h1>
            <p className="text-sm text-slate-500 mt-1">{t.loginTitle}</p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm font-medium" role="alert">
                {t.invalidCredentials}
              </div>
            )}
            <div>
              <label htmlFor="login-username" className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">{t.enterUsername}</label>
              <input
                id="login-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="malek"
              />
            </div>
            <div>
              <label htmlFor="login-password" className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">{t.enterPassword}</label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="••••••••"
              />
            </div>
            <div className="pt-2 space-y-3">
              <button type="submit" className="w-full py-2.5 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 border border-slate-700">
                {t.accessDashboard}
              </button>
              <button
                type="button"
                onClick={() => onLogin('malek')}
                className="w-full py-2 text-slate-500 text-xs font-medium hover:text-slate-700"
              >
                Fast track access
              </button>
            </div>
          </form>

          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 text-center">
            <p className="text-xs text-slate-400">{t.restricted}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
