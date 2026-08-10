import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type {
  BranchSummary,
  BusinessPartner,
  PartnerRole,
  PartnerStatus,
  UpdateBusinessPartnerInput,
  User,
} from '@cleopatra/shared';
import { apiDelete, apiGet, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/state/AuthContext';
import { PARTNER_ROLE_OPTIONS, PARTNER_STATUS_OPTIONS } from './partnerLabels';
import { ContactsTab } from './ContactsTab';
import { AddressesTab } from './AddressesTab';
import { CategoryTagsSection } from './CategoryTagsSection';
import { NotesTab } from './NotesTab';
import { CommercialTab } from './CommercialTab';

type Tab = 'overview' | 'contacts' | 'addresses' | 'notes' | 'commercial';

/**
 * Partner Profile. Overview (FEATURE-002 M1), Contacts (M2), Addresses
 * (M3), Category & Tags (M4), Notes (M5), and Commercial & Credit Profile
 * (M6) are implemented; Tax & Compliance, Documents, Activity/Audit, and
 * Related Records are later milestones (see
 * docs/AI/FEATURES/FEATURE-002-CUSTOMERS/03_IMPLEMENT.md). Category & Tags
 * is a section within the Overview tab (not its own tab, per the explicit
 * M4 requirement); Notes and Commercial are their own tabs, each gated on
 * a different permission (`partners.edit` for Notes, `partners.credit.manage`
 * for Commercial — a deliberately distinct authority per 02_PLAN.md §3),
 * and each tab button is only shown to users holding that permission, so
 * there is nothing to show a user without it.
 */
export function PartnerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = useAuth();

  const [partner, setPartner] = useState<BusinessPartner | null>(null);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');

  useEffect(() => {
    if (!id) return;
    apiGet<BusinessPartner>(`/api/partners/${id}`)
      .then(setPartner)
      .catch((err: unknown) =>
        setLoadError(err instanceof Error ? err.message : 'Failed to load business partner'),
      );
    apiGet<BranchSummary[]>('/api/branches')
      .then(setBranches)
      .catch(() => setBranches([]));
    // Sales-rep assignment is optional and requires employees.view, which
    // not every role holding partners.edit has (e.g. SALES). Fail
    // silently — the sales-rep field is simply omitted in that case.
    apiGet<User[]>('/api/users')
      .then(setStaff)
      .catch(() => setStaff([]));
  }, [id]);

  const deactivate = async () => {
    if (!partner || !confirm(`Deactivate ${partner.nameAr}?`)) return;
    await apiDelete(`/api/partners/${partner.id}`);
    navigate('/partners', { replace: true });
  };

  if (loadError) return <div className="text-destructive">{loadError}</div>;
  if (!partner) return <div className="text-muted-foreground">Loading…</div>;

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'contacts', label: 'Contacts' },
    { id: 'addresses', label: 'Addresses' },
    ...(can('partners.edit') ? [{ id: 'notes' as const, label: 'Notes' }] : []),
    ...(can('partners.credit.manage')
      ? [{ id: 'commercial' as const, label: 'Commercial' }]
      : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{partner.nameAr}</h1>
        {can('partners.delete') && partner.status !== 'INACTIVE' && (
          <Button variant="ghost" onClick={() => void deactivate()}>
            Deactivate
          </Button>
        )}
      </div>

      <div className="border-border flex gap-4 border-b text-sm">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={
              tab === t.id
                ? 'text-primary border-primary -mb-px border-b-2 px-1 pb-2 font-semibold'
                : 'text-muted-foreground hover:text-foreground px-1 pb-2'
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <OverviewForm
            partner={partner}
            branches={branches}
            staff={staff}
            canEdit={can('partners.edit')}
            onSaved={setPartner}
          />
          <CategoryTagsSection partner={partner} canEdit={can('partners.edit')} onSaved={setPartner} />
        </>
      )}

      {tab === 'contacts' && (
        <ContactsTab partnerId={partner.id} canManage={can('partners.contacts.manage')} />
      )}

      {tab === 'addresses' && (
        <AddressesTab partnerId={partner.id} canManage={can('partners.addresses.manage')} />
      )}

      {tab === 'notes' && can('partners.edit') && (
        <NotesTab partnerId={partner.id} staff={staff} canManage={can('partners.edit')} />
      )}

      {tab === 'commercial' && can('partners.credit.manage') && (
        <CommercialTab partnerId={partner.id} canManage={can('partners.credit.manage')} />
      )}
    </div>
  );
}

