import { useEffect, useState } from 'react';
import type { CreateInventoryItemInput, InventoryItem, InventoryUnit, MaterialCategory, StockMovement, StockMovementType } from '@cleopatra/shared';
import { apiGet, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge, EditableTextCell, paginate, Pagination } from '@/components/cleopatra';
import { useAuth } from '@/state/AuthContext';

const PAGE_SIZE = 30;

const MOVEMENT_TYPE_LABELS: Record<StockMovementType, string> = {
  IN: 'وارد',
  OUT: 'صادر',
  ADJUSTMENT: 'تسوية',
};

const CATEGORY_LABELS: Record<MaterialCategory, string> = {
  PAPER: 'ورق',
  INK: 'حبر',
  PLATE: 'زنكات',
  FINISHING: 'تشطيب',
  CONSUMABLE: 'مستهلكات',
  // system_specifications_v2.md (2026-08-16, owner: "مخزون جاهز عندي") —
  // held-stock ready-made merchandise (stationery, external books, ...)
  // sold directly off the shelf, unlike the other 5 categories which all
  // feed a production pricing formula.
  READY_MADE: 'بضاعة جاهزة للبيع',
};

const UNIT_LABELS: Record<InventoryUnit, string> = {
  SHEET: 'فرخ',
  ROLL: 'رول',
  LINEAR_METER: 'متر طولي',
  SQUARE_METER: 'متر مربع',
  PIECE: 'قطعة',
  KILOGRAM: 'كيلو',
  LITER: 'لتر',
};

/**
 * FEATURE-007 M2 — "المخزن," a real, first-class module. Registering stock
 * happens here; auto-deduction on Order creation (M1's sheet calculation)
 * happens server-side and simply shows up as lower `quantityOnHand` the
 * next time this page loads — no separate "consumption" UI in this
 * milestone, per the plan's scope (M4 wires the order-creation form).
 */
