import { useEffect, useState } from 'react';
import type {
  ContactPerson,
  CreateContactPersonInput,
  PreferredContactMethod,
  UpdateContactPersonInput,
} from '@cleopatra/shared';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { EditableCheckboxCell, EditableTextCell } from '@/components/cleopatra';

const PREFERRED_METHOD_OPTIONS: Array<[PreferredContactMethod, string]> = [
  ['PHONE', 'تليفون'],
  ['MOBILE', 'موبايل'],
  ['WHATSAPP', 'واتساب'],
  ['EMAIL', 'بريد إلكتروني'],
];

/** Contacts tab — FEATURE-002 Milestone 2. */
export function ContactsTab({
  partnerId,
  canManage,
}: {
  partnerId: string;
  canManage: boolean;
}) {
  const [contacts, setContacts] = useState<ContactPerson[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<ContactPerson | null>(null);

  const load = () => {
    apiGet<ContactPerson[]>(`/api/partners/${partnerId}/contacts`)
      .then(setContacts)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'تعذر تحميل جهات الاتصال'),
      );
  };

  useEffect(load, [partnerId]);

  const setPrimary = async (contact: ContactPerson) => {
    setError(null);
    try {
      await apiPut(`/api/partners/${partnerId}/contacts/${contact.id}/primary`, {});
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تعيين جهة الاتصال الأساسية');
    }
  };

  const removeContact = async (contact: ContactPerson) => {
    if (!confirm(`حذف "${contact.fullName}"؟`)) return;
    setError(null);
    try {
      await apiDelete(`/api/partners/${partnerId}/contacts/${contact.id}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف جهة الاتصال');
    }
  };

  // FEATURE-014 — inline edit for the two cleanly single-cell fields
  // (name, active status); the rest (job title/contact methods/approval
  // permissions/notes) stay in `ContactForm` — a bundle of related fields,
  // not one cell's worth.
  const updateContactField = async (contact: ContactPerson, patch: UpdateContactPersonInput) => {
    const updated = await apiPut<ContactPerson>(`/api/partners/${partnerId}/contacts/${contact.id}`, patch);
    setContacts((prev) => prev?.map((c) => (c.id === contact.id ? updated : c)) ?? prev);
  };

  if (error) return <div className="text-destructive text-sm">{error}</div>;
  if (!contacts) return <div className="text-muted-foreground text-sm">جارٍ تحميل جهات الاتصال…</div>;

  return (
    <div className="space-y-4">
      {canManage && (
        <Button onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? 'إلغاء' : '+ إضافة جهة اتصال'}
        </Button>
      )}

      {showCreate && (
        <ContactForm
          partnerId={partnerId}
          onSaved={() => {
            setShowCreate(false);
            load();
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      <div className="border-border bg-card overflow-x-auto rounded-2xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-border text-muted-foreground border-b text-xs *:text-start">
              <th className="p-3">الاسم</th>
              <th className="p-3">المسمى الوظيفي / القسم</th>
              <th className="p-3">التواصل</th>
              <th className="p-3">صلاحيات الاعتماد</th>
              <th className="p-3">الحالة</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => (
              <tr key={contact.id} className="border-border border-b last:border-0 align-top">
                <td className="p-3 font-medium">
                  <div className="flex items-center gap-1">
                    {canManage ? (
                      <EditableTextCell
                        value={contact.fullName}
                        onSave={(next) => updateContactField(contact, { fullName: next })}
                      />
                    ) : (
                      contact.fullName
                    )}
                    {contact.isPrimary && (
                      <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs">
                        أساسية
                      </span>
                    )}
                  </div>
                </td>
                <td className="text-muted-foreground p-3">
                  {[contact.jobTitle, contact.department].filter(Boolean).join(' — ') || '—'}
                </td>
                <td className="text-muted-foreground p-3">
                  <div className="flex flex-col gap-0.5">
                    {contact.mobile && <span>{contact.mobile}</span>}
                    {contact.phone && <span>{contact.phone}</span>}
                    {contact.whatsapp && <span>واتساب: {contact.whatsapp}</span>}
                    {contact.email && <span>{contact.email}</span>}
                    {!contact.mobile && !contact.phone && !contact.whatsapp && !contact.email && (
                      <span>—</span>
                    )}
                  </div>
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    {contact.canApproveQuotations && (
                      <span className="bg-secondary rounded-full px-2 py-0.5 text-xs">
                        عروض الأسعار
                      </span>
                    )}
                    {contact.canApproveWorkOrders && (
                      <span className="bg-secondary rounded-full px-2 py-0.5 text-xs">
                        أوامر الشغل
                      </span>
                    )}
                    {contact.canApproveFinancialDocuments && (
                      <span className="bg-secondary rounded-full px-2 py-0.5 text-xs">
                        المستندات المالية
                      </span>
                    )}
                  </div>
                </td>
                <td className="p-3">
                  {canManage ? (
                    <div className="flex items-center gap-1.5">
                      <EditableCheckboxCell
                        value={contact.isActive}
                        onSave={(next) => updateContactField(contact, { isActive: next })}
                      />
                      <span className={contact.isActive ? 'text-green-600' : 'text-muted-foreground'}>
                        {contact.isActive ? 'نشط' : 'غير نشط'}
                      </span>
                    </div>
                  ) : (
                    <span className={contact.isActive ? 'text-green-600' : 'text-muted-foreground'}>
                      {contact.isActive ? 'نشط' : 'غير نشط'}
                    </span>
                  )}
                </td>
                <td className="p-3">
                  {canManage && (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setEditing(contact)}>
                        تعديل
                      </Button>
                      {!contact.isPrimary && contact.isActive && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void setPrimary(contact)}
                        >
                          جعلها أساسية
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => void removeContact(contact)}>
                        حذف
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {contacts.length === 0 && (
              <tr>
                <td className="text-muted-foreground p-3" colSpan={6}>
                  لا توجد جهات اتصال بعد.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <ContactForm
          partnerId={partnerId}
          contact={editing}
          onSaved={() => {
            setEditing(null);
            load();
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ContactForm({
  partnerId,
  contact,
  onSaved,
  onCancel,
}: {
  partnerId: string;
  contact?: ContactPerson;
  onSaved: (contact: ContactPerson) => void;
  onCancel: () => void;
}) {
  const [fullName, setFullName] = useState(contact?.fullName ?? '');
  const [jobTitle, setJobTitle] = useState(contact?.jobTitle ?? '');
  const [department, setDepartment] = useState(contact?.department ?? '');
  const [mobile, setMobile] = useState(contact?.mobile ?? '');
  const [phone, setPhone] = useState(contact?.phone ?? '');
  const [whatsapp, setWhatsapp] = useState(contact?.whatsapp ?? '');
  const [email, setEmail] = useState(contact?.email ?? '');
  const [preferredContactMethod, setPreferredContactMethod] = useState<
    PreferredContactMethod | ''
  >(contact?.preferredContactMethod ?? '');
  const [canApproveQuotations, setCanApproveQuotations] = useState(
    contact?.canApproveQuotations ?? false,
  );
  const [canApproveWorkOrders, setCanApproveWorkOrders] = useState(
    contact?.canApproveWorkOrders ?? false,
  );
  const [canApproveFinancialDocuments, setCanApproveFinancialDocuments] = useState(
    contact?.canApproveFinancialDocuments ?? false,
  );
  const [notes, setNotes] = useState(contact?.notes ?? '');
  const [isActive, setIsActive] = useState(contact?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      let saved: ContactPerson;
      if (contact) {
        // Editing an existing contact: an emptied field explicitly clears
        // it (null), rather than leaving the previous value untouched.
        const input: UpdateContactPersonInput = {
          fullName,
          jobTitle: jobTitle || null,
          department: department || null,
          mobile: mobile || null,
          phone: phone || null,
          whatsapp: whatsapp || null,
          email: email || null,
          preferredContactMethod: preferredContactMethod || null,
          canApproveQuotations,
          canApproveWorkOrders,
          canApproveFinancialDocuments,
          notes: notes || null,
          isActive,
        };
        saved = await apiPut<ContactPerson>(
          `/api/partners/${partnerId}/contacts/${contact.id}`,
          input,
        );
      } else {
        // Creating: an empty field is simply omitted, not sent as null.
        const input: CreateContactPersonInput = {
          fullName,
          jobTitle: jobTitle || undefined,
          department: department || undefined,
          mobile: mobile || undefined,
          phone: phone || undefined,
          whatsapp: whatsapp || undefined,
          email: email || undefined,
          preferredContactMethod: preferredContactMethod || undefined,
          canApproveQuotations,
          canApproveWorkOrders,
          canApproveFinancialDocuments,
          notes: notes || undefined,
        };
        saved = await apiPost<ContactPerson>(`/api/partners/${partnerId}/contacts`, input);
      }
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ جهة الاتصال');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-border bg-card space-y-4 rounded-2xl border p-4">
      <h3 className="font-semibold">{contact ? `تعديل "${contact.fullName}"` : 'جهة اتصال جديدة'}</h3>
      {error && <div className="text-destructive text-sm">{error}</div>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">الاسم بالكامل</span>
          <input
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">المسمى الوظيفي</span>
          <input
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">القسم</span>
          <input
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">طريقة التواصل المفضلة</span>
          <select
            value={preferredContactMethod}
            onChange={(e) =>
              setPreferredContactMethod(e.target.value as PreferredContactMethod | '')
            }
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          >
            <option value="">— غير محدد —</option>
            {PREFERRED_METHOD_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">موبايل</span>
          <input
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">تليفون</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">واتساب</span>
          <input
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">البريد الإلكتروني</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div>
        <p className="text-muted-foreground mb-1.5 text-sm">صلاحيات الاعتماد</p>
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={canApproveQuotations}
              onChange={(e) => setCanApproveQuotations(e.target.checked)}
            />
            يقدر يعتمد عروض الأسعار
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={canApproveWorkOrders}
              onChange={(e) => setCanApproveWorkOrders(e.target.checked)}
            />
            يقدر يعتمد أوامر الشغل
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={canApproveFinancialDocuments}
              onChange={(e) => setCanApproveFinancialDocuments(e.target.checked)}
            />
            يقدر يعتمد المستندات المالية
          </label>
        </div>
      </div>

      {contact && (
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          نشط
          {contact.isPrimary && isActive === false && (
            <span className="text-muted-foreground">
              (تعطيلها يلغي كونها جهة الاتصال الأساسية)
            </span>
          )}
        </label>
      )}

      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">ملاحظات</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
        />
      </label>

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
