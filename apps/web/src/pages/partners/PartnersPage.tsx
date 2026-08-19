import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { BranchSummary, BusinessPartner, CreateBusinessPartnerInput, UpdateBusinessPartnerInput } from '@cleopatra/shared';
import { apiGet, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { EditableSelectCell, EditableTextCell, paginate, Pagination, StatusBadge } from '@/components/cleopatra';
import { useAuth } from '@/state/AuthContext';
import { PARTNER_ROLE_LABELS, PARTNER_STATUS_LABELS, PARTNER_STATUS_OPTIONS, PARTNER_STATUS_TONES } from './partnerLabels';

/**
 * Directory (list) + Quick-Add — FEATURE-002 Milestone 1 (Core Partner
 * Record). Search/filtering beyond the default name ordering is Milestone
 * 9; this page intentionally has none yet.
 */
const PAGE_SIZE = 25;

export function PartnersPage() {
  const { can } = useAuth();
  const [partners, setPartners] = useState<BusinessPartner[] | null>(null);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [page, setPage] = useState(1);

  const load = () => {
    Promise.all([
      apiGet<BusinessPartner[]>('/api/partners'),
      apiGet<BranchSummary[]>('/api/branches'),
    ])
      .then(([p, b]) => {
        setPartners(p);
        setBranches(b);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'تعذر تحميل العملاء'),
      );
  };

  useEffect(load, []);

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? id;
  const branchOptions = branches.map((b) => [b.id, b.name] as const);
  const canEdit = can('partners.edit');

  /**
   * FEATURE-007 — the owner's "زي جدول نوشن" ask: edit a partner's field
   * directly from the list, no separate edit dialog. Optimistic — updates
   * local state immediately, `EditableTextCell`/`EditableSelectCell`
   * revert their own draft and surface the error if the PUT fails.
   */
  const updatePartnerField = async (id: string, patch: UpdateBusinessPartnerInput) => {
    const updated = await apiPut<BusinessPartner>(`/api/partners/${id}`, patch);
    setPartners((prev) => prev?.map((p) => (p.id === id ? updated : p)) ?? prev);
  };

  if (error) return <div className="text-destructive">{error}</div>;
  if (!partners) return <div className="text-muted-foreground">جارٍ تحميل العملاء…</div>;

  const totalPages = Math.max(1, Math.ceil(partners.length / PAGE_SIZE));
  const pagePartners = paginate(partners, page, PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">العملاء</h1>
          {canEdit && <p className="text-muted-foreground text-xs">اضغط على أي خانة في الجدول للتعديل المباشر.</p>}
        </div>
        {can('partners.create') && (
          <Button onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? 'إلغاء' : '+ عميل جديد'}
          </Button>
        )}
      </div>

      {showCreate && (
        <CreatePartnerForm
          branches={branches}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}

      <div className="border-border bg-card overflow-x-auto rounded-2xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-border text-muted-foreground border-b text-xs *:text-start">
              <th className="p-3">الاسم</th>
              <th className="p-3">الأدوار</th>
              <th className="p-3">الفرع</th>
              <th className="p-3">الحالة</th>
              <th className="p-3">الهاتف</th>
            </tr>
          </thead>
          <tbody>
            {pagePartners.map((partner) => (
              <tr key={partner.id} className="border-border border-b last:border-0">
                <td className="p-3 font-medium">
                  <div className="flex items-center gap-1">
                    {canEdit ? (
                      <EditableTextCell
                        value={partner.nameAr}
                        onSave={(next) => updatePartnerField(partner.id, { nameAr: next })}
                      />
                    ) : (
                      partner.nameAr
                    )}
                    <Link to={`/partners/${partner.id}`} className="text-muted-foreground shrink-0 hover:underline" title="الملف الكامل">
                      ↗
                    </Link>
                  </div>
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    {partner.roles.map((role) => (
                      <span
                        key={role}
                        className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs"
                      >
                        {PARTNER_ROLE_LABELS[role]}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="p-3">
                  {canEdit ? (
                    <EditableSelectCell
                      value={partner.branchId}
                      options={branchOptions}
                      onSave={(next) => updatePartnerField(partner.id, { branchId: next })}
                      renderValue={branchName}
                    />
                  ) : (
                    branchName(partner.branchId)
                  )}
                </td>
                <td className="p-3">
                  {canEdit ? (
                    <EditableSelectCell
                      value={partner.status}
                      options={PARTNER_STATUS_OPTIONS}
                      onSave={(next) => updatePartnerField(partner.id, { status: next })}
                      renderValue={(status) => (
                        <StatusBadge tone={PARTNER_STATUS_TONES[status]}>{PARTNER_STATUS_LABELS[status]}</StatusBadge>
                      )}
                    />
                  ) : (
                    <StatusBadge tone={PARTNER_STATUS_TONES[partner.status]}>
                      {PARTNER_STATUS_LABELS[partner.status]}
                    </StatusBadge>
                  )}
                </td>
                <td className="text-muted-foreground p-3">
                  {canEdit ? (
                    <EditableTextCell
                      value={partner.phone ?? ''}
                      placeholder="—"
                      onSave={(next) => updatePartnerField(partner.id, { phone: next || null })}
                    />
                  ) : (
                    (partner.phone ?? '—')
                  )}
                </td>
              </tr>
            ))}
            {partners.length === 0 && (
              <tr>
                <td className="text-muted-foreground p-3" colSpan={5}>
                  لا يوجد شركاء أعمال بعد.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}

function CreatePartnerForm({
  branches,
  onCreated,
}: {
  branches: BranchSummary[];
  onCreated: () => void;
}) {
  const [nameAr, setNameAr] = useState('');
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const input: CreateBusinessPartnerInput = {
        nameAr,
        branchId,
        phone: phone || undefined,
      };
      await apiPost('/api/partners', input);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إنشاء العميل');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-border bg-card space-y-3 rounded-2xl border p-4">
      <p className="text-muted-foreground text-sm">
        إضافة سريعة — يمكن تحديد الأدوار والحالة والبيانات الكاملة من صفحة العميل بعد الإنشاء.
      </p>
      {error && <div className="text-destructive text-sm">{error}</div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <input
          required
          placeholder="الاسم"
          value={nameAr}
          onChange={(e) => setNameAr(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm sm:col-span-2"
        />
        <select
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <input
          placeholder="الهاتف (اختياري)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm sm:col-span-3"
        />
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'جارٍ الإنشاء…' : 'إنشاء العميل'}
      </Button>
    </form>
  );
}
