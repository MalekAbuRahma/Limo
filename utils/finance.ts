
import { Car, FinancialMetrics } from '../types';

export const calculateCarNetMonthly = (car: Car): number => {
  const totalExpenses = (Object.values(car.expenses || {}) as number[]).reduce((a, b) => a + b, 0);
  return car.monthlyRent - totalExpenses;
};

export const calculateBreakEven = (car: Car): number => {
  const monthlyNet = calculateCarNetMonthly(car);
  if (monthlyNet <= 0) return Infinity;
  return car.purchaseCost / monthlyNet;
};

export const aggregateMetrics = (cars: Car[]): FinancialMetrics => {
  let totalIncome = 0;
  let totalExpenses = 0;
  let totalProfit = 0;
  let totalDurationProfit = 0;
  let breakEvenSum = 0;
  let profitableUnits = 0;

  cars.forEach(car => {
    const carMonthlyNet = calculateCarNetMonthly(car);
    const carMonthlyExpenses = (Object.values(car.expenses || {}) as number[]).reduce((a, b) => a + b, 0);
    const be = calculateBreakEven(car);
    
    totalIncome += car.monthlyRent;
    totalExpenses += carMonthlyExpenses;
    totalProfit += carMonthlyNet;
    totalDurationProfit += carMonthlyNet * 12 * car.durationYears;
    
    if (be !== Infinity && be > 0) {
      breakEvenSum += be;
      profitableUnits++;
    }
  });

  return {
    totalMonthlyIncome: totalIncome,
    totalMonthlyExpenses: totalExpenses,
    totalMonthlyNetProfit: totalProfit,
    yearlyProfit: totalProfit * 12,
    totalDurationProfit: totalDurationProfit,
    averageBreakEvenMonths: profitableUnits > 0 ? breakEvenSum / profitableUnits : 0,
  };
};

export const generateProjections = (car: Car) => {
  const data = [];
  const monthlyNet = calculateCarNetMonthly(car);
  let cumulative = -car.purchaseCost;

  // Ensure we don't crash on invalid years
  const maxMonths = Math.min(Math.max(car.durationYears, 1) * 12, 600); 

  for (let i = 0; i <= maxMonths; i++) {
    data.push({
      month: i,
      cumulative: Math.round(cumulative),
      profit: Math.round(monthlyNet),
      isProfitable: cumulative >= 0
    });
    cumulative += monthlyNet;
  }
  return data;
};