export function InventoryPage() {
  const { can } = useAuth();
  const [items, setItems] = useState<InventoryItem[] | null>(null);
  const [needsSupplier, setNeedsSupplier] = useState<InventoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<MaterialCategory | 'ALL'>('ALL');
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [search, categoryFilter]);

  const load = () => {
    apiGet<InventoryItem[]>('/api/inventory-items')
      .then(setItems)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل المخزون'));
    apiGet<InventoryItem[]>('/api/inventory-items/needs-supplier')
      .then(setNeedsSupplier)
      .catch(() => undefined);
  };

  useEffect(load, []);

  /** FEATURE-007 (2026-08-12, owner: "عايز اقدر اتحكم في ليميت عدد الأفرخ") — `reorderLevel` was only settable at creation time; the endpoint already existed (`PUT /api/inventory-items/:id`), just no UI to reach it for an already-created item. */
  const saveReorderLevel = async (item: InventoryItem, next: string) => {
    const parsed = next.trim() === '' ? null : Number(next);
    if (parsed !== null && (Number.isNaN(parsed) || parsed < 0)) {
      throw new Error('لازم يكون رقم صحيح موجب');
    }
    await apiPut(`/api/inventory-items/${item.id}`, { reorderLevel: parsed });
    load();
  };

  const saveName = async (item: InventoryItem, next: string) => {
    await apiPut(`/api/inventory-items/${item.id}`, { name: next });
    load();
  };

  /** system_specifications_v2.md §12.5 — the catalog field POS scan-to-add reads from. */
  const saveBarcode = async (item: InventoryItem, next: string) => {
    await apiPut(`/api/inventory-items/${item.id}`, { barcode: next.trim() === '' ? null : next.trim() });
    load();
  };

  /** Retail price for a `READY_MADE` item sold directly from stock — see orderItemPricing.ts's `INVENTORY_RETAIL` kind. */
  const saveSalePrice = async (item: InventoryItem, next: string) => {
    const parsed = next.trim() === '' ? null : Number(next);
    if (parsed !== null && (Number.isNaN(parsed) || parsed < 0)) {
      throw new Error('لازم يكون رقم صحيح موجب');
    }
    await apiPut(`/api/inventory-items/${item.id}`, { salePrice: parsed });
    load();
  };

  if (error) return <div className="text-destructive">{error}</div>;

  const q = search.trim().toLowerCase();
  const filteredItems = (items ?? []).filter((item) => {
    if (categoryFilter !== 'ALL' && item.category !== categoryFilter) return false;
    if (q && !item.name.toLowerCase().includes(q) && !item.barcode?.toLowerCase().includes(q)) return false;
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const pageItems = paginate(filteredItems, page, PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">المخزن</h1>
        {can('inventory.create') && (
          <Button type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'إلغاء' : '+ تسجيل بضاعة'}
          </Button>
        )}
      </div>

      {needsSupplier.length > 0 && (
        <Card className="border-danger/40 bg-danger/5 p-4">
          <p className="text-danger mb-2 font-semibold">بضاعة ناقصة — محتاجين نجيبها من المورد</p>
          <ul className="space-y-1 text-sm">
            {needsSupplier.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3">
                <span>{item.name}</span>
                <span className="text-muted-foreground">
                  الرصيد الحالي: <span className="font-medium">{item.quantityOnHand.toLocaleString('en-US')}</span>
                  {item.reorderLevel !== null && ` (حد التنبيه: ${item.reorderLevel.toLocaleString('en-US')})`}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {showForm && (
        <NewInventoryItemForm
          onCreated={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالاسم أو الباركود…"
          className="border-input bg-background min-w-[200px] flex-1 rounded-md border px-3 py-2 text-sm"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as MaterialCategory | 'ALL')}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        >
          <option value="ALL">كل الفئات</option>
          {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {!items ? (
        <div className="text-muted-foreground">جارٍ التحميل…</div>
      ) : (
        <div className="border-border bg-card overflow-x-auto rounded-2xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border text-muted-foreground border-b text-xs *:text-start">
                <th className="p-3">الصنف</th>
                <th className="p-3">الفئة</th>
                <th className="p-3">الباركود</th>
                <th className="p-3">الرصيد الحالي</th>
                <th className="p-3">حد التنبيه</th>
                <th className="p-3">سعر البيع</th>
                <th className="p-3">الحالة</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {(() => {
                if (filteredItems.length === 0) {
                  return (
                    <tr>
                      <td className="text-muted-foreground p-3 text-center" colSpan={8}>
                        {items.length === 0 ? 'لا توجد بضاعة مسجلة بعد.' : 'لا توجد أصناف مطابقة.'}
                      </td>
                    </tr>
                  );
                }
                return pageItems.map((item) => (
                  <tr key={item.id} className="border-border border-b last:border-0">
                    <td className="p-3 font-medium">
                      {can('inventory.edit') ? (
                        <EditableTextCell value={item.name} onSave={(next) => saveName(item, next)} />
                      ) : (
                        item.name
                      )}
                    </td>
                    <td className="p-3">{CATEGORY_LABELS[item.category]}</td>
                    <td className="text-muted-foreground p-3" dir="ltr">
                      {can('inventory.edit') ? (
                        <EditableTextCell
                          value={item.barcode ?? ''}
                          placeholder="بدون باركود"
                          onSave={(next) => saveBarcode(item, next)}
                        />
                      ) : (
                        (item.barcode ?? '—')
                      )}
                    </td>
                    <td className="p-3">
                      {item.quantityOnHand.toLocaleString('en-US')} {UNIT_LABELS[item.unit]}
                    </td>
                    <td className="text-muted-foreground p-3">
                      {can('inventory.edit') ? (
                        <EditableTextCell
                          value={item.reorderLevel?.toString() ?? ''}
                          placeholder="بدون حد تنبيه"
                          onSave={(next) => saveReorderLevel(item, next)}
                        />
                      ) : (
                        (item.reorderLevel?.toLocaleString('en-US') ?? '—')
                      )}
                    </td>
                    <td className="text-muted-foreground p-3">
                      {can('inventory.edit') ? (
                        <EditableTextCell
                          value={item.salePrice?.toString() ?? ''}
                          placeholder="—"
                          onSave={(next) => saveSalePrice(item, next)}
                        />
                      ) : (
                        (item.salePrice?.toLocaleString('en-US') ?? '—')
                      )}
                    </td>
                    <td className="p-3">
                      {item.isLowStock ? (
                        <StatusBadge tone="danger">ناقصة</StatusBadge>
                      ) : (
                        <StatusBadge tone="success">متوفرة</StatusBadge>
                      )}
                    </td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => setHistoryItem(item)}
                        className="text-primary text-xs hover:underline"
                      >
                        سجل الحركة
                      </button>
                    </td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
      )}
      {items && <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />}
      {historyItem && <StockMovementHistoryDialog item={historyItem} onClose={() => setHistoryItem(null)} />}
    </div>
  );
}

/** Owner ("موظف المخزن مقدرش يجاوب 'الرصيد ده نزل امتى وليه'") — read-only history, both order-driven and manual movements already land in the same StockMovement table. */
function StockMovementHistoryDialog({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const [movements, setMovements] = useState<StockMovement[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<StockMovement[]>(`/api/inventory-items/${item.id}/movements`)
      .then(setMovements)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل سجل الحركة'));
  }, [item.id]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>سجل حركة "{item.name}"</DialogTitle>
        </DialogHeader>
        {error && <p className="text-destructive text-sm">{error}</p>}
        {!movements ? (
          <p className="text-muted-foreground text-sm">جارٍ التحميل…</p>
        ) : movements.length === 0 ? (
          <p className="text-muted-foreground text-sm">لا توجد حركة مسجلة لهذا الصنف بعد.</p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border text-muted-foreground border-b text-xs *:text-start">
                  <th className="p-2">التاريخ</th>
                  <th className="p-2">النوع</th>
                  <th className="p-2">الكمية</th>
                  <th className="p-2">مرجع</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id} className="border-border border-b last:border-0">
                    <td className="p-2">{new Date(m.date).toLocaleString('ar-EG')}</td>
                    <td className="p-2">
                      <StatusBadge tone={m.type === 'OUT' ? 'danger' : 'success'}>{MOVEMENT_TYPE_LABELS[m.type]}</StatusBadge>
                    </td>
                    <td className="p-2" dir="ltr">
                      {m.type === 'OUT' ? '-' : '+'}
                      {m.quantity.toLocaleString('en-US')} {UNIT_LABELS[item.unit]}
                    </td>
                    <td className="text-muted-foreground p-2">{m.reference ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function NewInventoryItemForm({ onCreated }: { onCreated: () => void }) {
  const [category, setCategory] = useState<MaterialCategory>('PAPER');
  const [name, setName] = useState('');
  // READY_MADE items (stationery, ...) are almost always counted by the
  // piece, not the sheet — defaulting the unit alongside the category
  // saves the "غيّر الوحدة كل مرة" friction for the owner's actual use case.
  const [unit, setUnit] = useState<InventoryUnit>('SHEET');
  const [reorderLevel, setReorderLevel] = useState('5');
  const [initialQuantity, setInitialQuantity] = useState('0');
  const [barcode, setBarcode] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const changeCategory = (next: MaterialCategory) => {
    setCategory(next);
    if (next === 'READY_MADE' && unit === 'SHEET') setUnit('PIECE');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const input: CreateInventoryItemInput = {
        category,
        name,
        unit,
        reorderLevel: reorderLevel ? Number(reorderLevel) : undefined,
        initialQuantity: initialQuantity ? Number(initialQuantity) : undefined,
        barcode: barcode.trim() || undefined,
        salePrice: salePrice ? Number(salePrice) : undefined,
      };
      await apiPost('/api/inventory-items', input);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل الصنف');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-border bg-card space-y-3 rounded-2xl border p-4">
      {error && <div className="text-destructive text-sm">{error}</div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">اسم الصنف</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={category === 'READY_MADE' ? 'مثال: دباسة مكتبية' : 'مثال: دوبلكس 200 جرام'}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">الفئة</span>
          <select
            value={category}
            onChange={(e) => changeCategory(e.target.value as MaterialCategory)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          >
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">وحدة القياس</span>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as InventoryUnit)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          >
            {Object.entries(UNIT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">الرصيد الحالي</span>
          <input
            type="number"
            min={0}
            value={initialQuantity}
            onChange={(e) => setInitialQuantity(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">حد التنبيه (اختياري)</span>
          <input
            type="number"
            min={0}
            value={reorderLevel}
            onChange={(e) => setReorderLevel(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">الباركود (اختياري)</span>
          <input
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            dir="ltr"
            placeholder="امسح باركود المورد المطبوع على العلبة"
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        {category === 'READY_MADE' && (
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">سعر البيع للقطعة</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              placeholder="مطلوب عشان يتباع من نقطة البيع"
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
        )}
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'جارٍ الحفظ…' : 'حفظ'}
      </Button>
    </form>
  );
}
