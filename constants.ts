import { Car } from './types';

export const INITIAL_CARS: Car[] = [
  {
    id: '1',
    model: 'Toyota Camry 2024',
    purchaseCost: 32000,
    monthlyRent: 750,
    driverHistory: [
      { id: 'h1', driverName: 'John Doe', startDate: '2024-01-01' }
    ],
    expenseHistory: [],
    actions: [
      {
        id: 'initial-1',
        timestamp: new Date().toISOString(),
        type: 'CREATE_CAR',
        description: 'System initialization: Vehicle record created.'
      }
    ],
    durationYears: 8,
    image: 'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?auto=format&fit=crop&q=80&w=800',
    expenses: { office: 50, insurance: 80, oil: 30, maintenance: 40, installments: 0, other: 10 },
    paymentsPaid: [true, true, false],
  },
  {
    id: '2',
    model: 'Honda Accord 2023',
    purchaseCost: 30000,
    monthlyRent: 720,
    driverHistory: [
      { id: 'h2', driverName: 'Jane Smith', startDate: '2024-02-15' }
    ],
    expenseHistory: [],
    actions: [
      {
        id: 'initial-2',
        timestamp: new Date().toISOString(),
        type: 'CREATE_CAR',
        description: 'System initialization: Vehicle record created.'
      }
    ],
    durationYears: 5,
    image: 'https://images.unsplash.com/photo-1599912027806-cfec9f5944b6?auto=format&fit=crop&q=80&w=800',
    expenses: { office: 50, insurance: 75, oil: 30, maintenance: 30, installments: 0, other: 10 },
    paymentsPaid: [true, false, false],
  }
];

export const PAYMENT_INTERVAL_DAYS = 10;
export const PAYMENTS_PER_MONTH = 3;