import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const filePath = join(__dirname, '..', 'components', 'TaxiTrackerApp.tsx');
let c = readFileSync(filePath, 'utf8');

// 1. Outer wrapper: add dir="rtl" and update space
c = c.replace(
  '<div className="max-w-3xl space-y-4">',
  '<div className="max-w-3xl space-y-5" dir="rtl">'
);

// 2. Add emoji to page title
c = c.replace(
  '<h2 className="text-xl font-bold text-slate-800">\n          {lang === \'ar\' ? \'الإعدادات\' : \'Settings\'}\n        </h2>',
  '<h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">\n          <span className="text-2xl">⚙️</span>\n          {lang === \'ar\' ? \'الإعدادات\' : \'Settings\'}\n        </h2>'
);

// 3. Replace subtitle description
c = c.replace(
  `        <p className="text-sm app-text-muted mt-1">
          {lang === 'ar'
            ? 'بيانات السيارة، التقارير، والنسخ الاحتياطي — الحوادث في تبويب «التأمين والحوادث»'
            : 'Vehicle, reports, and backups — accidents are under Insurance tab'}
        </p>`,
  `        <p className="text-xs text-slate-400 mt-1">
          {settings.vehicleLabel ? \`إعدادات سيارة: \${settings.vehicleLabel}\` : 'إعدادات السيارة'}
        </p>`
);

// 4. Improve back button styling
c = c.replace(
  'className="px-3 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"',
  'className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"'
);

// 5. Remove the blue info banner (not needed with new layout)
c = c.replace(
  `    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
      {lang === 'ar' ? (
        <>
          إعدادات خاصة بسيارة: <strong>{settings.vehicleLabel || '—'}</strong> — الضمان، التكلفة، ومدة
          الشطب لا تُطبَّق على باقي السيارات.
        </>
      ) : (
        <>
          Settings for: <strong>{settings.vehicleLabel || '—'}</strong> — guarantee, cost, and life
          years are independent per vehicle.
        </>
      )}
    </div>`,
  ''
);

// 6. Move User Assignment section into admin group (handle by replacing section definitions)
// Update SettingsSection for "إعدادات العمل" - add accent and split
c = c.replace(
  '<SettingsSection title="إعدادات العمل" subtitle="الضمان، السائق، واسم السيارة" icon="🚕">',
  '<SettingsSection title="السائق والضمان" subtitle="الضمان، مواعيد الدفع، وسجل السائقين" icon="👤" accent="emerald">'
);

// 7. Oil section
c = c.replace(
  '<SettingsSection\n      title="متابعة الزيت والعداد"\n      subtitle="نوع الزيت، العيار، والعداد — في تبويب مخصص"\n      icon="🛢️"\n    >',
  '<SettingsSection\n      title="متابعة الزيت والعداد"\n      subtitle="نوع الزيت، العيار، والتنبيهات"\n      icon="🛢️"\n      accent="orange"\n      defaultOpen={false}\n    >'
);

// 8. Capital recovery
c = c.replace(
  '<SettingsSection title="استرداد رأس المال" subtitle="تكلفة السيارة ومدة الاستخدام" icon="📊">',
  '<SettingsSection title="رأس المال والاستثمار" subtitle="تكلفة السيارة ومدة الاستهلاك" icon="📊" accent="violet" defaultOpen={false}>'
);

// 9. Reports export
c = c.replace(
  `<SettingsSection title="تصدير التقارير" subtitle="Excel و PDF لكل السجلات الشهرية" icon="📄">`,
  `<SettingsSection title="التقارير والتصدير" subtitle="Excel و PDF لكل السجلات الشهرية" icon="📄" accent="teal" defaultOpen={false}>`
);

// 10. Backup
c = c.replace(
  '<SettingsSection title="الحفظ والنسخ الاحتياطي" subtitle="PostgreSQL والملفات الاحتياطية" icon="💾">',
  '<SettingsSection title="الحفظ والنسخ الاحتياطي" subtitle="PostgreSQL، تصدير واستيراد الملفات" icon="💾" accent="slate" defaultOpen={false}>'
);

// 11. Improve export buttons to grid layout
c = c.replace(
  `        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            disabled={isExporting}
            onClick={onExportExcel}
            className="flex-1 py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {isExporting ? 'جاري التصدير...' : 'تصدير Excel'}
          </button>
          <button
            type="button"
            onClick={onExportPdf}
            className="flex-1 py-2.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700"
          >
            تصدير PDF
          </button>
        </div>`,
  `        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={isExporting}
            onClick={onExportExcel}
            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            📊 {isExporting ? 'جاري...' : 'Excel'}
          </button>
          <button
            type="button"
            onClick={onExportPdf}
            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors"
          >
            📑 PDF
          </button>
        </div>`
);

