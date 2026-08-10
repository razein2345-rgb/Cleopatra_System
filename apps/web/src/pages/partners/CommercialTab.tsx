import { useEffect, useState } from 'react';
import type {
  PartnerCommercialProfile,
  PartnerCommercialStatus,
  PartnerRiskLevel,
  PaymentMethod,
  UpsertPartnerCommercialProfileInput,
} from '@cleopatra/shared';
import { apiGet, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  COMMERCIAL_STATUS_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  RISK_LEVEL_OPTIONS,
} from './partnerLabels';

/** Commercial & Credit Profile tab — FEATURE-002 Milestone 6. */
export function CommercialTab({ partnerId, canManage }: { partnerId: string; canManage: boolean }) {
  const [profile, setProfile] = useState<PartnerCommercialProfile | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    apiGet<PartnerCommercialProfile | null>(`/api/partners/${partnerId}/commercial-profile`)
      .then(setProfile)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Failed to load commercial profile'),
      );
  };

  useEffect(load, [partnerId]);

  if (error) return <div className="text-destructive text-sm">{error}</div>;
  if (profile === undefined) {
    return <div className="text-muted-foreground text-sm">Loading commercial profile…</div>;
  }

  return (
    <CommercialForm
      partnerId={partnerId}
      profile={profile}
      canManage={canManage}
      onSaved={setProfile}
    />
  );
}

function CommercialForm({
  partnerId,
  profile,
  canManage,
  onSaved,
}: {
  partnerId: string;
  profile: PartnerCommercialProfile | null;
  canManage: boolean;
  onSaved: (profile: PartnerCommercialProfile) => void;
}) {
  const [creditLimit, setCreditLimit] = useState(profile?.creditLimit?.toString() ?? '');
  const [paymentTermsDays, setPaymentTermsDays] = useState(
    profile?.paymentTermsDays?.toString() ?? '',
  );
  const [preferredPaymentMethod, setPreferredPaymentMethod] = useState<PaymentMethod | ''>(
    profile?.preferredPaymentMethod ?? '',
  );
  const [priceTier, setPriceTier] = useState(profile?.priceTier ?? '');
  const [status, setStatus] = useState<PartnerCommercialStatus>(profile?.status ?? 'ACTIVE');
  const [riskLevel, setRiskLevel] = useState<PartnerRiskLevel | ''>(profile?.riskLevel ?? '');
  const [preferredCurrency, setPreferredCurrency] = useState(profile?.preferredCurrency ?? '');
  const [internalNotes, setInternalNotes] = useState(profile?.internalNotes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const input: UpsertPartnerCommercialProfileInput = {
        creditLimit: creditLimit === '' ? null : Number(creditLimit),
        paymentTermsDays: paymentTermsDays === '' ? null : Number(paymentTermsDays),
        preferredPaymentMethod: preferredPaymentMethod || null,
        priceTier: priceTier || null,
        status,
        riskLevel: riskLevel || null,
        preferredCurrency: preferredCurrency || null,
        internalNotes: internalNotes || null,
      };
      const saved = await apiPut<PartnerCommercialProfile>(
        `/api/partners/${partnerId}/commercial-profile`,
        input,
      );
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save commercial profile');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-border bg-card space-y-4 rounded-2xl border p-4">
      <div>
        <h2 className="font-semibold">Commercial &amp; Credit Profile</h2>
        {!profile && (
          <p className="text-muted-foreground mt-1 text-sm">
            No commercial profile has been set up for this partner yet.
          </p>
        )}
      </div>
      {error && <div className="text-destructive text-sm">{error}</div>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Credit limit</span>
          <input
            type="number"
            min={0}
            step="0.01"
            disabled={!canManage}
            value={creditLimit}
            onChange={(e) => setCreditLimit(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Payment terms (days)</span>
          <input
            type="number"
            min={0}
            max={365}
            disabled={!canManage}
            value={paymentTermsDays}
            onChange={(e) => setPaymentTermsDays(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Preferred payment method</span>
          <select
            disabled={!canManage}
            value={preferredPaymentMethod}
            onChange={(e) => setPreferredPaymentMethod(e.target.value as typeof preferredPaymentMethod)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
          >
            <option value="">— unspecified —</option>
            {PAYMENT_METHOD_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Price tier / commercial classification</span>
          <input
            disabled={!canManage}
            value={priceTier}
            onChange={(e) => setPriceTier(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Account status</span>
          <select
            disabled={!canManage}
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
          >
            {COMMERCIAL_STATUS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Risk level</span>
          <select
            disabled={!canManage}
            value={riskLevel}
            onChange={(e) => setRiskLevel(e.target.value as typeof riskLevel)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
          >
            <option value="">— unspecified —</option>
            {RISK_LEVEL_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Preferred currency (future-ready)</span>
          <input
            disabled={!canManage}
            value={preferredCurrency}
            onChange={(e) => setPreferredCurrency(e.target.value)}
            placeholder="e.g. EGP"
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
          />
        </label>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">Internal commercial notes</span>
        <textarea
          disabled={!canManage}
          value={internalNotes}
          onChange={(e) => setInternalNotes(e.target.value)}
          rows={3}
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
        />
      </label>

      {canManage && (
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save commercial profile'}
        </Button>
      )}
    </form>
  );
}
