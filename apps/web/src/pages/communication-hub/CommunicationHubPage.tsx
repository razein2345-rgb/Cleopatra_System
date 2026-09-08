import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { CommunicationHubLink } from '@cleopatra/shared';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/cleopatra';
import { useAuth } from '@/state/AuthContext';
import { normalizeExternalUrl } from '@/lib/url';

/**
 * Owner (2026-09-08, "عايز صفحة يكون عندي قابلية فيها إني اعمل Embed
 * للمواقع فيها زي نوشن يعني اعمل Embed لوتساب وافتحه من داخل السيستم فا
 * افتح كل وسائل التواصل بتاعتي من السيستم بحيث اقدر ارد على العملاء
 * بسهوله واشوف كل السوشيال ميديا بتاعتي من هناك") — true iframe embedding
 * of WhatsApp Web/Facebook/Instagram is blocked by those sites' own
 * X-Frame-Options/CSP (their own anti-clickjacking control, not something
 * this app can or should try to bypass). Explained to the owner, who
 * accepted "افتح في تاب جديد" ("تمام مفيش مشكلة") as the working
 * alternative — this page is that alternative: a shared, admin-managed
 * list of one-click launch tiles, open to every logged-in staff member
 * (reception/sales need this daily), with add/edit/reorder/delete
 * restricted to whoever holds `settings.edit` (same convention as every
 * other admin-managed catalog in this app).
 */
export function CommunicationHubPage() {
  const { can } = useAuth();
  const canManage = can('settings.edit');
  const confirm = useConfirm();

  const [links, setLinks] = useState<CommunicationHubLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = () => {
    apiGet<CommunicationHubLink[]>('/api/communication-hub-links')
      .then(setLinks)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل الروابط'));
  };

  useEffect(load, []);

  const move = async (id: string, direction: 'up' | 'down') => {
    setBusyId(id);
    try {
      const updated = await apiPost<CommunicationHubLink[]>(`/api/communication-hub-links/${id}/move`, { direction });
      setLinks(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تغيير الترتيب');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (link: CommunicationHubLink) => {
    if (!(await confirm({ title: `حذف "${link.label}"؟`, destructive: true }))) return;
    setError(null);
    try {
      await apiDelete(`/api/communication-hub-links/${link.id}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف الرابط');
    }
  };

  if (error && !links) return <div className="text-destructive">{error}</div>;
  if (!links) return <div className="text-muted-foreground">جارٍ التحميل…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">مركز التواصل</h1>
          <p className="text-muted-foreground text-xs">
            كل وسائل التواصل بتاعتك في مكان واحد — دوس على أي زرار عشان يفتحلك في تاب جديد.
          </p>
        </div>
        {canManage && <Button onClick={() => setShowAdd((v) => !v)}>{showAdd ? 'إلغاء' : '+ رابط جديد'}</Button>}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {showAdd && (
        <AddLinkForm
          onAdded={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}

      {links.length === 0 && (
        <div className="border-border bg-card rounded-2xl border p-6 text-center">
          <p className="text-muted-foreground text-sm">
            {canManage ? 'مفيش روابط لسه — ضيف أول رابط (واتساب، فيسبوك، إيميل...).' : 'مفيش روابط تواصل متاحة لسه.'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((link, index) =>
          editingId === link.id ? (
            <EditLinkForm
              key={link.id}
              link={link}
              onSaved={(updated) => {
                setLinks((prev) => prev?.map((l) => (l.id === updated.id ? updated : l)) ?? prev);
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div key={link.id} className="border-border bg-card flex items-center gap-3 rounded-2xl border p-4">
              <a
                href={normalizeExternalUrl(link.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:bg-accent flex flex-1 items-center gap-3 rounded-lg p-1 text-start"
              >
                <ExternalLink className="text-primary size-5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{link.label}</p>
                  <p className="text-muted-foreground truncate text-xs" dir="ltr">
                    {link.url}
                  </p>
                </div>
              </a>
              {canManage && (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    disabled={busyId === link.id || index === 0}
                    onClick={() => void move(link.id, 'up')}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    title="لأعلى"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={busyId === link.id || index === links.length - 1}
                    onClick={() => void move(link.id, 'down')}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    title="لأسفل"
                  >
                    ↓
                  </button>
                  <button type="button" onClick={() => setEditingId(link.id)} className="text-primary text-xs hover:underline">
                    تعديل
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(link)}
                    className="text-destructive text-xs hover:underline"
                  >
                    حذف
                  </button>
                </div>
              )}
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function EditLinkForm({
  link,
  onSaved,
  onCancel,
}: {
  link: CommunicationHubLink;
  onSaved: (updated: CommunicationHubLink) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(link.label);
  const [url, setUrl] = useState(link.url);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const updated = await apiPut<CommunicationHubLink>(`/api/communication-hub-links/${link.id}`, { label, url });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ التعديل');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-primary bg-card space-y-2 rounded-2xl border p-4">
      {error && <p className="text-destructive text-xs">{error}</p>}
      <input
        autoFocus
        required
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
      />
      <input
        required
        dir="ltr"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'جارٍ الحفظ…' : 'حفظ'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}

function AddLinkForm({ onAdded }: { onAdded: () => void }) {
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await apiPost('/api/communication-hub-links', { label, url });
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إضافة الرابط');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-border bg-card space-y-3 rounded-2xl border p-4">
      {error && <div className="text-destructive text-sm">{error}</div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <input
          autoFocus
          required
          placeholder="الاسم — مثال: واتساب المبيعات"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm sm:col-span-1"
        />
        <input
          required
          placeholder="الرابط — مثال: wa.me/201234567890"
          dir="ltr"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm sm:col-span-2"
        />
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'جارٍ الحفظ…' : 'حفظ الرابط'}
      </Button>
    </form>
  );
}
