import { EXPENSE_FIELD_LABELS, REPORT_EXPENSE_KEYS, ExpenseBreakdown } from '../taxiTypes';
import { EntryComputed } from './taxiCalculations';

/** Fallback when viewport size is not computed yet */
export const TRACKING_PAGE_SIZE = 8;

/** Insurance / licenses / oil tables — few rows per screen */
export const LIST_TABLE_PAGE_SIZE = 6;

export type StatusFilter = 'all' | 'مكتمل' | 'غير مكتمل';

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

export type TrackingViewMode = 'cards' | 'table';
export type EntrySortOrder = 'desc' | 'asc';

export const TRACKING_VIEW_STORAGE_KEY = 'vip-tracking-view';
export const TRACKING_SORT_STORAGE_KEY = 'vip-tracking-sort';

export function loadTrackingViewMode(): TrackingViewMode {
  try {
    const v = localStorage.getItem(TRACKING_VIEW_STORAGE_KEY);
    if (v === 'cards' || v === 'table') return v;
  } catch {
    /* ignore */
  }
  return 'cards';
}

export function loadTrackingSortOrder(): EntrySortOrder {
  try {
    const v = localStorage.getItem(TRACKING_SORT_STORAGE_KEY);
    if (v === 'asc' || v === 'desc') return v;
  } catch {
    /* ignore */
  }
  return 'desc';
}

/** ترتيب حسب شهر السجل — desc = الأحدث أولاً */
export function sortEntriesByMonth(
  entries: EntryComputed[],
  order: EntrySortOrder
): EntryComputed[] {
  return [...entries].sort((a, b) => {
    const cmp = (b.date || '').localeCompare(a.date || '');
    return order === 'desc' ? cmp : -cmp;
  });
}

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
