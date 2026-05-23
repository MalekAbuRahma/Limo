/**
 * Oil change tracking tests
 */
import {
  getOilChangeAlert,
  daysBetweenDates,
  migrateOilChange,
} from '../utils/taxiOilChange.ts';
import { computeDashboard, computeEntry } from '../utils/taxiCalculations.ts';

const assert = (c, m) => {
  if (!c) throw new Error(`FAIL: ${m}`);
};

const alert = getOilChangeAlert([
  {
    id: '2',
    entryId: 'e2',
    changeDate: '2026-03-01',
    cost: 50,
    currentOdometer: 200000,
    distanceKm: 12000,
    nextOdometer: 210000,
    notes: '',
  },
  {
    id: '1',
    entryId: 'e1',
    changeDate: '2026-01-15',
    cost: 45,
    currentOdometer: 188000,
    distanceKm: 8000,
    nextOdometer: 198000,
    notes: '',
  },
]);

assert(alert != null, 'alert when >10k km in <60 days');
assert(alert.distanceKm === 12000, 'alert distance');

const noAlert = getOilChangeAlert([
  {
    id: '2',
    entryId: 'e2',
    changeDate: '2026-04-01',
    cost: 50,
    currentOdometer: 210000,
    distanceKm: 5000,
    nextOdometer: 220000,
    notes: '',
  },
  {
    id: '1',
    entryId: 'e1',
    changeDate: '2026-01-01',
    cost: 45,
    currentOdometer: 200000,
    distanceKm: 8000,
    nextOdometer: 210000,
    notes: '',
  },
]);
assert(noAlert == null, 'no alert for normal interval');

assert(daysBetweenDates('2026-01-01', '2026-03-01') >= 59, 'days between');

const migrated = migrateOilChange({
  id: 'x',
  oilType: '  تخليقي كامل ',
  oilGrade: '5W-30',
});
assert(migrated.oilType === 'تخليقي كامل', 'oil type trim');
assert(migrated.oilGrade === '5W-30', 'oil grade');

const entry = {
  id: 'm1',
  date: '2026-05-01',
  month: '05/2026',
  driverName: 'Test',
  revenue: 750,
  expenses: 0,
  expenseDetails: { oil: 0, maintenance: 100 },
};
const oils = [
  {
    id: 'o1',
    entryId: 'm1',
    changeDate: '2026-05-10',
    cost: 45,
    oilType: 'تخليقي كامل',
    oilGrade: '5W-30',
    currentOdometer: 100000,
    distanceKm: 9000,
    nextOdometer: 110000,
    notes: '',
  },
];
const computed = computeEntry(entry, 750, oils);
assert(computed.expenseDetails.oil === 45, 'oil tab cost in entry expenses');
assert(computed.net === 750 - 45 - 100, 'net includes oil from tab');
const dash = computeDashboard([entry], 750, oils);
assert(dash.expenseByCategory.oil === 45, 'dashboard oil from tab');

console.log('All oil change tests passed ✓');
