import React, { useEffect, useState } from 'react';
import TaxiTrackerApp from './components/TaxiTrackerApp';
import TaxiLogin, { type UiLanguage } from './components/TaxiLogin';
import { clearSession, getSession, saveSession, type UserSession } from './utils/taxiAuth';

const LANG_KEY = 'taxi_ui_lang';

const App: React.FC = () => {
  const [session, setSession] = useState<UserSession | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [lang, setLang] = useState<UiLanguage>(() => {
    const stored = localStorage.getItem(LANG_KEY);
    return stored === 'en' ? 'en' : 'ar';
  });

  useEffect(() => {
    setSession(getSession());
    setAuthReady(true);
  }, []);

  useEffect(() => {
    localStorage.setItem(LANG_KEY, lang);
  }, [lang]);

  const handleLogin = (s: UserSession) => {
    saveSession(s);
    setSession(s);
  };

  const handleLogout = () => {
    clearSession();
    setSession(null);
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center" dir="rtl">
        <p className="text-slate-600">...</p>
      </div>
    );
  }

  if (!session) {
    return <TaxiLogin onLogin={handleLogin} lang={lang} setLang={setLang} />;
  }

  return (
    <TaxiTrackerApp
      session={session}
      lang={lang}
      setLang={setLang}
      onLogout={handleLogout}
    />
  );
};

export default App;
