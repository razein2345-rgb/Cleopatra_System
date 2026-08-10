import { useEffect, useState } from 'react';
import type {
  ContactPerson,
  CreateContactPersonInput,
  PreferredContactMethod,
  UpdateContactPersonInput,
} from '@cleopatra/shared';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';

const PREFERRED_METHOD_OPTIONS: Array<[PreferredContactMethod, string]> = [
  ['PHONE', 'Phone'],
  ['MOBILE', 'Mobile'],
  ['WHATSAPP', 'WhatsApp'],
  ['EMAIL', 'Email'],
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
        setError(err instanceof Error ? err.message : 'Failed to load contacts'),
      );
  };

  useEffect(load, [partnerId]);

  const setPrimary = async (contact: ContactPerson) => {
    setError(null);
    try {
      await apiPut(`/api/partners/${partnerId}/contacts/${contact.id}/primary`, {});
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set primary contact');
    }
  };

  const removeContact = async (contact: ContactPerson) => {
    if (!confirm(`Remove ${contact.fullName}?`)) return;
    setError(null);
    try {
      await apiDelete(`/api/partners/${partnerId}/contacts/${contact.id}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove contact');
    }
  };

  if (error) return <div className="text-destructive text-sm">{error}</div>;
  if (!contacts) return <div className="text-muted-foreground text-sm">Loading contacts…</div>;

  return (
    <div className="space-y-4">
      {canManage && (
        <Button onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? 'Cancel' : '+ Add Contact'}
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
              <th className="p-3">Name</th>
              <th className="p-3">Title / Department</th>
              <th className="p-3">Contact</th>
              <th className="p-3">Approvals</th>
              <th className="p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => (
              <tr key={contact.id} className="border-border border-b last:border-0 align-top">
                <td className="p-3 font-medium">
                  {contact.fullName}
                  {contact.isPrimary && (
                    <span className="bg-primary/10 text-primary ms-2 rounded-full px-2 py-0.5 text-xs">
                      Primary
                    </span>
                  )}
                </td>
                <td className="text-muted-foreground p-3">
                  {[contact.jobTitle, contact.department].filter(Boolean).join(' — ') || '—'}
                </td>
                <td className="text-muted-foreground p-3">
                  <div className="flex flex-col gap-0.5">
                    {contact.mobile && <span>{contact.mobile}</span>}
                    {contact.phone && <span>{contact.phone}</span>}
                    {contact.whatsapp && <span>WhatsApp: {contact.whatsapp}</span>}
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
                        Quotations
                      </span>
                    )}
                    {contact.canApproveWorkOrders && (
                      <span className="bg-secondary rounded-full px-2 py-0.5 text-xs">
                        Work Orders
                      </span>
                    )}
                    {contact.canApproveFinancialDocuments && (
                      <span className="bg-secondary rounded-full px-2 py-0.5 text-xs">
                        Financial Docs
                      </span>
                    )}
                  </div>
                </td>
                <td className="p-3">
                  <span className={contact.isActive ? 'text-green-600' : 'text-muted-foreground'}>
                    {contact.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="p-3">
                  {canManage && (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setEditing(contact)}>
                        Edit
                      </Button>
                      {!contact.isPrimary && contact.isActive && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void setPrimary(contact)}
                        >
                          Make Primary
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => void removeContact(contact)}>
                        Remove
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {contacts.length === 0 && (
              <tr>
                <td className="text-muted-foreground p-3" colSpan={6}>
                  No contacts yet.
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
      setError(err instanceof Error ? err.message : 'Failed to save contact');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-border bg-card space-y-4 rounded-2xl border p-4">
      <h3 className="font-semibold">{contact ? `Edit ${contact.fullName}` : 'New Contact'}</h3>
      {error && <div className="text-destructive text-sm">{error}</div>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Full name</span>
          <input
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Job title</span>
          <input
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Department</span>
          <input
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Preferred contact method</span>
          <select
            value={preferredContactMethod}
            onChange={(e) =>
              setPreferredContactMethod(e.target.value as PreferredContactMethod | '')
            }
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          >
            <option value="">— unspecified —</option>
            {PREFERRED_METHOD_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Mobile</span>
          <input
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Phone</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">WhatsApp</span>
          <input
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div>
        <p className="text-muted-foreground mb-1.5 text-sm">Approval authority</p>
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={canApproveQuotations}
              onChange={(e) => setCanApproveQuotations(e.target.checked)}
            />
            Can approve quotations
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={canApproveWorkOrders}
              onChange={(e) => setCanApproveWorkOrders(e.target.checked)}
            />
            Can approve work orders
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={canApproveFinancialDocuments}
              onChange={(e) => setCanApproveFinancialDocuments(e.target.checked)}
            />
            Can approve financial documents
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
          Active
          {contact.isPrimary && isActive === false && (
            <span className="text-muted-foreground">
              (deactivating removes this contact as Primary)
            </span>
          )}
        </label>
      )}

      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
        />
      </label>

      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
