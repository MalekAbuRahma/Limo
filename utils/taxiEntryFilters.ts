import { EXPENSE_FIELD_LABELS, REPORT_EXPENSE_KEYS, ExpenseBreakdown } from '../taxiTypes';
import { EntryComputed } from './taxiCalculations';

export const TRACKING_PAGE_SIZE = 24;

export type StatusFilter = 'all' | 'مدفوع' | 'متأخر';

export interface EntryFilters {
  query: string;
  status: StatusFilter;
  driver: string;
}

export const EMPTY_ENTRY_FILTERS: EntryFilters = {
  query: '',
  status: 'all',
  driver: 'all',
};

export function getUniqueDriverNames(entries: EntryComputed[]): string[] {
  const names = new Set<string>();
  for (const e of entries) {
    const n = e.driverName?.trim();
    if (n) names.add(n);
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'ar'));
}

/** نص قابل للبحث — شهر، سائق، مبالغ، مصاريف، ملاحظات، حالة */
export function buildEntrySearchText(entry: EntryComputed): string {
  const expenseParts = REPORT_EXPENSE_KEYS.filter((k) => entry.expenseDetails[k] > 0).map(
    (k) => `${EXPENSE_FIELD_LABELS[k]} ${entry.expenseDetails[k]}`
  );

  return [
    entry.month,
    entry.date,
    entry.driverName,
    entry.notes ?? '',
    entry.status,
    String(entry.revenue),
    String(entry.expenses),
    String(entry.driverPaid),
    String(entry.remaining),
    String(entry.guarantee),
    ...expenseParts,
  ]
    .join(' ')
    .toLowerCase();
}

export function filterEntries(
  entries: EntryComputed[],
  filters: EntryFilters
): EntryComputed[] {
  const q = filters.query.trim().toLowerCase();
  const tokens = q ? q.split(/\s+/).filter(Boolean) : [];

  return entries.filter((e) => {
    if (filters.status !== 'all' && e.status !== filters.status) return false;
    if (filters.driver !== 'all' && e.driverName !== filters.driver) return false;
    if (tokens.length === 0) return true;
    const hay = buildEntrySearchText(e);
    return tokens.every((t) => hay.includes(t));
  });
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  totalPages: number;
  total: number;
  rangeStart: number;
  rangeEnd: number;
}

export function paginateEntries<T>(
  items: T[],
  page: number,
  pageSize = TRACKING_PAGE_SIZE
): PaginatedResult<T> {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const offset = (safePage - 1) * pageSize;
  const slice = items.slice(offset, offset + pageSize);

  return {
    items: slice,
    page: safePage,
    totalPages,
    total,
    rangeStart: total === 0 ? 0 : offset + 1,
    rangeEnd: total === 0 ? 0 : offset + slice.length,
  };
}

export function findEntryPage(
  entries: EntryComputed[],
  entryId: string,
  pageSize = TRACKING_PAGE_SIZE
): number | null {
  const index = entries.findIndex((e) => e.id === entryId);
  if (index < 0) return null;
  return Math.floor(index / pageSize) + 1;
}
