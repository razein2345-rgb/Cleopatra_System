import { useEffect, useState } from 'react';
import type { AddressType, CreatePartnerAddressInput, PartnerAddress, UpdatePartnerAddressInput } from '@cleopatra/shared';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { EditableCheckboxCell, EditableTextCell } from '@/components/cleopatra';
import { ADDRESS_TYPE_LABELS, ADDRESS_TYPE_OPTIONS } from './partnerLabels';

/** Addresses tab — FEATURE-002 Milestone 3. */
export function AddressesTab({
  partnerId,
  canManage,
}: {
  partnerId: string;
  canManage: boolean;
}) {
  const [addresses, setAddresses] = useState<PartnerAddress[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<PartnerAddress | null>(null);

  const load = () => {
    apiGet<PartnerAddress[]>(`/api/partners/${partnerId}/addresses`)
      .then(setAddresses)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'تعذر تحميل العناوين'),
      );
  };

  useEffect(load, [partnerId]);

  const setDefault = async (address: PartnerAddress) => {
    setError(null);
    try {
      await apiPut(`/api/partners/${partnerId}/addresses/${address.id}/default`, {});
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تعيين العنوان الافتراضي');
    }
  };

  const removeAddress = async (address: PartnerAddress) => {
    if (!confirm(`حذف "${address.name}"؟`)) return;
    setError(null);
    try {
      await apiDelete(`/api/partners/${partnerId}/addresses/${address.id}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف العنوان');
    }
  };

  // FEATURE-014 — inline edit for the two cleanly single-cell fields (name,
  // active status); the full address (street/city/coordinates/notes...)
  // stays in `AddressForm`.
  const updateAddressField = async (address: PartnerAddress, patch: UpdatePartnerAddressInput) => {
    const updated = await apiPut<PartnerAddress>(`/api/partners/${partnerId}/addresses/${address.id}`, patch);
    setAddresses((prev) => prev?.map((a) => (a.id === address.id ? updated : a)) ?? prev);
  };

  if (error) return <div className="text-destructive text-sm">{error}</div>;
  if (!addresses) return <div className="text-muted-foreground text-sm">جارٍ تحميل العناوين…</div>;

  return (
    <div className="space-y-4">
      {canManage && (
        <Button onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? 'إلغاء' : '+ إضافة عنوان'}
        </Button>
      )}

      {showCreate && (
        <AddressForm
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
              <th className="p-3">الاسم / النوع</th>
              <th className="p-3">الموقع</th>
              <th className="p-3">الخريطة</th>
              <th className="p-3">الحالة</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {addresses.map((address) => (
              <tr key={address.id} className="border-border border-b last:border-0 align-top">
                <td className="p-3 font-medium">
                  {canManage ? (
                    <EditableTextCell
                      value={address.name}
                      onSave={(next) => updateAddressField(address, { name: next })}
                    />
                  ) : (
                    address.name
                  )}
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className="bg-secondary rounded-full px-2 py-0.5 text-xs">
                      {ADDRESS_TYPE_LABELS[address.type]}
                    </span>
                    {address.isDefault && (
                      <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs">
                        افتراضي
                      </span>
                    )}
                  </div>
                </td>
                <td className="text-muted-foreground p-3">
                  {[
                    address.street,
                    address.building && `مبنى ${address.building}`,
                    address.floor && `الدور ${address.floor}`,
                    address.apartment && `شقة ${address.apartment}`,
                    address.district,
                    address.city,
                    address.governorate,
                    address.country,
                  ]
                    .filter(Boolean)
                    .join('، ') || '—'}
                </td>
                <td className="p-3">
                  {address.googleMapsUrl ? (
                    <a
                      href={address.googleMapsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline"
                    >
                      فتح الخريطة
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="p-3">
                  {canManage ? (
                    <div className="flex items-center gap-1.5">
                      <EditableCheckboxCell
                        value={address.isActive}
                        onSave={(next) => updateAddressField(address, { isActive: next })}
                      />
                      <span className={address.isActive ? 'text-green-600' : 'text-muted-foreground'}>
                        {address.isActive ? 'نشط' : 'غير نشط'}
                      </span>
                    </div>
                  ) : (
                    <span className={address.isActive ? 'text-green-600' : 'text-muted-foreground'}>
                      {address.isActive ? 'نشط' : 'غير نشط'}
                    </span>
                  )}
                </td>
                <td className="p-3">
                  {canManage && (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setEditing(address)}>
                        تعديل
                      </Button>
                      {!address.isDefault && address.isActive && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void setDefault(address)}
                        >
                          جعله افتراضيًا
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => void removeAddress(address)}>
                        حذف
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {addresses.length === 0 && (
              <tr>
                <td className="text-muted-foreground p-3" colSpan={5}>
                  لا توجد عناوين بعد.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <AddressForm
          partnerId={partnerId}
          address={editing}
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

function AddressForm({
  partnerId,
  address,
  onSaved,
  onCancel,
}: {
  partnerId: string;
  address?: PartnerAddress;
  onSaved: (address: PartnerAddress) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(address?.name ?? '');
  const [type, setType] = useState<AddressType>(address?.type ?? 'OFFICE');
  const [country, setCountry] = useState(address?.country ?? '');
  const [governorate, setGovernorate] = useState(address?.governorate ?? '');
  const [city, setCity] = useState(address?.city ?? '');
  const [district, setDistrict] = useState(address?.district ?? '');
  const [street, setStreet] = useState(address?.street ?? '');
  const [building, setBuilding] = useState(address?.building ?? '');
  const [floor, setFloor] = useState(address?.floor ?? '');
  const [apartment, setApartment] = useState(address?.apartment ?? '');
  const [postalCode, setPostalCode] = useState(address?.postalCode ?? '');
  const [googleMapsUrl, setGoogleMapsUrl] = useState(address?.googleMapsUrl ?? '');
  const [latitude, setLatitude] = useState(address?.latitude?.toString() ?? '');
  const [longitude, setLongitude] = useState(address?.longitude?.toString() ?? '');
  const [notes, setNotes] = useState(address?.notes ?? '');
  const [isActive, setIsActive] = useState(address?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const parseCoord = (raw: string): number | undefined => {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    const n = Number(trimmed);
    return Number.isNaN(n) ? undefined : n;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      let saved: PartnerAddress;
      if (address) {
        // Editing an existing address: an emptied field explicitly clears
        // it (null), rather than leaving the previous value untouched.
        const input: UpdatePartnerAddressInput = {
          name,
          type,
          country: country || null,
          governorate: governorate || null,
          city: city || null,
          district: district || null,
          street: street || null,
          building: building || null,
          floor: floor || null,
          apartment: apartment || null,
          postalCode: postalCode || null,
          googleMapsUrl: googleMapsUrl || null,
          latitude: parseCoord(latitude) ?? null,
          longitude: parseCoord(longitude) ?? null,
          notes: notes || null,
          isActive,
        };
        saved = await apiPut<PartnerAddress>(
          `/api/partners/${partnerId}/addresses/${address.id}`,
          input,
        );
      } else {
        // Creating: an empty field is simply omitted, not sent as null.
        const input: CreatePartnerAddressInput = {
          name,
          type,
          country: country || undefined,
          governorate: governorate || undefined,
          city: city || undefined,
          district: district || undefined,
          street: street || undefined,
          building: building || undefined,
          floor: floor || undefined,
          apartment: apartment || undefined,
          postalCode: postalCode || undefined,
          googleMapsUrl: googleMapsUrl || undefined,
          latitude: parseCoord(latitude),
          longitude: parseCoord(longitude),
          notes: notes || undefined,
        };
        saved = await apiPost<PartnerAddress>(`/api/partners/${partnerId}/addresses`, input);
      }
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ العنوان');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-border bg-card space-y-4 rounded-2xl border p-4">
      <h3 className="font-semibold">{address ? `تعديل "${address.name}"` : 'عنوان جديد'}</h3>
      {error && <div className="text-destructive text-sm">{error}</div>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">اسم العنوان</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">النوع</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as AddressType)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          >
            {ADDRESS_TYPE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">الدولة</span>
          <input
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">المحافظة</span>
          <input
            value={governorate}
            onChange={(e) => setGovernorate(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">المدينة</span>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">الحي</span>
          <input
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">الشارع</span>
          <input
            value={street}
            onChange={(e) => setStreet(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">المبنى</span>
          <input
            value={building}
            onChange={(e) => setBuilding(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">الدور</span>
          <input
            value={floor}
            onChange={(e) => setFloor(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">الشقة</span>
          <input
            value={apartment}
            onChange={(e) => setApartment(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">الرمز البريدي</span>
          <input
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">رابط خرائط جوجل</span>
          <input
            type="url"
            value={googleMapsUrl}
            onChange={(e) => setGoogleMapsUrl(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">خط العرض</span>
          <input
            value={latitude}
            onChange={(e) => setLatitude(e.target.value)}
            inputMode="decimal"
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">خط الطول</span>
          <input
            value={longitude}
            onChange={(e) => setLongitude(e.target.value)}
            inputMode="decimal"
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
      </div>

      {address && (
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          نشط
          {address.isDefault && isActive === false && (
            <span className="text-muted-foreground">
              (تعطيله يلغي كونه العنوان الافتراضي)
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
