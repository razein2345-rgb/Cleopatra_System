import { useEffect, useState } from 'react';
import type { BranchSummary, Campaign, CampaignChannel, CampaignStatus, CreateCampaignInput, UpdateCampaignInput } from '@cleopatra/shared';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { EditableNumberCell, EditableSelectCell, EditableTextCell, StatusBadge, useConfirm, type StatusTone } from '@/components/cleopatra';
import { useAuth } from '@/state/AuthContext';

const CHANNEL_LABELS: Record<CampaignChannel, string> = {
  SOCIAL_MEDIA: 'سوشيال ميديا',
  GOOGLE_ADS: 'إعلانات جوجل',
  SMS: 'رسائل SMS',
  EMAIL: 'إيميل',
  PRINT: 'مطبوعات',
  EVENT: 'فعالية',
  OTHER: 'تانية',
};
const STATUS_LABELS: Record<CampaignStatus, string> = {
  DRAFT: 'مسودة',
  ACTIVE: 'شغالة',
  PAUSED: 'متوقفة مؤقتًا',
  ENDED: 'انتهت',
};
const STATUS_TONES: Record<CampaignStatus, StatusTone> = {
  DRAFT: 'neutral',
  ACTIVE: 'success',
  PAUSED: 'warning',
  ENDED: 'neutral',
};
const CHANNEL_OPTIONS = Object.entries(CHANNEL_LABELS) as [CampaignChannel, string][];
const STATUS_OPTIONS = Object.entries(STATUS_LABELS) as [CampaignStatus, string][];

const money = (n: number | null) => (n === null ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: 2 }));

/**
 * Owner (2026-09-09, "المرحلة الخامسة" → "كمل في الأسرع فيهم") — Phase 5's
 * Campaign Management piece (system_specifications_v2.md §10.1: Campaigns/
 * Budget/Leads/Cost per Lead/Quotes/Orders/Revenue/ROI). v1 tracks these
 * numbers manually (no `Lead.campaignId` join yet — a bigger change than
 * "the faster one" calls for) — cost-per-lead and ROI are derived here,
 * client-side, never stored.
 */
