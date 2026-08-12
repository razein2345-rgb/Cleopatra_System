import { useRef, useState } from 'react';
import type { Attachment, Setting, UpdateSettingInput } from '@cleopatra/shared';
import { apiPostFormData, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/state/AuthContext';

const TEXT_FIELDS: Array<{ key: keyof UpdateSettingInput; label: string }> = [
  { key: 'businessNameAr', label: 'اسم المنشأة (عربي)' },
  { key: 'businessNameEn', label: 'اسم المنشأة (إنجليزي)' },
  { key: 'address', label: 'العنوان' },
  { key: 'phone', label: 'الهاتف' },
  { key: 'email', label: 'البريد الإلكتروني' },
  { key: 'website', label: 'الموقع الإلكتروني' },
  { key: 'taxNumber', label: 'الرقم الضريبي' },
  { key: 'commercialRegisterNumber', label: 'رقم السجل التجاري' },
];

/**
 * FEATURE-006 M6 — business identity fields (Setting, M1) surfaced for
 * editing. `logoUrl` used to be a plain URL text field (no upload endpoint
 * existed anywhere in this codebase before FEATURE-007's `/api/attachments`
 * — owner, 2026-08-12: "عايز احط اللوجو في السيستم فوق"); now a real
 * dropzone, same upload flow the order screen's reference-image field
 * uses. The uploaded logo also drives `AppShell`'s top bar via the same
 * `Setting.logoUrl` this form writes.
 */
export function BusinessIdentityForm({ setting, onSaved }: { setting: Setting; onSaved: () => void }) {
  const { can } = useAuth();
  const canEdit = can('settings.edit');
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(TEXT_FIELDS.map((f) => [f.key, (setting[f.key] as string | null) ?? ''])),
  );
  const [logoUrl, setLogoUrl] = useState(setting.logoUrl ?? '');
  const [logoUploading, setLogoUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadLogo = async (file: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('نوع الملف غير مدعوم — JPG أو PNG أو WEBP فقط');
      return;
    }
    setError(null);
    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', 'BUSINESS_LOGO');
      const attachment = await apiPostFormData<Attachment>('/api/attachments', fd);
      setLogoUrl(attachment.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر رفع الشعار');
    } finally {
      setLogoUploading(false);
    }
  };

  if (!editing) {
    return (
      <div className="space-y-3">
        {canEdit && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setValues(Object.fromEntries(TEXT_FIELDS.map((f) => [f.key, (setting[f.key] as string | null) ?? ''])));
              setLogoUrl(setting.logoUrl ?? '');
              setEditing(true);
            }}
          >
            تعديل الهوية التجارية
          </Button>
        )}
        <div className="flex items-center gap-3">
          {setting.logoUrl ? (
            <img src={setting.logoUrl} alt="الشعار" className="h-16 object-contain" />
          ) : (
            <span className="text-muted-foreground text-sm">لا يوجد شعار مرفوع بعد</span>
          )}
        </div>
        <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          {TEXT_FIELDS.map((f) => (
            <div key={f.key} className="border-border flex flex-col gap-1 border-b border-dashed py-2 text-sm">
              <span className="text-muted-foreground">{f.label}</span>
              <span className="font-medium">{(setting[f.key] as string | null) || '—'}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        ...Object.fromEntries(TEXT_FIELDS.map((f) => [f.key, values[f.key].trim() === '' ? null : values[f.key].trim()])),
        logoUrl: logoUrl.trim() === '' ? null : logoUrl.trim(),
      } satisfies UpdateSettingInput;
      await apiPut('/api/settings', payload);
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ الهوية التجارية');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {error && <div className="text-destructive text-sm">{error}</div>}

      <div className="space-y-1">
        <span className="text-muted-foreground text-sm">شعار المنشأة</span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadLogo(file);
            e.target.value = '';
          }}
        />
        {logoUrl ? (
          <div className="border-border flex items-center gap-3 rounded-xl border border-dashed p-3">
            <img src={logoUrl} alt="" className="h-16 object-contain" />
            <div className="flex flex-col gap-1">
              <Button type="button" variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
                استبدال الشعار
              </Button>
              <button type="button" onClick={() => setLogoUrl('')} className="text-destructive text-xs">
                إزالة الشعار
              </button>
            </div>
          </div>
        ) : (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) void uploadLogo(file);
            }}
            onClick={() => fileInputRef.current?.click()}
            className="border-border hover:bg-muted/30 flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed p-6 text-center"
          >
            <span>📤</span>
            <span className="text-sm">{logoUploading ? 'جارٍ الرفع…' : 'اضغط لاختيار الشعار أو اسحبه هنا'}</span>
            <span className="text-muted-foreground text-xs">JPG, PNG, WEBP</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {TEXT_FIELDS.map((f) => (
          <label key={f.key} className="space-y-1 text-sm">
            <span className="text-muted-foreground">{f.label}</span>
            <input
              value={values[f.key]}
              onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'جارٍ الحفظ…' : 'حفظ'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
