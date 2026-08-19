import { Fragment, useEffect, useState } from 'react';
import type { AuditAction, AuditLog } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import { StatusBadge } from '@/components/cleopatra';
import { useAuth } from '@/state/AuthContext';

const ACTION_LABELS: Partial<Record<AuditAction, string>> = {
  CREATE: 'إنشاء',
  UPDATE: 'تعديل',
  DELETE: 'حذف',
  APPROVE: 'اعتماد',
  STATUS_CHANGE: 'تغيير حالة',
  LOGIN: 'تسجيل دخول',
  LOGOUT: 'تسجيل خروج',
  PASSWORD_RESET: 'إعادة تعيين كلمة مرور',
  SECURITY_REJECTION: 'رفض أمني',
};

const ACTION_TONE: Partial<Record<AuditAction, 'success' | 'danger' | 'warning' | 'info'>> = {
  CREATE: 'success',
  DELETE: 'danger',
  SECURITY_REJECTION: 'danger',
  UPDATE: 'warning',
  STATUS_CHANGE: 'warning',
};

function actionLabel(action: AuditAction): string {
  return ACTION_LABELS[action] ?? action.replace(/_/g, ' ');
}

/**
 * Owner ("مفيش شاشة لعرض الـAudit Log نفسه", UX_PRODUCT_AUDIT.md § مشكلة
 * 7.2) — `recordAudit` has been the write path since Phase 1; this is the
 * first read path. SUPER_ADMIN-only, same class as the attendance admin
 * screen — this reveals every sensitive change across every module.
 */
export function AuditLogPage() {
  const { authContext } = useAuth();
  const isSuperAdmin = authContext?.user.roles.some((r) => r.name === 'SUPER_ADMIN') ?? false;

  const [logs, setLogs] = useState<AuditLog[] | null>(null);
  const [entityTypes, setEntityTypes] = useState<string[]>([]);
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = () => {
    const qs = entityTypeFilter ? `?entityType=${encodeURIComponent(entityTypeFilter)}` : '';
    apiGet<AuditLog[]>(`/api/audit-logs${qs}`)
      .then(setLogs)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل سجل التدقيق'));
  };

  useEffect(load, [entityTypeFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    apiGet<string[]>('/api/audit-logs/entity-types')
      .then(setEntityTypes)
      .catch(() => undefined);
  }, []);

  if (!authContext) return <div className="text-muted-foreground">جارٍ التحميل…</div>;
  if (!isSuperAdmin) {
    return <div className="text-destructive">سجل التدقيق مقصور على حساب المسؤول العام فقط.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">سجل التدقيق</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={entityTypeFilter}
          onChange={(e) => setEntityTypeFilter(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        >
          <option value="">كل الأنواع</option>
          {entityTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <span className="text-muted-foreground text-xs">آخر 200 عملية</span>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {!logs ? (
        <div className="text-muted-foreground">جارٍ التحميل…</div>
      ) : logs.length === 0 ? (
        <p className="text-muted-foreground text-sm">لا توجد عمليات مسجّلة بعد.</p>
      ) : (
        <div className="border-border bg-card overflow-x-auto rounded-2xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border text-muted-foreground border-b text-xs *:text-start">
                <th className="p-3">التاريخ</th>
                <th className="p-3">الإجراء</th>
                <th className="p-3">النوع</th>
                <th className="p-3">بواسطة</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const expanded = expandedId === log.id;
                return (
                  <Fragment key={log.id}>
                    <tr className="border-border border-b last:border-0">
                      <td className="p-3" dir="ltr">
                        {new Date(log.createdAt).toLocaleString('ar-EG')}
                      </td>
                      <td className="p-3">
                        <StatusBadge tone={ACTION_TONE[log.action] ?? 'info'}>{actionLabel(log.action)}</StatusBadge>
                      </td>
                      <td className="text-muted-foreground p-3">
                        {log.entityType}
                        <span className="text-xs"> ({log.entityId.slice(0, 8)}…)</span>
                      </td>
                      <td className="p-3">{log.performedByName ?? '—'}</td>
                      <td className="p-3">
                        {Boolean(log.previousValue || log.newValue) && (
                          <button
                            type="button"
                            onClick={() => setExpandedId(expanded ? null : log.id)}
                            className="text-primary text-xs hover:underline"
                          >
                            {expanded ? 'إخفاء التفاصيل' : 'عرض التفاصيل'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="border-border bg-muted/30 border-b last:border-0">
                        <td colSpan={5} className="p-3">
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {log.previousValue !== null && log.previousValue !== undefined && (
                              <div>
                                <p className="text-muted-foreground mb-1 text-xs">قبل</p>
                                <pre className="bg-background overflow-x-auto rounded-md border p-2 text-xs" dir="ltr">
                                  {JSON.stringify(log.previousValue, null, 2)}
                                </pre>
                              </div>
                            )}
                            {log.newValue !== null && log.newValue !== undefined && (
                              <div>
                                <p className="text-muted-foreground mb-1 text-xs">بعد</p>
                                <pre className="bg-background overflow-x-auto rounded-md border p-2 text-xs" dir="ltr">
                                  {JSON.stringify(log.newValue, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
