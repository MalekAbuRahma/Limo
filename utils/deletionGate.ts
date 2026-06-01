import type { UiLanguage } from '../components/TaxiLogin';
import type { UserSession } from './taxiAuth';
import { isAdmin } from './permissions';
import { checkApiHealth } from './taxiApi';
import {
  submitDeletionRequest,
  type CreateDeletionRequestPayload,
} from './deletionRequestsApi';

export type DeletionGateResult = 'applied' | 'pending' | 'offline' | 'error';

export type DeletionNotifyTone = 'info' | 'error' | 'success';

export type DeletionNotifyFn = (message: string, tone?: DeletionNotifyTone) => void;

export async function gateDeletion(
  session: UserSession,
  lang: UiLanguage,
  payload: CreateDeletionRequestPayload,
  applyImmediately: () => void | Promise<void>,
  onNotify?: DeletionNotifyFn
): Promise<DeletionGateResult> {
  const notify = (message: string, tone: DeletionNotifyTone = 'info') => {
    if (onNotify) onNotify(message, tone);
    else if (typeof window !== 'undefined') window.alert(message);
  };

  if (isAdmin(session)) {
    await applyImmediately();
    return 'applied';
  }

  const apiUp = await checkApiHealth();
  if (!apiUp) {
    notify(
      lang === 'ar'
        ? 'طلب الحذف يتطلب اتصال الخادم — لا يمكن الحذف محلياً بدون موافقة المدير'
        : 'Deletion approval requires the server — cannot delete offline without admin',
      'error'
    );
    return 'offline';
  }

  try {
    await submitDeletionRequest(payload);
    notify(
      lang === 'ar'
        ? 'تم إرسال طلب الحذف إلى المدير للموافقة. لن يُحذف شيء حتى تتم الموافقة.'
        : 'Deletion request sent to admin for approval. Nothing is removed until approved.',
      'info'
    );
    return 'pending';
  } catch (e) {
    notify(
      e instanceof Error ? e.message : lang === 'ar' ? 'فشل الطلب' : 'Request failed',
      'error'
    );
    return 'error';
  }
}
