import { useRef, useState } from 'react';
import type { Attachment, Setting, UpdateSettingInput } from '@cleopatra/shared';
import { apiPostFormData, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/state/AuthContext';

const TEXT_FIELDS: Array<{ key: keyof UpdateSettingInput; label: string }> = [
  { key: 'businessNameAr', label: 'اسم المنشأة (عربي)' },
  { key: 'businessNameEn', label: 'اسم المنشأة (إنجليزي)' },
  { key: 'businessTagline', label: 'وصف/شعار دعائي (يظهر تحت الاسم بخط مختلف)' },
  { key: 'address', label: 'العنوان' },
  { key: 'phone', label: 'الهاتف' },
  { key: 'landlinePhone', label: 'الرقم الأرضي' },
  { key: 'email', label: 'البريد الإلكتروني' },
  { key: 'website', label: 'الموقع الإلكتروني' },
  { key: 'facebookUrl', label: 'صفحة الفيسبوك' },
  { key: 'taxNumber', label: 'الرقم الضريبي' },
  { key: 'commercialRegisterNumber', label: 'رقم السجل التجاري' },
];

/** Reusable upload widget for both the logo and the stamp — same dropzone/replace/remove flow, different `Attachment.category`. */
function ImageUploadField({
  label,
  value,
  onChange,
  category,
  heightClass,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  category: string;
  heightClass: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('نوع الملف غير مدعوم — JPG أو PNG أو WEBP فقط');
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', category);
      const attachment = await apiPostFormData<Attachment>('/api/attachments', fd);
      onChange(attachment.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر رفع الصورة');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-1">
      <span className="text-muted-foreground text-sm">{label}</span>
      {error && <p className="text-destructive text-xs">{error}</p>}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = '';
        }}
      />
      {value ? (
        <div className="border-border flex items-center gap-3 rounded-xl border border-dashed p-3">
          <img src={value} alt="" className={`${heightClass} object-contain`} />
          <div className="flex flex-col gap-1">
            <Button type="button" variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
              استبدال
            </Button>
            <button type="button" onClick={() => onChange('')} className="text-destructive text-xs">
              إزالة
            </button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) void upload(file);
          }}
          onClick={() => fileInputRef.current?.click()}
          className="border-border hover:bg-muted/30 flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed p-6 text-center"
        >
          <span>📤</span>
          <span className="text-sm">{uploading ? 'جارٍ الرفع…' : 'اضغط لاختيار صورة أو اسحبها هنا'}</span>
          <span className="text-muted-foreground text-xs">JPG, PNG, WEBP</span>
        </div>
      )}
    </div>
  );
}

/**
 * FEATURE-006 M6 — business identity fields (Setting, M1) surfaced for
 * editing. `logoUrl`/`stampUrl` used to have no upload endpoint anywhere
 * in this codebase before FEATURE-007's `/api/attachments` (owner,
 * 2026-08-12: "عايز احط اللوجو في السيستم فوق" / "عايز اضيف صورة الختم
 * فوق وتفضلو بقبول وافر الإحترام"); now real dropzones, same upload flow
 * the order screen's reference-image field uses. The uploaded logo also
 * drives `AppShell`'s top bar via the same `Setting.logoUrl` this form
 * writes.
 */
export function BusinessIdentityForm({ setting, onSaved }: { setting: Setting; onSaved: () => void }) {
  const { can } = useAuth();
  const canEdit = can('settings.edit');
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(TEXT_FIELDS.map((f) => [f.key, (setting[f.key] as string | null) ?? ''])),
  );
  const [logoUrl, setLogoUrl] = useState(setting.logoUrl ?? '');
  const [stampUrl, setStampUrl] = useState(setting.stampUrl ?? '');
  const [showStampOnInvoice, setShowStampOnInvoice] = useState(setting.showStampOnInvoice);
  const [showQuotationDate, setShowQuotationDate] = useState(setting.showQuotationDate);
  const [showQuotationSignatureArea, setShowQuotationSignatureArea] = useState(setting.showQuotationSignatureArea);
  const [showQuotationDocumentNumber, setShowQuotationDocumentNumber] = useState(setting.showQuotationDocumentNumber);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
              setStampUrl(setting.stampUrl ?? '');
              setShowStampOnInvoice(setting.showStampOnInvoice);
              setShowQuotationDate(setting.showQuotationDate);
              setShowQuotationSignatureArea(setting.showQuotationSignatureArea);
              setShowQuotationDocumentNumber(setting.showQuotationDocumentNumber);
              setEditing(true);
            }}
          >
            تعديل الهوية التجارية
          </Button>
        )}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            {setting.logoUrl ? (
              <img src={setting.logoUrl} alt="الشعار" className="h-16 object-contain" />
            ) : (
              <span className="text-muted-foreground text-sm">لا يوجد شعار مرفوع بعد</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {setting.stampUrl ? (
              <img src={setting.stampUrl} alt="الختم" className="h-16 object-contain" />
            ) : (
              <span className="text-muted-foreground text-sm">لا يوجد ختم مرفوع بعد</span>
            )}
          </div>
        </div>
        <p className="text-muted-foreground text-sm">
          إظهار الختم في الفاتورة: <span className="font-medium">{setting.showStampOnInvoice ? 'نعم' : 'لا'}</span>
        </p>
        <p className="text-muted-foreground text-sm">
          إظهار تاريخ الإصدار في عرض السعر: <span className="font-medium">{setting.showQuotationDate ? 'نعم' : 'لا'}</span>
        </p>
        <p className="text-muted-foreground text-sm">
          إظهار مكان التوقيع في عرض السعر: <span className="font-medium">{setting.showQuotationSignatureArea ? 'نعم' : 'لا'}</span>
        </p>
        <p className="text-muted-foreground text-sm">
          إظهار رقم عرض السعر عند الطباعة: <span className="font-medium">{setting.showQuotationDocumentNumber ? 'نعم' : 'لا'}</span>
        </p>
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
        stampUrl: stampUrl.trim() === '' ? null : stampUrl.trim(),
        showStampOnInvoice,
        showQuotationDate,
        showQuotationSignatureArea,
        showQuotationDocumentNumber,
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ImageUploadField label="شعار المنشأة" value={logoUrl} onChange={setLogoUrl} category="BUSINESS_LOGO" heightClass="h-16" />
        <ImageUploadField
          label="صورة الختم (تظهر فوق سطر «وتفضلوا بقبول وافر الاحترام»)"
          value={stampUrl}
          onChange={setStampUrl}
          category="BUSINESS_STAMP"
          heightClass="h-20"
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={showStampOnInvoice} onCheckedChange={(v) => setShowStampOnInvoice(v === true)} />
        <span>إظهار الختم في الفاتورة (عرض السعر وأمر الشغل يظهر فيهم دايمًا لو مرفوع)</span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={showQuotationDate} onCheckedChange={(v) => setShowQuotationDate(v === true)} />
        <span>إظهار تاريخ الإصدار في عرض السعر</span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={showQuotationSignatureArea} onCheckedChange={(v) => setShowQuotationSignatureArea(v === true)} />
        <span>إظهار مكان التوقيع في عرض السعر</span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={showQuotationDocumentNumber} onCheckedChange={(v) => setShowQuotationDocumentNumber(v === true)} />
        <span>إظهار رقم عرض السعر عند الطباعة</span>
      </label>

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
