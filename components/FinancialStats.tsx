import React from 'react';
import { FinancialMetrics } from '../types';
import { translations, Language } from '../translations';

interface FinancialStatsProps {
  metrics: FinancialMetrics;
  isIndividual?: boolean;
  lang: Language;
  onUpdateField?: (field: string, value: number) => void;
}

const FinancialStats: React.FC<FinancialStatsProps> = ({
  metrics,
  isIndividual = false,
  lang,
  onUpdateField
}) => {
  const t = translations[lang];
  const isRtl = lang === 'ar';

  const handleChange = (field: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (onUpdateField) {
      onUpdateField(field, parseFloat(e.target.value) || 0);
    }
  };

  const cards = [
    ...(isIndividual ? [] : [{ id: 'rent', label: t.totalRevenue, value: metrics.totalMonthlyIncome, editable: false }]),
    {
      id: 'net',
      label: t.monthlyNet,
      value: metrics.totalMonthlyNetProfit,
      editable: false
    },
    {
      id: 'yearly',
      label: t.yearlyForecast,
      value: metrics.yearlyProfit,
      editable: isIndividual
    },
    {
      id: 'durationProfit',
      label: isIndividual ? t.eightYearNet : t.fleetTotal,
      value: metrics.totalDurationProfit,
      editable: false
    },
  ];

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 ${cards.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4`}>
      {cards.map((card, idx) => (
        <div
          key={idx}
          className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 flex flex-col justify-center min-h-[120px]"
        >
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            {card.label}
          </p>
          <div className={`flex items-baseline gap-1.5 ${isRtl ? 'flex-row-reverse' : ''}`}>
            {card.editable ? (
              <input
                type="number"
                value={card.value.toFixed(0)}
                onChange={(e) => handleChange(card.id, e)}
                className="bg-slate-50 border border-slate-200 rounded px-2 py-1 w-full max-w-[140px] text-xl font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none tabular-nums"
              />
            ) : (
              <span className="text-xl font-semibold text-slate-800 tabular-nums">
                {card.value.toLocaleString()}
              </span>
            )}
            <span className="text-xs font-medium text-slate-500">{t.currency}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default FinancialStats;
