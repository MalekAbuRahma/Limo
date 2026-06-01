import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DisplayThemeOption, TaxiSettings } from '../taxiTypes';
import type { UserSession } from '../utils/taxiAuth';
import { roleLabel } from '../utils/permissions';
import type { UiLanguage } from './TaxiLogin';

interface ProfileMenuProps {
  session: UserSession;
  lang: UiLanguage;
  setLang: (lang: UiLanguage) => void;
  settings: TaxiSettings;
  onSettingsChange: (s: TaxiSettings) => void;
  onOpenAccessibility: () => void;
  onLogout: () => void;
}

const ProfileMenu: React.FC<ProfileMenuProps> = ({
  session,
  lang,
  setLang,
  settings,
  onSettingsChange,
  onOpenAccessibility,
  onLogout,
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const isDark = settings.displayTheme === 'dark';

  const updateMenuPos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const menuWidth = Math.min(320, window.innerWidth - 16);
    const isRtl = document.getElementById('taxi-app')?.dir === 'rtl';
    const left = isRtl
      ? Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8))
      : Math.min(window.innerWidth - menuWidth - 8, rect.left);
    setMenuPos({ top: rect.bottom + 8, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    updateMenuPos();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onScrollOrResize = () => updateMenuPos();
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, updateMenuPos]);

  const setTheme = (dark: boolean) => {
    const displayTheme: DisplayThemeOption = dark ? 'dark' : 'default';
    onSettingsChange({ ...settings, displayTheme });
  };

  const labels =
    lang === 'ar'
      ? {
          profile: 'الملف الشخصي',
          language: 'اللغة',
          theme: 'الوضع',
          light: 'فاتح',
          dark: 'داكن',
          access: 'تمكين الوصول',
          logout: 'تسجيل الخروج',
        }
      : {
          profile: 'User profile',
          language: 'Language',
          theme: 'Theme',
          light: 'Light',
          dark: 'Dark',
          access: 'Display access',
          logout: 'Sign out',
        };

  const dropdown = open && menuPos && (
    <div
      ref={dropdownRef}
      className="profile-menu-dropdown profile-menu-dropdown--portal"
      role="menu"
      style={{
        position: 'fixed',
        top: menuPos.top,
        left: menuPos.left,
        width: Math.min(320, window.innerWidth - 16),
        zIndex: 200,
      }}
    >
      <div className="profile-menu-header">
        <div className="profile-menu-header-avatar" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" />
            <path d="M12 12v5M8 10h8" />
          </svg>
        </div>
        <p className="profile-menu-header-name">{session.displayName}</p>
        <p className="profile-menu-header-id text-xs opacity-80">
          @{session.username} · {roleLabel(session.role, lang)}
        </p>
      </div>

      <div className="profile-menu-rows">
        <div className="profile-menu-row">
          <div className="profile-menu-row-top">
            <span className="profile-menu-row-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
              </svg>
            </span>
            <span className="profile-menu-row-label">{labels.language}</span>
          </div>
          <div className="profile-segmented" role="group" aria-label={labels.language}>
            <button
              type="button"
              className={`profile-segmented-btn${lang === 'en' ? ' profile-segmented-btn--active' : ''}`}
              onClick={() => setLang('en')}
            >
              English
            </button>
            <button
              type="button"
              className={`profile-segmented-btn${lang === 'ar' ? ' profile-segmented-btn--active' : ''}`}
              onClick={() => setLang('ar')}
            >
              العربية
            </button>
          </div>
        </div>

        <div className="profile-menu-row">
          <div className="profile-menu-row-top">
            <span className="profile-menu-row-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
            </span>
            <span className="profile-menu-row-label">{labels.theme}</span>
          </div>
          <div className="profile-segmented" role="group" aria-label={labels.theme}>
            <button
              type="button"
              className={`profile-segmented-btn${!isDark ? ' profile-segmented-btn--active' : ''}`}
              onClick={() => setTheme(false)}
            >
              {labels.light}
            </button>
            <button
              type="button"
              className={`profile-segmented-btn${isDark ? ' profile-segmented-btn--active' : ''}`}
              onClick={() => setTheme(true)}
            >
              {labels.dark}
            </button>
          </div>
        </div>

        <button
          type="button"
          className="profile-menu-action"
          role="menuitem"
          onClick={() => {
            setOpen(false);
            onOpenAccessibility();
          }}
        >
          <span className="profile-menu-row-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="4" r="2" />
              <path d="M12 7c-2.2 0-4 1.8-4 4v1H5l4.5 9.5 2.5-5 2.5 5L19 12h-3V11c0-2.2-1.8-4-4-4z" />
            </svg>
          </span>
          <span className="profile-menu-action-label">{labels.access}</span>
          <span className="profile-menu-chevron" aria-hidden>
            ‹
          </span>
        </button>

        <button
          type="button"
          className="profile-menu-action profile-menu-action--logout"
          role="menuitem"
          onClick={() => {
            setOpen(false);
            onLogout();
          }}
        >
          <span className="profile-menu-row-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </span>
          <span className="profile-menu-action-label">{labels.logout}</span>
          <span className="profile-menu-chevron" aria-hidden>
            ‹
          </span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="profile-menu-root" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="profile-menu-trigger"
        onClick={() => {
          setOpen((v) => {
            if (!v) updateMenuPos();
            return !v;
          });
        }}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={labels.profile}
      >
        <span className="profile-menu-trigger-avatar" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" />
            <path d="M12 12v5M8 10h8" />
          </svg>
        </span>
        <span className="profile-menu-trigger-name hidden sm:inline">
          {session.displayName}
        </span>
      </button>

      {dropdown && createPortal(dropdown, document.body)}
    </div>
  );
};

export default ProfileMenu;
