import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type {
  BranchSummary,
  BusinessPartner,
  Gender,
  LeadSource,
  PartnerRole,
  PartnerStatus,
  UpdateBusinessPartnerInput,
  User,
} from '@cleopatra/shared';
import { apiDelete, apiGet, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Combobox, useConfirm } from '@/components/cleopatra';
import { useAuth } from '@/state/AuthContext';
import { LEAD_SOURCE_OPTIONS, PARTNER_ROLE_OPTIONS, PARTNER_STATUS_OPTIONS } from './partnerLabels';
import { ContactsTab } from './ContactsTab';
import { AddressesTab } from './AddressesTab';
import { CategoryTagsSection } from './CategoryTagsSection';
import { NotesTab } from './NotesTab';
import { CommercialTab } from './CommercialTab';
import { OrdersHistoryTab } from './OrdersHistoryTab';
import { PaymentsHistoryTab } from './PaymentsHistoryTab';
import { ReorderPredictionTab } from './ReorderPredictionTab';
import { whatsappLink } from '@/lib/whatsapp';

type Tab = 'overview' | 'orders' | 'reorder' | 'contacts' | 'addresses' | 'notes' | 'commercial' | 'payments';

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
  const confirm = useConfirm();

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
        setLoadError(err instanceof Error ? err.message : 'تعذر تحميل بيانات الشريك التجاري'),
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

  const removePartner = async () => {
    if (
      !partner ||
      !(await confirm({
        title: `حذف "${partner.nameAr}"؟`,
        description: 'لن يظهر بعدها في قائمة العملاء.',
        destructive: true,
      }))
    )
      return;
    await apiDelete(`/api/partners/${partner.id}`);
    navigate('/partners', { replace: true });
  };

  if (loadError) return <div className="text-destructive">{loadError}</div>;
  if (!partner) return <div className="text-muted-foreground">جارٍ التحميل…</div>;

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: 'نظرة عامة' },
    ...(can('orders.view') ? [{ id: 'orders' as const, label: 'الطلبات' }] : []),
    ...(can('orders.view') ? [{ id: 'reorder' as const, label: 'توقع إعادة الطلب' }] : []),
    { id: 'contacts', label: 'جهات الاتصال' },
    { id: 'addresses', label: 'العناوين' },
    ...(can('partners.edit') ? [{ id: 'notes' as const, label: 'الملاحظات' }] : []),
    ...(can('partners.credit.manage')
      ? [{ id: 'commercial' as const, label: 'الملف التجاري' }]
      : []),
    ...(can('treasury.view') ? [{ id: 'payments' as const, label: 'المدفوعات' }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{partner.nameAr}</h1>
        {can('partners.delete') && (
          <Button variant="destructive" onClick={() => void removePartner()}>
            حذف العميل
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

      {tab === 'orders' && can('orders.view') && <OrdersHistoryTab partnerId={partner.id} />}

      {tab === 'reorder' && can('orders.view') && (
        <ReorderPredictionTab partnerId={partner.id} partnerName={partner.nameAr} partnerPhone={partner.phone} />
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

      {tab === 'payments' && can('treasury.view') && <PaymentsHistoryTab partnerId={partner.id} />}
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
  const [gender, setGender] = useState<Gender | ''>(partner.gender ?? '');
  const [roles, setRoles] = useState<PartnerRole[]>(partner.roles);
  const [status, setStatus] = useState<PartnerStatus>(partner.status);
  const [branchId, setBranchId] = useState(partner.branchId);
  const [salesRepId, setSalesRepId] = useState(partner.salesRepId ?? '');
  const [phone, setPhone] = useState(partner.phone ?? '');
  const [email, setEmail] = useState(partner.email ?? '');
  const [notes, setNotes] = useState(partner.notes ?? '');
  const [leadSource, setLeadSource] = useState<LeadSource | ''>(partner.leadSource ?? '');
  const [lastContactedAt, setLastContactedAt] = useState(partner.lastContactedAt?.slice(0, 10) ?? '');
  const [nextFollowUpAt, setNextFollowUpAt] = useState(partner.nextFollowUpAt?.slice(0, 10) ?? '');
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
        gender: isIndividual ? gender || null : null,
        roles,
        status,
        branchId,
        salesRepId: salesRepId || null,
        phone: phone || null,
        email: email || null,
        notes: notes || null,
        leadSource: leadSource || null,
        lastContactedAt: lastContactedAt || null,
        nextFollowUpAt: nextFollowUpAt || null,
      };
      const updated = await apiPut<BusinessPartner>(`/api/partners/${partner.id}`, input);
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ بيانات الشريك التجاري');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-border bg-card space-y-4 rounded-2xl border p-4">
      <h2 className="font-semibold">نظرة عامة</h2>
      {error && <div className="text-destructive text-sm">{error}</div>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">الاسم</span>
          <input
            required
            disabled={!canEdit}
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">الاسم (إنجليزي، اختياري)</span>
          <input
            disabled={!canEdit}
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">الاسم المختصر (اختياري)</span>
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
          فرد (وليس جهة/مؤسسة)
        </label>
        {isIndividual && (
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">الجنس (لتحديد السيد/السيدة في المستندات)</span>
            <select
              disabled={!canEdit}
              value={gender}
              onChange={(e) => setGender(e.target.value as Gender | '')}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
            >
              <option value="">غير محدد</option>
              <option value="MALE">ذكر (السيد)</option>
              <option value="FEMALE">أنثى (السيدة)</option>
            </select>
          </label>
        )}

        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">الحالة</span>
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
          <span className="text-muted-foreground">الفرع</span>
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
            <span className="text-muted-foreground">مندوب المبيعات (اختياري)</span>
            <Combobox
              disabled={!canEdit}
              items={[{ id: '', name: '— بدون —' }, ...staff]}
              value={salesRepId}
              getKey={(s) => s.id}
              getLabel={(s) => s.name}
              onChange={(s) => setSalesRepId(s.id)}
              placeholder="— بدون —"
              searchPlaceholder="اكتب اسم الموظف…"
            />
          </label>
        )}

        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground flex items-center justify-between gap-2">
            الهاتف
            {phone && whatsappLink(phone) && (
              <a
                href={whatsappLink(phone) ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="text-success hover:underline"
              >
                فتح واتساب ↗
              </a>
            )}
          </span>
          <input
            disabled={!canEdit}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">البريد الإلكتروني</span>
          <input
            type="email"
            disabled={!canEdit}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">مصدر العميل (اختياري)</span>
          <select
            disabled={!canEdit}
            value={leadSource}
            onChange={(e) => setLeadSource(e.target.value as LeadSource | '')}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
          >
            <option value="">غير محدد</option>
            {LEAD_SOURCE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">تاريخ آخر تواصل (اختياري)</span>
          <input
            type="date"
            disabled={!canEdit}
            value={lastContactedAt}
            onChange={(e) => setLastContactedAt(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">تذكير متابعة في (اختياري)</span>
          <input
            type="date"
            disabled={!canEdit}
            value={nextFollowUpAt}
            onChange={(e) => setNextFollowUpAt(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
          />
        </label>
      </div>

      <div>
        <p className="text-muted-foreground mb-1.5 text-sm">الأدوار</p>
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
        <span className="text-muted-foreground">ملاحظات</span>
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
          {submitting ? 'جارٍ الحفظ…' : 'حفظ التغييرات'}
        </Button>
      )}
    </form>
  );
}
