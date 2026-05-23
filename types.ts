export interface CarExpenses {
  office: number;
  insurance: number;
  oil: number;
  maintenance: number;
  installments: number;
  other: number;
}

export interface DriverHistoryEntry {
  id: string;
  driverName: string;
  startDate: string;
  endDate?: string;
  notes?: string;
}

export interface ExpenseHistoryEntry {
  id: string;
  date: string;
  total: number;
  breakdown: CarExpenses;
  /** Driver name at time of save (linked to driver) */
  driverName?: string;
}

export interface ActionLogEntry {
  id: string;
  timestamp: string;
  type: 'EXPENSE_SAVE' | 'HANDOVER' | 'CONFIG_UPDATE' | 'CREATE_CAR' | 'STATUS_CHANGE' | 'DELETE_HISTORY';
  description: string;
}

export interface Car {
  id: string;
  model: string;
  purchaseCost: number;
  monthlyRent: number;
  driverHistory: DriverHistoryEntry[];
  expenseHistory: ExpenseHistoryEntry[];
  actions: ActionLogEntry[];
  durationYears: number;
  expenses: CarExpenses;
  image: string;
  paymentsPaid: [boolean, boolean, boolean]; 
}

export interface FinancialMetrics {
  totalMonthlyIncome: number;
  totalMonthlyExpenses: number;
  totalMonthlyNetProfit: number;
  yearlyProfit: number;
  totalDurationProfit: number;
  averageBreakEvenMonths: number;
}