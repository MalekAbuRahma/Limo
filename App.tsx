import React, { Suspense, useEffect, useState } from 'react';

import TaxiLogin, { type UiLanguage } from './components/TaxiLogin';
import { appDir, loadingCopy } from './utils/uiCopy';



const TaxiTrackerApp = React.lazy(() => import('./components/TaxiTrackerApp'));

import { logoutViaApi, restoreSessionFromApi } from './utils/authApi';

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

    const run = async () => {

      const stored = getSession();

      if (!stored) {

        setAuthReady(true);

        return;

      }

      const restored = await restoreSessionFromApi(stored);

      if (restored) {

        saveSession(restored);

        setSession(restored);

      } else if (stored.token) {

        clearSession();

      } else {

        setSession(stored);

      }

      setAuthReady(true);

    };

    void run();

  }, []);



  useEffect(() => {

    localStorage.setItem(LANG_KEY, lang);

  }, [lang]);



  const handleLogin = (s: UserSession) => {

    saveSession(s);

    setSession(s);

  };



  const handleLogout = () => {

    const token = session?.token;

    if (token) void logoutViaApi(token);

    clearSession();

    setSession(null);

  };



  if (!authReady) {

    return (

      <div className="min-h-screen bg-slate-100 flex items-center justify-center" dir={appDir(lang)}>

        <p className="text-slate-600">{loadingCopy[lang].session}</p>

      </div>

    );

  }



  if (!session) {

    return <TaxiLogin onLogin={handleLogin} lang={lang} setLang={setLang} />;

  }



  return (

    <Suspense

      fallback={

        <div className="min-h-screen bg-slate-100 flex items-center justify-center" dir={appDir(lang)}>

          <p className="text-slate-600">{loadingCopy[lang].app}</p>

        </div>

      }

    >

      <TaxiTrackerApp

        session={session}

        lang={lang}

        setLang={setLang}

        onLogout={handleLogout}

      />

    </Suspense>

  );

};



export default App;

