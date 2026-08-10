import { useEffect, useState } from 'react';
import type { DocumentTemplate, DocumentTemplateConfig, DocumentType } from '@cleopatra/shared';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/cleopatra/StatusBadge';
import { useAuth } from '@/state/AuthContext';
import { DEFAULT_TEMPLATE_CONFIG, TEMPLATE_CONFIG_FIELDS } from '@/lib/documents/templateConfigFields';

/**
 * FEATURE-006 M6 — one generic manager reused for QUOTATION/INVOICE/
 * WORK_ORDER (02_PLAN.md's Milestone 6: "Invoice template (single
 * default, same edit form), Work Order template (same)") instead of
 * three near-duplicate screens.
 */
export function DocumentTemplateManager({ documentType, title }: { documentType: DocumentType; title: string }) {
  const { can } = useAuth();
  const canManage = can('settings.edit');
  const [templates, setTemplates] = useState<DocumentTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    apiGet<DocumentTemplate[]>(`/api/document-templates?documentType=${documentType}`)
      .then(setTemplates)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل القوالب'));
  };

  useEffect(load, [documentType]);

  const runAction = async (id: string, action: () => Promise<unknown>) => {
    setError(null);
    setBusyId(id);
    try {
      await action();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تنفيذ العملية');
    } finally {
      setBusyId(null);
    }
  };

  const duplicate = (t: DocumentTemplate) => {
    const name = window.prompt('اسم النسخة الجديدة', `${t.name} (نسخة)`);
    if (!name || !name.trim()) return;
    void runAction(t.id, () => apiPost(`/api/document-templates/${t.id}/duplicate`, { name: name.trim() }));
  };

  const remove = (t: DocumentTemplate) => {
    if (!window.confirm(`حذف القالب "${t.name}"؟`)) return;
    void runAction(t.id, () => apiDelete(`/api/document-templates/${t.id}`));
  };

  if (error && !templates) return <div className="text-destructive text-sm">{error}</div>;
  if (!templates) return <div className="text-muted-foreground text-sm">جارٍ التحميل…</div>;

  return (
    <div className="space-y-3">
      {error && <div className="text-destructive text-sm">{error}</div>}
      {canManage && (
        <Button variant="secondary" size="sm" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? 'إلغاء' : `+ قالب ${title} جديد`}
        </Button>
      )}
      {showCreate && (
        <TemplateForm
          documentType={documentType}
          onSaved={() => {
            setShowCreate(false);
            load();
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}
      <div className="space-y-2">
        {templates.map((t) => (
          <div key={t.id} className="border-border rounded-lg border p-3">
            {editingId === t.id ? (
              <TemplateForm
                documentType={documentType}
                template={t}
                onSaved={() => {
                  setEditingId(null);
                  load();
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{t.name}</span>
                    <StatusBadge tone="neutral">إصدار {t.version}</StatusBadge>
                    <StatusBadge tone={t.publishedAt ? 'success' : 'warning'}>
                      {t.publishedAt ? 'منشور' : 'مسودة'}
                    </StatusBadge>
                    {t.isDefault && <StatusBadge tone="info">افتراضي</StatusBadge>}
                    {t.nextVersionExists && <StatusBadge tone="neutral">توجد نسخة أحدث</StatusBadge>}
                  </div>
                  {canManage && (
                    <div className="flex flex-wrap gap-2">
                      {!t.publishedAt && (
                        <Button variant="ghost" size="sm" onClick={() => setEditingId(t.id)}>
                          تعديل
                        </Button>
                      )}
                      {!t.publishedAt && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busyId === t.id}
                          onClick={() => void runAction(t.id, () => apiPost(`/api/document-templates/${t.id}/publish`))}
                        >
                          نشر
                        </Button>
                      )}
                      {t.publishedAt && !t.isDefault && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busyId === t.id}
                          onClick={() => void runAction(t.id, () => apiPut(`/api/document-templates/${t.id}/default`))}
                        >
                          تعيين كافتراضي
                        </Button>
                      )}
                      {t.publishedAt && !t.nextVersionExists && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busyId === t.id}
                          onClick={() => void runAction(t.id, () => apiPost(`/api/document-templates/${t.id}/versions`))}
                        >
                          نسخة جديدة
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" disabled={busyId === t.id} onClick={() => duplicate(t)}>
                        تكرار
                      </Button>
                      <Button variant="ghost" size="sm" disabled={busyId === t.id} onClick={() => remove(t)}>
                        حذف
                      </Button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
        {templates.length === 0 && <div className="text-muted-foreground text-sm">لا توجد قوالب {title} بعد.</div>}
      </div>
    </div>
  );
}

function TemplateForm({
  documentType,
  template,
  onSaved,
  onCancel,
}: {
  documentType: DocumentType;
  template?: DocumentTemplate;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(template?.name ?? '');
  const [config, setConfig] = useState<DocumentTemplateConfig>(template?.config ?? DEFAULT_TEMPLATE_CONFIG);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      if (template) {
        await apiPut(`/api/document-templates/${template.id}`, { name, config });
      } else {
        await apiPost('/api/document-templates', { documentType, name, config });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ القالب');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-muted/30 space-y-3 rounded-lg border p-3">
      {error && <div className="text-destructive text-xs">{error}</div>}
      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">اسم القالب</span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
        />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {TEMPLATE_CONFIG_FIELDS.map((f) => {
          if (f.type === 'boolean') {
            return (
              <label key={f.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(config[f.key] ?? false)}
                  onChange={(e) => setConfig((prev) => ({ ...prev, [f.key]: e.target.checked }))}
                />
                <span>{f.label}</span>
              </label>
            );
          }
          const value = typeof config[f.key] === 'string' ? (config[f.key] as string) : '';
          if (f.type === 'textarea') {
            return (
              <label key={f.key} className="space-y-1 text-sm sm:col-span-2">
                <span className="text-muted-foreground">{f.label}</span>
                <textarea
                  rows={3}
                  value={value}
                  onChange={(e) => setConfig((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
            );
          }
          return (
            <label key={f.key} className="space-y-1 text-sm">
              <span className="text-muted-foreground">{f.label}</span>
              <input
                value={value}
                onChange={(e) => setConfig((prev) => ({ ...prev, [f.key]: e.target.value }))}
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              />
            </label>
          );
        })}
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? 'جارٍ الحفظ…' : 'حفظ'}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
