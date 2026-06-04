import React, { Component, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div
          className="min-h-screen bg-red-50 flex items-center justify-center p-6"
          dir="rtl"
        >
          <div className="max-w-md bg-white border border-red-200 rounded-xl p-6 shadow-sm text-center">
            <h1 className="text-lg font-bold text-red-800 mb-2">تعذّر تحميل التطبيق</h1>
            <p className="text-sm text-slate-600 mb-4">
              حدث خطأ أثناء التشغيل. جرّب تحديث الصفحة (Ctrl+Shift+R) أو امسح ذاكرة التخزين
              المؤقت للموقع.
            </p>
            <p className="text-xs text-slate-400 font-mono break-all">{this.state.error.message}</p>
            <button
              type="button"
              className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold"
              onClick={() => window.location.reload()}
            >
              إعادة التحميل
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