// 12. Improve backup export button
c = c.replace(
  'className="w-full py-2.5 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900"\n      >\n        تصدير نسخة احتياطية (JSON)',
  'className="w-full py-2.5 rounded-xl bg-slate-800 text-white text-sm font-medium hover:bg-slate-900 transition-colors"\n      >\n        ⬇ تصدير نسخة احتياطية (JSON)'
);
c = c.replace(
  'className="w-full py-2.5 rounded-lg border border-slate-300 text-slate-800 text-sm font-medium hover:bg-slate-50"',
  'className="w-full py-2.5 rounded-xl border border-slate-300 text-slate-800 text-sm font-medium hover:bg-slate-50 transition-colors"'
);
c = c.replace(
  'className="w-full py-2.5 rounded-lg border-2 border-red-300 text-red-700 text-sm font-semibold hover:bg-red-50"',
  'className="w-full py-2.5 rounded-xl border-2 border-red-300 text-red-700 text-sm font-semibold hover:bg-red-50 transition-colors"'
);

// 13. Update oil tab button
c = c.replace(
  'className="mt-3 inline-flex items-center gap-2 px-4 py-2.5 bg-orange-600 text-white text-sm font-semibold rounded-xl hover:bg-orange-700"',
  'className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-orange-600 text-white text-sm font-semibold rounded-xl hover:bg-orange-700 transition-colors"'
);

// 14. Merge admin sections into one
// Handle deletion approvals section
c = c.replace(
  `    {canReviewDeletions(session) && (
      <SettingsSection
        title={lang === 'ar' ? 'موافقات الحذف' : 'Deletion approvals'}
        subtitle={
          lang === 'ar'
            ? 'طلبات الحذف من المستخدمين'
            : 'Deletion requests from users'
        }
        icon="🛡️"
      >
        <DeletionApprovalsPanel
          lang={lang}
          onReviewed={onDeletionReviewed}
        />
      </SettingsSection>
    )}

    {canManageUsers(session) && (
      <SettingsSection
        title={lang === 'ar' ? 'المستخدمون والصلاحيات' : 'Users & permissions'}
        subtitle={lang === 'ar' ? 'حسابات الفريق — مدير النظام' : 'Team accounts — system admin'}
        icon="👥"
      >
        <UsersAdminPanel session={session} lang={lang} />
      </SettingsSection>
    )}`,
  `    {(canReviewDeletions(session) || canManageUsers(session)) && (
      <SettingsSection
        title={lang === 'ar' ? 'الموافقات والمستخدمون' : 'Approvals & Users'}
        subtitle={lang === 'ar' ? 'موافقات الحذف وإدارة حسابات الفريق' : 'Deletion approvals and team accounts'}
        icon="🛡️"
        accent="rose"
        defaultOpen={false}
        badge={lang === 'ar' ? 'مشرف' : 'Admin'}
      >
        {canReviewDeletions(session) && (
          <div className="pb-4 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-700 mb-3">موافقات الحذف</p>
            <DeletionApprovalsPanel lang={lang} onReviewed={onDeletionReviewed} />
          </div>
        )}
        {canManageUsers(session) && (
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-3">المستخدمون والصلاحيات</p>
            <UsersAdminPanel session={session} lang={lang} />
          </div>
        )}
      </SettingsSection>
    )}`
);

// 15. Move user assignment section to be after backup (admin group)
// First, remove it from its current position
const assignSectionOld = `    {canReassignVehicle(session) && vehicleId && (
      <SettingsSection
        title={lang === 'ar' ? 'تعيين المستخدم' : 'User assignment'}
        subtitle={
          lang === 'ar' ? 'من يرى هذه السيارة في مرآبه' : 'Who sees this car in their garage'
        }
        icon="👤"
      >
        <VehicleAssignmentSettings
          vehicleId={vehicleId}
          assignedUserId={assignedUserId}
          assignedUserDisplayName={assignedUserDisplayName}
          lang={lang}
          onReassigned={onVehicleReassigned}
        />
      </SettingsSection>
    )}`;
const assignSectionNew = `    {canReassignVehicle(session) && vehicleId && (
      <SettingsSection
        title={lang === 'ar' ? 'تعيين المستخدم' : 'User assignment'}
        subtitle={lang === 'ar' ? 'من يرى هذه السيارة في مرآبه' : 'Who sees this car in their garage'}
        icon="👤"
        accent="rose"
        defaultOpen={false}
        badge={lang === 'ar' ? 'مشرف' : 'Admin'}
      >
        <VehicleAssignmentSettings
          vehicleId={vehicleId}
          assignedUserId={assignedUserId}
          assignedUserDisplayName={assignedUserDisplayName}
          lang={lang}
          onReassigned={onVehicleReassigned}
        />
      </SettingsSection>
    )}`;
c = c.replace(assignSectionOld, assignSectionNew);

writeFileSync(filePath, c, 'utf8');
console.log('Settings patch applied successfully');