function OverviewForm({
  partner,
  branches,
  staff,
  canEdit,
  onSaved,
}: {
  partner: BusinessPartner;
  branches: BranchSummary[];
  staff: User[];
  canEdit: boolean;
  onSaved: (partner: BusinessPartner) => void;
}) {
  const [nameAr, setNameAr] = useState(partner.nameAr);
  const [nameEn, setNameEn] = useState(partner.nameEn ?? '');
  const [shortName, setShortName] = useState(partner.shortName ?? '');
  const [isIndividual, setIsIndividual] = useState(partner.isIndividual);
  const [roles, setRoles] = useState<PartnerRole[]>(partner.roles);
  const [status, setStatus] = useState<PartnerStatus>(partner.status);
  const [branchId, setBranchId] = useState(partner.branchId);
  const [salesRepId, setSalesRepId] = useState(partner.salesRepId ?? '');
  const [phone, setPhone] = useState(partner.phone ?? '');
  const [email, setEmail] = useState(partner.email ?? '');
  const [notes, setNotes] = useState(partner.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const toggleRole = (role: PartnerRole) => {
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const input: UpdateBusinessPartnerInput = {
        nameAr,
        nameEn: nameEn || null,
        shortName: shortName || null,
        isIndividual,
        roles,
        status,
        branchId,
        salesRepId: salesRepId || null,
        phone: phone || null,
        email: email || null,
        notes: notes || null,
      };
      const updated = await apiPut<BusinessPartner>(`/api/partners/${partner.id}`, input);
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save business partner');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-border bg-card space-y-4 rounded-2xl border p-4">
      <h2 className="font-semibold">Overview</h2>
      {error && <div className="text-destructive text-sm">{error}</div>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Name</span>
          <input
            required
            disabled={!canEdit}
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Name (English, optional)</span>
          <input
            disabled={!canEdit}
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Short name (optional)</span>
          <input
            disabled={!canEdit}
            value={shortName}
            onChange={(e) => setShortName(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
          />
        </label>
        <label className="flex items-center gap-2 self-end text-sm">
          <input
            type="checkbox"
            disabled={!canEdit}
            checked={isIndividual}
            onChange={(e) => setIsIndividual(e.target.checked)}
          />
          Individual (not an organization)
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Status</span>
          <select
            disabled={!canEdit}
            value={status}
            onChange={(e) => setStatus(e.target.value as PartnerStatus)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
          >
            {PARTNER_STATUS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Branch</span>
          <select
            disabled={!canEdit}
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>

        {staff.length > 0 && (
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Sales representative (optional)</span>
            <select
              disabled={!canEdit}
              value={salesRepId}
              onChange={(e) => setSalesRepId(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
            >
              <option value="">— none —</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Phone</span>
          <input
            disabled={!canEdit}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Email</span>
          <input
            type="email"
            disabled={!canEdit}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
          />
        </label>
      </div>

      <div>
        <p className="text-muted-foreground mb-1.5 text-sm">Roles</p>
        <div className="flex flex-wrap gap-3">
          {PARTNER_ROLE_OPTIONS.map(([value, label]) => (
            <label key={value} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={roles.includes(value)}
                onChange={() => toggleRole(value)}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">Notes</span>
        <textarea
          disabled={!canEdit}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
        />
      </label>

      {canEdit && (
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save changes'}
        </Button>
      )}
    </form>
  );
}