export function CampaignsPage() {
  const { can } = useAuth();
  const confirm = useConfirm();
  const canEdit = can('campaigns.edit');
  const canCreate = can('campaigns.create');
  const canDelete = can('campaigns.delete');

  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = () => {
    apiGet<Campaign[]>('/api/campaigns')
      .then(setCampaigns)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل الحملات'));
  };

  useEffect(load, []);
  useEffect(() => {
    apiGet<BranchSummary[]>('/api/branches').then(setBranches).catch(() => undefined);
  }, []);

  const updateCampaignField = async (id: string, patch: UpdateCampaignInput) => {
    const updated = await apiPut<Campaign>(`/api/campaigns/${id}`, patch);
    setCampaigns((prev) => prev?.map((c) => (c.id === id ? updated : c)) ?? prev);
  };

  const remove = async (campaign: Campaign) => {
    if (!(await confirm({ title: `حذف حملة "${campaign.name}"؟`, destructive: true }))) return;
    setError(null);
    try {
      await apiDelete(`/api/campaigns/${campaign.id}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر الحذف');
    }
  };

  const branchName = (id: string | null) => (id ? (branches.find((b) => b.id === id)?.name ?? '—') : 'الشركة كلها');

  if (error && !campaigns) return <div className="text-destructive">{error}</div>;
  if (!campaigns) return <div className="text-muted-foreground">جارٍ التحميل…</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">الحملات التسويقية</h1>
          <p className="text-muted-foreground text-xs">
            متابعة الميزانية والأداء لكل حملة — الأرقام بتتسجل يدويًا في النسخة دي.
          </p>
        </div>
        {canCreate && <Button onClick={() => setShowCreate((v) => !v)}>{showCreate ? 'إلغاء' : '+ حملة جديدة'}</Button>}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {showCreate && (
        <CreateCampaignForm
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
              <th className="p-3">القناة</th>
              <th className="p-3">الحالة</th>
              <th className="p-3">الميزانية</th>
              <th className="p-3">Leads</th>
              <th className="p-3">عروض أسعار</th>
              <th className="p-3">أوردرات</th>
              <th className="p-3">الإيراد</th>
              <th className="p-3">تكلفة اللييد</th>
              <th className="p-3">ROI</th>
              <th className="p-3">الفرع</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => {
              const costPerLead = c.budget != null && c.leadsGenerated ? c.budget / c.leadsGenerated : null;
              const roi = c.budget != null && c.budget > 0 && c.revenue != null ? ((c.revenue - c.budget) / c.budget) * 100 : null;
              return (
                <tr key={c.id} className="border-border border-b last:border-0">
                  <td className="p-3 font-medium">
                    {canEdit ? <EditableTextCell value={c.name} onSave={(v) => updateCampaignField(c.id, { name: v })} /> : c.name}
                  </td>
                  <td className="p-3">
                    {canEdit ? (
                      <EditableSelectCell
                        value={c.channel}
                        options={CHANNEL_OPTIONS}
                        onSave={(v) => updateCampaignField(c.id, { channel: v })}
                        renderValue={(v) => CHANNEL_LABELS[v]}
                      />
                    ) : (
                      CHANNEL_LABELS[c.channel]
                    )}
                  </td>
                  <td className="p-3">
                    {canEdit ? (
                      <EditableSelectCell
                        value={c.status}
                        options={STATUS_OPTIONS}
                        onSave={(v) => updateCampaignField(c.id, { status: v })}
                        renderValue={(v) => <StatusBadge tone={STATUS_TONES[v]}>{STATUS_LABELS[v]}</StatusBadge>}
                      />
                    ) : (
                      <StatusBadge tone={STATUS_TONES[c.status]}>{STATUS_LABELS[c.status]}</StatusBadge>
                    )}
                  </td>
                  <td className="p-3" dir="ltr">
                    {canEdit ? (
                      <EditableNumberCell value={c.budget} min={0} step={0.01} onSave={(v) => updateCampaignField(c.id, { budget: v })} />
                    ) : (
                      money(c.budget)
                    )}
                  </td>
                  <td className="p-3" dir="ltr">
                    {canEdit ? (
                      <EditableNumberCell
                        value={c.leadsGenerated}
                        min={0}
                        onSave={(v) => updateCampaignField(c.id, { leadsGenerated: v })}
                      />
                    ) : (
                      (c.leadsGenerated ?? '—')
                    )}
                  </td>
                  <td className="p-3" dir="ltr">
                    {canEdit ? (
                      <EditableNumberCell
                        value={c.quotesGenerated}
                        min={0}
                        onSave={(v) => updateCampaignField(c.id, { quotesGenerated: v })}
                      />
                    ) : (
                      (c.quotesGenerated ?? '—')
                    )}
                  </td>
                  <td className="p-3" dir="ltr">
                    {canEdit ? (
                      <EditableNumberCell
                        value={c.ordersGenerated}
                        min={0}
                        onSave={(v) => updateCampaignField(c.id, { ordersGenerated: v })}
                      />
                    ) : (
                      (c.ordersGenerated ?? '—')
                    )}
                  </td>
                  <td className="p-3" dir="ltr">
                    {canEdit ? (
                      <EditableNumberCell value={c.revenue} min={0} step={0.01} onSave={(v) => updateCampaignField(c.id, { revenue: v })} />
                    ) : (
                      money(c.revenue)
                    )}
                  </td>
                  <td className="text-muted-foreground p-3" dir="ltr">
                    {costPerLead !== null ? costPerLead.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}
                  </td>
                  <td className={`p-3 font-medium ${roi !== null && roi < 0 ? 'text-destructive' : roi !== null ? 'text-success' : 'text-muted-foreground'}`} dir="ltr">
                    {roi !== null ? `${roi.toLocaleString('en-US', { maximumFractionDigits: 1 })}%` : '—'}
                  </td>
                  <td className="text-muted-foreground p-3">{branchName(c.branchId)}</td>
                  <td className="p-3">
                    {canDelete && (
                      <button type="button" onClick={() => void remove(c)} className="text-destructive text-xs hover:underline">
                        حذف
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {campaigns.length === 0 && (
              <tr>
                <td className="text-muted-foreground p-3" colSpan={12}>
                  لا توجد حملات مسجّلة بعد.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreateCampaignForm({ branches, onCreated }: { branches: BranchSummary[]; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [channel, setChannel] = useState<CampaignChannel>('SOCIAL_MEDIA');
  const [budget, setBudget] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [branchId, setBranchId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const input: CreateCampaignInput = {
        name,
        channel,
        budget: budget ? Number(budget) : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        branchId: branchId || undefined,
        notes: notes.trim() || undefined,
      };
      await apiPost('/api/campaigns', input);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إضافة الحملة');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-border bg-card space-y-3 rounded-2xl border p-4">
      {error && <div className="text-destructive text-sm">{error}</div>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          required
          placeholder="اسم الحملة"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
        <select value={channel} onChange={(e) => setChannel(e.target.value as CampaignChannel)} className="border-input bg-background rounded-md border px-3 py-2 text-sm">
          {CHANNEL_OPTIONS.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <input
          type="number"
          min={0}
          step="0.01"
          dir="ltr"
          placeholder="الميزانية"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">تاريخ البداية</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">تاريخ النهاية</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        {branches.length > 1 && (
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="border-input bg-background rounded-md border px-3 py-2 text-sm">
            <option value="">الشركة كلها</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">ملاحظات (اختياري)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
        />
      </label>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'جارٍ الحفظ…' : 'حفظ'}
      </Button>
    </form>
  );
}
