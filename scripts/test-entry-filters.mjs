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
assert(TRACKING_PAGE_SIZE === 24, 'page size 24');

const incompleteOnly = filterEntries(entries, { query: '', status: 'غير مكتمل', driver: 'all' });
assert(
  incompleteOnly.length > 0 && incompleteOnly.every((e) => e.status === 'غير مكتمل'),
  'status filter incomplete'
);

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
assert(page1.items.length === 24, 'page 1 has 24 rows');
assert(page2.items.length === 12, 'page 2 has 12 rows');
assert(page1.totalPages === 2, 'two pages for 36 rows');

const targetId = entries[30].id;
assert(findEntryPage(entries, targetId) === 2, 'find page for entry');

console.log('All entry filter / pagination tests passed ✓');
