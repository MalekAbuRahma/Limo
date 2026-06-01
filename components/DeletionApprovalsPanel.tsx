import React, { useCallback, useEffect, useState } from 'react';
import type { UiLanguage } from './TaxiLogin';
import {
  approveDeletionRequest,
  deletionTypeLabel,
  fetchDeletionRequests,
  fetchPendingDeletionCount,
  rejectDeletionRequest,
  type DeletionRequestRecord,
} from '../utils/deletionRequestsApi';
import { checkApiHealth } from '../utils/taxiApi';

interface DeletionApprovalsPanelProps {
  lang: UiLanguage;
  onReviewed?: (request: DeletionRequestRecord) => void;
  compact?: boolean;
}

const DeletionApprovalsPanel: React.FC<DeletionApprovalsPanelProps> = ({
  lang,
  onReviewed,
  compact = false,
}) => {
  const [requests, setRequests] = useState<DeletionRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiUp, setApiUp] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const up = await checkApiHealth();
    setApiUp(up);
    if (!up) {
      setRequests([]);
      setLoading(false);
      return;
    }
    try {
      const list = await fetchDeletionRequests('pending');
      setRequests(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleApprove = async (id: string) => {
    setBusyId(id);
    setError('');
    try {
      const req = await approveDeletionRequest(id);
      await load();
      void fetchPendingDeletionCount();
      onReviewed?.(req);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (id: string) => {
    const note =
      lang === 'ar'
        ? window.prompt('سبب الرفض (اختياري):') ?? ''
        : window.prompt('Rejection reason (optional):') ?? '';
    if (note === null) return;
    setBusyId(id);
    setError('');
    try {
      const req = await rejectDeletionRequest(id, note);
      await load();
      void fetchPendingDeletionCount();
      onReviewed?.(req);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusyId(null);
    }
  };

  if (!apiUp && !loading) {
    return (
      <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        {lang === 'ar' ? 'يتطلب اتصال الخادم' : 'Requires server connection'}
      </p>
    );
  }

  return (
    <div className={compact ? 'space-y-2' : 'rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden'}>
      {!compact && (
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
          <div>
            <h3 className="font-semibold text-slate-800">
              {lang === 'ar' ? 'موافقات الحذف' : 'Deletion approvals'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {lang === 'ar'
                ? 'طلبات المستخدمين — راجع ثم وافق أو ارفض'
                : 'User requests — review then approve or reject'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="text-xs text-green-700 font-medium hover:underline"
          >
            {lang === 'ar' ? 'تحديث' : 'Refresh'}
          </button>
        </div>
      )}

      <div className={compact ? '' : 'p-4'}>
        {error && (
          <p className="text-sm text-red-600 mb-2 bg-red-50 border border-red-100 rounded p-2">{error}</p>
        )}
        {loading ? (
          <p className="text-sm text-slate-500">{lang === 'ar' ? 'جاري التحميل...' : 'Loading...'}</p>
        ) : requests.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-4">
            {lang === 'ar' ? 'لا توجد طلبات معلّقة' : 'No pending requests'}
          </p>
        ) : (
          <ul className="space-y-2">
            {requests.map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-slate-200 px-3 py-2.5 bg-slate-50/50"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800">{r.summary}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {deletionTypeLabel(r.requestType, lang)} · {r.vehicleLabel}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {lang === 'ar' ? 'من' : 'By'} {r.requestedByName} (@{r.requestedByUsername}) ·{' '}
                      {new Date(r.createdAt).toLocaleString(lang === 'ar' ? 'ar-JO' : 'en-GB')}
                    </p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => void handleApprove(r.id)}
                      className="px-3 py-1.5 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      {lang === 'ar' ? 'موافقة' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => void handleReject(r.id)}
                      className="px-3 py-1.5 text-xs font-semibold border border-red-300 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-50"
                    >
                      {lang === 'ar' ? 'رفض' : 'Reject'}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default DeletionApprovalsPanel;

/** Badge + slide-over trigger for admin header */
export const DeletionApprovalsButton: React.FC<{
  lang: UiLanguage;
  pendingCount: number;
  onRefreshCount: () => void;
  onReviewed: (request: DeletionRequestRecord) => void;
}> = ({ lang, pendingCount, onRefreshCount, onReviewed }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          onRefreshCount();
        }}
        className="relative inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
      >
        {lang === 'ar' ? 'موافقات الحذف' : 'Deletions'}
        {pendingCount > 0 && (
          <span className="absolute -top-1.5 -end-1.5 min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] font-bold tabular-nums">
            {pendingCount > 99 ? '99+' : pendingCount}
          </span>
        )}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[300] flex items-start justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg max-h-[85vh] overflow-auto bg-white rounded-2xl shadow-xl mt-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-slate-100 px-4 py-3 flex justify-between items-center">
              <h2 className="font-bold text-slate-800">
                {lang === 'ar' ? 'موافقات الحذف' : 'Deletion approvals'}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-slate-500 hover:text-slate-800 text-sm"
              >
                {lang === 'ar' ? 'إغلاق' : 'Close'}
              </button>
            </div>
            <div className="p-4">
              <DeletionApprovalsPanel
                lang={lang}
                compact
                onReviewed={(req) => {
                  onReviewed(req);
                  onRefreshCount();
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};
