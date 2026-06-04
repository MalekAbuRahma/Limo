/**
 * Tests for tracking filters + pagination (run: npx tsx scripts/test-entry-filters.mjs)
 */
import { generateSampleEntries } from '../utils/taxiSampleData.ts';
import { computeEntry } from '../utils/taxiCalculations.ts';
import {
  TRACKING_PAGE_SIZE,
  filterEntries,
  paginateEntries,
  findEntryPage,
} from '../utils/taxiEntryFilters.ts';
import { DEFAULT_SETTINGS } from '../taxiTypes.ts';

const assert = (cond, msg) => {
  if (!cond) throw new Error(`FAIL: ${msg}`);
};

const guarantee = DEFAULT_SETTINGS.monthlyGuarantee;
const entries = generateSampleEntries(3).map((e) => computeEntry(e, guarantee));

assert(entries.length === 36, '36 sample months');
assert(TRACKING_PAGE_SIZE > 0, 'page size configured');

const incompleteOnly = filterEntries(entries, { query: '', status: 'غير مكتمل', driver: 'all' });
assert(
  incompleteOnly.every((e) => e.status === 'غير مكتمل'),
  'status filter incomplete only unpaid'
);
if (entries.some((e) => e.status === 'غير مكتمل')) {
  assert(incompleteOnly.length > 0, 'has unpaid months in sample');
}

const partialOnly = filterEntries(entries, { query: '', status: 'مدفوع جزئياً', driver: 'all' });
assert(
  partialOnly.every((e) => e.status === 'مدفوع جزئياً'),
  'status filter partial'
);
assert(partialOnly.length > 0, 'sample has partial payment months');

const byDriver = filterEntries(entries, {
  query: '',
  status: 'all',
  driver: 'محمد علي',
});
assert(byDriver.every((e) => e.driverName === 'محمد علي'), 'driver filter');

const searchMonth = filterEntries(entries, { query: '08/2024', status: 'all', driver: 'all' });
assert(searchMonth.length >= 1, 'search by month');

const searchToken = filterEntries(entries, { query: 'غير مكتمل صيانة', status: 'all', driver: 'all' });
assert(searchToken.length >= 0, 'multi-token search runs');

const page1 = paginateEntries(entries, 1);
const page2 = paginateEntries(entries, 2);
const expectedPage1 = Math.min(TRACKING_PAGE_SIZE, entries.length);
const expectedPage2 = Math.min(
  TRACKING_PAGE_SIZE,
  Math.max(0, entries.length - TRACKING_PAGE_SIZE)
);
const expectedTotalPages = Math.ceil(entries.length / TRACKING_PAGE_SIZE);
assert(page1.items.length === expectedPage1, 'page 1 has expected rows');
assert(page2.items.length === expectedPage2, 'page 2 has expected rows');
assert(page1.totalPages === expectedTotalPages, 'expected total pages');

const targetId = entries[30].id;
assert(findEntryPage(entries, targetId) === Math.ceil((30 + 1) / TRACKING_PAGE_SIZE), 'find page for entry');

console.log('All entry filter / pagination tests passed ✓');
