/**
 * F4 – Audit Log Panel
 *
 * Admin-only panel displaying a chronological log of all financial and
 * operational changes. Supports filtering by entity type.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { fetchAuditLog } from '../utils/taxiApi';
import type { AuditLogEntry, AuditActionType } from '../taxiTypes';

interface Props {
  /** If provided, shows only audit entries for this vehicle */
  vehicleId?: string;
  language?: 'ar' | 'en';
}

const L = {
  ar: {
    title: 'سجل المراجعة',
    subtitle: 'جميع التغييرات المالية والتشغيلية',
    filterAll: 'الكل',
    filterDriver: 'السائقون',
    filterPayment: 'المدفوعات',
    filterExpense: 'المصاريف',
    filterVehicle: 'السيارات',
    when: 'التوقيت',
    who: 'المستخدم',
    action: 'الإجراء',
    entity: 'العنصر',
    noEntries: 'لا يوجد سجل حتى الآن',
    loading: 'جارٍ التحميل…',
    loadMore: 'تحميل المزيد',
  },
  en: {
    title: 'Audit Log',
    subtitle: 'All financial and operational changes',
    filterAll: 'All',
    filterDriver: 'Drivers',
    filterPayment: 'Payments',
    filterExpense: 'Expenses',
    filterVehicle: 'Vehicles',
    when: 'When',
    who: 'User',
    action: 'Action',
    entity: 'Entity',
    noEntries: 'No audit entries yet',
    loading: 'Loading…',
    loadMore: 'Load more',
  },
};

type FilterCategory = 'all' | 'driver' | 'payment' | 'expense' | 'vehicle';

const ACTION_LABELS: Record<AuditActionType, { ar: string; en: string; category: FilterCategory }> = {
  driver_added:      { ar: 'إضافة سائق',        en: 'Driver added',      category: 'driver' },
  driver_updated:    { ar: 'تعديل سائق',         en: 'Driver updated',    category: 'driver' },
  driver_removed:    { ar: 'حذف سائق',           en: 'Driver removed',    category: 'driver' },
  driver_withdrawn:  { ar: 'إنهاء خدمة سائق',   en: 'Driver withdrawn',  category: 'driver' },
  driver_replaced:   { ar: 'تبديل سائق',         en: 'Driver replaced',   category: 'driver' },
  guarantee_changed: { ar: 'تعديل الضمان',       en: 'Guarantee changed', category: 'payment' },
  payment_added:     { ar: 'إضافة دفعة',         en: 'Payment added',     category: 'payment' },
  payment_updated:   { ar: 'تعديل دفعة',         en: 'Payment updated',   category: 'payment' },
  payment_deleted:   { ar: 'حذف دفعة',           en: 'Payment deleted',   category: 'payment' },
  expense_added:     { ar: 'إضافة مصروف',        en: 'Expense added',     category: 'expense' },
  expense_updated:   { ar: 'تعديل مصروف',        en: 'Expense updated',   category: 'expense' },
  expense_deleted:   { ar: 'حذف مصروف',          en: 'Expense deleted',   category: 'expense' },
  entry_created:     { ar: 'إنشاء سجل شهري',    en: 'Entry created',     category: 'vehicle' },
  entry_updated:     { ar: 'تعديل سجل شهري',    en: 'Entry updated',     category: 'vehicle' },
  entry_deleted:     { ar: 'حذف سجل شهري',      en: 'Entry deleted',     category: 'vehicle' },
  vehicle_created:   { ar: 'إضافة سيارة',        en: 'Vehicle created',   category: 'vehicle' },
  vehicle_updated:   { ar: 'تعديل سيارة',        en: 'Vehicle updated',   category: 'vehicle' },
};

const ACTION_TONES: Record<FilterCategory, string> = {
  all:     'bg-gray-100 text-gray-600',
  driver:  'bg-blue-100 text-blue-700',
  payment: 'bg-green-100 text-green-700',
  expense: 'bg-amber-100 text-amber-700',
  vehicle: 'bg-purple-100 text-purple-700',
};

function ActionBadge({ action, lang }: { action: AuditActionType; lang: 'ar' | 'en' }) {
  const info = ACTION_LABELS[action];
  if (!info) return <span className="text-xs text-gray-400">{action}</span>;
  const tone = ACTION_TONES[info.category] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${tone}`}>
      {lang === 'ar' ? info.ar : info.en}
    </span>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const PAGE_SIZE = 25;

export default function AuditLogPanel({ vehicleId, language = 'ar' }: Props) {
  const t = L[language];
  const isRtl = language === 'ar';

  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState<FilterCategory>('all');

  const loadEntries = useCallback(async (newOffset: number, reset: boolean) => {
    setLoading(true);
    const data = await fetchAuditLog({
      entityId: vehicleId,
      limit: PAGE_SIZE,
      offset: newOffset,
    });
    setEntries((prev) => (reset ? data : [...prev, ...data]));
    setHasMore(data.length === PAGE_SIZE);
    setLoading(false);
  }, [vehicleId]);

  useEffect(() => {
    setOffset(0);
    loadEntries(0, true);
  }, [loadEntries]);

  const handleLoadMore = () => {
    const next = offset + PAGE_SIZE;
    setOffset(next);
    loadEntries(next, false);
  };

  const filtered = filter === 'all'
    ? entries
    : entries.filter((e) => {
        const info = ACTION_LABELS[e.actionType as AuditActionType];
        return info?.category === filter;
      });

  const FILTERS: { key: FilterCategory; label: string }[] = [
    { key: 'all', label: t.filterAll },
    { key: 'driver', label: t.filterDriver },
    { key: 'payment', label: t.filterPayment },
    { key: 'expense', label: t.filterExpense },
    { key: 'vehicle', label: t.filterVehicle },
  ];

  return (
    <div className="space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
      <div>
        <h2 className="text-base font-semibold text-gray-900">{t.title}</h2>
        <p className="text-xs text-gray-400 mt-0.5">{t.subtitle}</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-100 overflow-hidden">
        {loading && filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">{t.loading}</div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">{t.noEntries}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-2.5 text-start text-xs text-gray-500 font-medium">{t.when}</th>
                <th className="px-4 py-2.5 text-start text-xs text-gray-500 font-medium">{t.action}</th>
                <th className="px-4 py-2.5 text-start text-xs text-gray-500 font-medium">{t.entity}</th>
                <th className="px-4 py-2.5 text-start text-xs text-gray-500 font-medium">{t.who}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <tr key={entry.id} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                    {formatDate(entry.performedAt)}
                  </td>
                  <td className="px-4 py-2.5">
                    <ActionBadge action={entry.actionType} lang={language} />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-medium text-gray-700">{entry.entityType}</span>
                      <span className="text-xs text-gray-400 font-mono truncate max-w-[120px]" title={entry.entityId}>
                        {entry.entityId.slice(0, 8)}…
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">
                    {entry.performedBy ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {hasMore && !loading && (
        <div className="text-center">
          <button
            onClick={handleLoadMore}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            {t.loadMore}
          </button>
        </div>
      )}
    </div>
  );
}
