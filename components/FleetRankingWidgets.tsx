/**
 * F8 – Fleet Performance Ranking Widgets
 *
 * Displays four ranking lists:
 * - Best Performing Vehicle (highest net profit)
 * - Worst Performing Vehicle (lowest net profit)
 * - Highest Revenue Vehicle
 * - Highest Expense Vehicle
 */

import React, { useEffect, useState } from 'react';
import { fetchFleetPerformanceRanking } from '../utils/taxiApi';
import type { FleetPerformanceRanking, VehicleRankEntry } from '../taxiTypes';

interface Props {
  language?: 'ar' | 'en';
}

const L = {
  ar: {
    bestPerforming: 'أفضل أداء',
    worstPerforming: 'أدنى أداء',
    highestRevenue: 'أعلى إيراد',
    highestExpense: 'أعلى مصاريف',
    vehicle: 'السيارة',
    value: 'القيمة',
    rank: '#',
    currency: 'د.أ',
    loading: 'جارٍ تحميل الترتيب…',
    noData: 'لا تتوفر بيانات كافية',
  },
  en: {
    bestPerforming: 'Best Performing',
    worstPerforming: 'Worst Performing',
    highestRevenue: 'Highest Revenue',
    highestExpense: 'Highest Expense',
    vehicle: 'Vehicle',
    value: 'Value',
    rank: '#',
    currency: 'JOD',
    loading: 'Loading ranking…',
    noData: 'Insufficient data',
  },
};

function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

const MEDAL = ['🥇', '🥈', '🥉'];

function RankingCard({
  title,
  entries,
  currency,
  colorClass,
  tone = 'default',
}: {
  title: string;
  entries: VehicleRankEntry[];
  currency: string;
  colorClass: string;
  tone?: 'default' | 'danger';
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
      <div className={`px-4 py-3 ${colorClass}`}>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      <div className="divide-y divide-gray-50">
        {entries.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-400">—</p>
        ) : (
          entries.map((entry) => (
            <div key={entry.vehicleId} className="flex items-center gap-3 px-4 py-2.5">
              <span className="text-sm w-5 text-center">
                {MEDAL[entry.rank - 1] ?? `${entry.rank}`}
              </span>
              <span className="flex-1 text-sm text-gray-800 truncate">{entry.vehicleLabel}</span>
              <span
                className={`text-sm font-semibold tabular-nums ${
                  tone === 'danger' ? 'text-red-600' : 'text-gray-900'
                }`}
              >
                {fmt(entry.value)} {currency}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function FleetRankingWidgets({ language = 'ar' }: Props) {
  const t = L[language];
  const [ranking, setRanking] = useState<FleetPerformanceRanking | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFleetPerformanceRanking().then((data) => {
      setRanking(data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="text-sm text-gray-400 py-4 text-center">{t.loading}</div>
    );
  }

  if (!ranking) {
    return (
      <div className="text-sm text-gray-400 py-4 text-center">{t.noData}</div>
    );
  }

  return (
    <div
      className="grid grid-cols-2 gap-4"
      dir={language === 'ar' ? 'rtl' : 'ltr'}
    >
      <RankingCard
        title={t.bestPerforming}
        entries={ranking.bestPerforming}
        currency={t.currency}
        colorClass="bg-emerald-600"
      />
      <RankingCard
        title={t.worstPerforming}
        entries={ranking.worstPerforming}
        currency={t.currency}
        colorClass="bg-red-500"
        tone="danger"
      />
      <RankingCard
        title={t.highestRevenue}
        entries={ranking.highestRevenue}
        currency={t.currency}
        colorClass="bg-blue-600"
      />
      <RankingCard
        title={t.highestExpense}
        entries={ranking.highestExpense}
        currency={t.currency}
        colorClass="bg-amber-500"
        tone="danger"
      />
    </div>
  );
}
