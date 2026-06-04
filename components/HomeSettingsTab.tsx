import React from 'react';
import type { UiLanguage } from './TaxiLogin';
import type { UserSession } from '../utils/taxiAuth';
import { roleLabel } from '../utils/permissions';
import { canManageUsers, canReviewDeletions } from '../utils/permissions';
import type { StorageSource } from '../utils/taxiFleetPersistence';
import type { DeletionRequestRecord } from '../utils/deletionRequestsApi';
import UsersAdminPanel from './UsersAdminPanel';
import DeletionApprovalsPanel from './DeletionApprovalsPanel';
import { SettingsSection } from './SettingsUi';

interface HomeSettingsTabProps {
  session: UserSession;
  lang: UiLanguage;
  storageSource: StorageSource;
  vehicleCount: number;
  onDeletionReviewed: (req: DeletionRequestRecord) => void;
  /** Inside profile menu — tighter layout */
  embedded?: boolean;
}

const HomeSettingsTab: React.FC<HomeSettingsTabProps> = ({
  session,
  lang,
  storageSource,
  vehicleCount,
  onDeletionReviewed,
  embedded = false,
}) => {
  return (
    <div className={`home-settings w-full ${embedded ? 'space-y-3' : 'space-y-4'}`}>
      {!embedded && (
        <div>
          <h2 className="text-xl font-bold text-slate-800">
            {lang === 'ar' ? 'إعدادات النظام' : 'System settings'}
          </h2>
          <p className="text-sm app-text-muted mt-1">
            {lang === 'ar'
              ? 'إعدادات عامة للأسطول — المستخدمون والموافقات'
              : 'Fleet-wide settings — users and approvals'}
          </p>
        </div>
      )}

      <SettingsSection
        title={lang === 'ar' ? 'حسابي' : 'My account'}
        subtitle={lang === 'ar' ? 'المستخدم الحالي' : 'Current user'}
        icon="👤"
        defaultOpen
      >
        <p className="text-sm text-slate-700">
          <strong>{session.displayName}</strong>
          <span className="text-slate-500"> (@{session.username})</span>
        </p>
        <p className="text-xs text-slate-500 mt-1">
          {lang === 'ar' ? 'الدور:' : 'Role:'}{' '}
          <span className="font-semibold">{roleLabel(session.role, lang)}</span>
        </p>
      </SettingsSection>

      <SettingsSection
        title={lang === 'ar' ? 'الحفظ والبيانات' : 'Storage & data'}
        subtitle={lang === 'ar' ? 'قاعدة البيانات والأسطول' : 'Database and fleet'}
        icon="💾"
      >
        <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg p-3">
          {storageSource === 'sql'
            ? lang === 'ar'
              ? '✓ متصل بـ PostgreSQL'
              : '✓ Connected to PostgreSQL'
            : lang === 'ar'
              ? '✓ حفظ محلي — شغّل الخادم لتفعيل قاعدة البيانات'
              : '✓ Local storage — start the server for PostgreSQL'}
        </p>
        <p className="text-sm text-slate-600">
          {lang === 'ar' ? 'عدد السيارات في مرآبك:' : 'Vehicles in your garage:'}{' '}
          <strong className="tabular-nums">{vehicleCount}</strong>
        </p>
        <p className="text-xs app-text-muted">
          {lang === 'ar'
            ? 'إعدادات كل سيارة (صورة، ضمان، سائق…) من داخل السيارة → تبويب الإعدادات'
            : 'Per-vehicle settings (image, guarantee, driver…) are inside each car → Settings tab'}
        </p>
      </SettingsSection>

      {canReviewDeletions(session) && (
        <SettingsSection
          title={lang === 'ar' ? 'موافقات الحذف' : 'Deletion approvals'}
          subtitle={
            lang === 'ar'
              ? 'طلبات الحذف من المستخدمين'
              : 'Deletion requests from users'
          }
          icon="🛡️"
        >
          <DeletionApprovalsPanel lang={lang} onReviewed={onDeletionReviewed} />
        </SettingsSection>
      )}

      {canManageUsers(session) && (
        <SettingsSection
          title={lang === 'ar' ? 'المستخدمون والصلاحيات' : 'Users & permissions'}
          subtitle={
            lang === 'ar' ? 'إدارة حسابات الفريق' : 'Manage team accounts'
          }
          icon="👥"
        >
          <UsersAdminPanel session={session} lang={lang} />
        </SettingsSection>
      )}
    </div>
  );
};

export default HomeSettingsTab;
