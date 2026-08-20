import { useEffect, useState } from 'react';
import type {
  CreateWorkflowStageInput,
  CreateWorkflowTemplateInput,
  Department,
  ProductionTrack,
  UpdateWorkflowTemplateInput,
  User,
  WorkflowStageType,
  WorkflowTemplate,
  WorkflowVariableDataType,
} from '@cleopatra/shared';
import { PRODUCTION_TRACK_LABELS } from '@cleopatra/shared';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Combobox, StatusBadge, useConfirm } from '@/components/cleopatra';
import { useAuth } from '@/state/AuthContext';

const STAGE_TYPE_LABELS: Record<WorkflowStageType, string> = { INTERNAL: 'داخلية', EXTERNAL: 'خارجية' };
const VARIABLE_TYPE_LABELS: Record<WorkflowVariableDataType, string> = {
  TEXT: 'نص',
  NUMBER: 'رقم',
  BOOLEAN: 'نعم/لا',
  DATE: 'تاريخ',
  SELECT: 'اختيار من قائمة',
};

interface DraftVariable {
  key: string;
  label: string;
  dataType: WorkflowVariableDataType;
  selectOptions: string; // comma-separated in the editor, split on save
  isRequired: boolean;
}

interface DraftStage {
  tempKey: string; // an existing stage's real id when editing, "new-<n>" when freshly added
  name: string;
  stageType: WorkflowStageType;
  departmentId: string;
  defaultAssignedEmployeeId: string;
  estimatedDurationMinutes: string;
  requiresFiles: boolean;
  requiresApproval: boolean;
  requiresCostEntry: boolean;
  requiresTimeTracking: boolean;
  isMandatory: boolean;
  canSkip: boolean;
  nextStageTempKey: string;
  failureStageTempKey: string;
  internalVisible: boolean;
  customerVisible: boolean;
  variables: DraftVariable[];
}

let newStageCounter = 0;
function emptyStage(): DraftStage {
  newStageCounter += 1;
  return {
    tempKey: `new-${Date.now()}-${newStageCounter}`,
    name: '',
    stageType: 'INTERNAL',
    departmentId: '',
    defaultAssignedEmployeeId: '',
    estimatedDurationMinutes: '',
    requiresFiles: false,
    requiresApproval: false,
    requiresCostEntry: false,
    requiresTimeTracking: false,
    isMandatory: true,
    canSkip: false,
    nextStageTempKey: '',
    failureStageTempKey: '',
    internalVisible: true,
    customerVisible: false,
    variables: [],
  };
}

function stagesFromTemplate(template: WorkflowTemplate): DraftStage[] {
  return template.stages.map((s) => ({
    tempKey: s.id,
    name: s.name,
    stageType: s.stageType,
    departmentId: s.departmentId ?? '',
    defaultAssignedEmployeeId: s.defaultAssignedEmployeeId ?? '',
    estimatedDurationMinutes: s.estimatedDurationMinutes != null ? String(s.estimatedDurationMinutes) : '',
    requiresFiles: s.requiresFiles,
    requiresApproval: s.requiresApproval,
    requiresCostEntry: s.requiresCostEntry,
    requiresTimeTracking: s.requiresTimeTracking,
    isMandatory: s.isMandatory,
    canSkip: s.canSkip,
    nextStageTempKey: s.nextStageId ?? '',
    failureStageTempKey: s.failureStageId ?? '',
    internalVisible: s.internalVisible,
    customerVisible: s.customerVisible,
    variables: s.variables.map((v) => ({
      key: v.key,
      label: v.label,
      dataType: v.dataType,
      selectOptions: (v.selectOptions ?? []).join('، '),
      isRequired: v.isRequired,
    })),
  }));
}

const ALL_TRACKS = Object.keys(PRODUCTION_TRACK_LABELS) as ProductionTrack[];

/**
 * Owner (2026-08-20, "قسم إدارة قوالب الـWorkflow") — the "التراجع/إعادة
 * العمل" capability (`failureStageId`) has been fully built and working in
 * the engine since FEATURE-004, and is actually wired for one real stage
 * ("موافقة العميل" in the Offset/Digital templates) — but only by a
 * one-off script, because no screen ever existed to add it to any other
 * stage. This is that screen: full CRUD over `WorkflowTemplate`/
 * `WorkflowStage` (already a complete, tested backend — see
 * `workflowTemplateService.ts`), so an admin can wire the same "رجوع
 * لمرحلة سابقة عند الرفض" pattern into any stage of any track, not just
 * the one it was manually patched onto.
 */
export function WorkflowTemplatesPage() {
  const { can } = useAuth();
  const confirm = useConfirm();
  const canManage = can('workflow-templates.edit') || can('workflow-templates.create');

  const [templates, setTemplates] = useState<WorkflowTemplate[] | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ mode: 'create' } | { mode: 'edit'; template: WorkflowTemplate } | null>(null);
  const [viewing, setViewing] = useState<WorkflowTemplate | null>(null);

  const load = () => {
    apiGet<WorkflowTemplate[]>('/api/workflow-templates')
      .then(setTemplates)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل قوالب سير العمل'));
  };

  useEffect(load, []);
  useEffect(() => {
    apiGet<Department[]>('/api/departments').then(setDepartments).catch(() => undefined);
    apiGet<User[]>('/api/users').then(setUsers).catch(() => undefined);
  }, []);

  const publish = async (template: WorkflowTemplate) => {
    if (!(await confirm({ title: `نشر "${template.name}" (نسخة ${template.version})؟`, description: 'بعد النشر، النسخة دي مش هتتعدل تاني — أي تعديل بعد كده يحتاج نسخة جديدة.' }))) return;
    setError(null);
    try {
      await apiPost(`/api/workflow-templates/${template.id}/publish`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر النشر');
    }
  };

  const createVersion = async (template: WorkflowTemplate) => {
    setError(null);
    try {
      const created = await apiPost<WorkflowTemplate>(`/api/workflow-templates/${template.id}/versions`);
      load();
      setEditing({ mode: 'edit', template: created });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إنشاء نسخة جديدة');
    }
  };

  const remove = async (template: WorkflowTemplate) => {
    if (!(await confirm({ title: `حذف "${template.name}" (نسخة ${template.version})؟`, destructive: true }))) return;
    setError(null);
    try {
      await apiDelete(`/api/workflow-templates/${template.id}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر الحذف');
    }
  };

  if (editing) {
    return (
      <TemplateEditor
        initial={editing.mode === 'edit' ? editing.template : null}
        departments={departments}
        users={users}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    );
  }

  if (viewing) {
    return <TemplateViewer template={viewing} departments={departments} users={users} onClose={() => setViewing(null)} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">قوالب سير العمل (Workflow)</h1>
          <p className="text-muted-foreground text-sm">
            كل مسار إنتاجي (أوفست، ديجيتال، لوحات...) بياخد قالبه المنشور الأحدث لحظة إنشاء أمر الشغل — تعديل قالب منشور
            محتاج نسخة جديدة، النسخة القديمة تفضل شغالة على أوامر الشغل الحالية.
          </p>
        </div>
        {canManage && <Button onClick={() => setEditing({ mode: 'create' })}>+ قالب جديد</Button>}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {!templates ? (
        <p className="text-muted-foreground text-sm">جارٍ التحميل…</p>
      ) : templates.length === 0 ? (
        <p className="text-muted-foreground text-sm">لا توجد قوالب بعد.</p>
      ) : (
        <div className="border-border overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border text-muted-foreground border-b text-xs *:text-start">
                <th className="p-2">الكود</th>
                <th className="p-2">الاسم</th>
                <th className="p-2">النسخة</th>
                <th className="p-2">الحالة</th>
                <th className="p-2">عدد المراحل</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-border border-b last:border-0">
                  <td className="p-2 font-mono text-xs">{t.code}</td>
                  <td className="p-2 font-medium">{t.name}</td>
                  <td className="p-2" dir="ltr">
                    {t.version}
                  </td>
                  <td className="p-2">
                    <StatusBadge tone={t.publishedAt ? 'success' : 'warning'}>{t.publishedAt ? 'منشور' : 'مسودة'}</StatusBadge>
                  </td>
                  <td className="p-2">{t.stages.length}</td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-2">
                      {t.publishedAt ? (
                        <button type="button" onClick={() => setViewing(t)} className="text-primary text-xs hover:underline">
                          عرض
                        </button>
                      ) : (
                        canManage && (
                          <button type="button" onClick={() => setEditing({ mode: 'edit', template: t })} className="text-primary text-xs hover:underline">
                            تعديل
                          </button>
                        )
                      )}
                      {!t.publishedAt && can('workflow-templates.publish') && (
                        <button type="button" onClick={() => void publish(t)} className="text-success text-xs hover:underline">
                          نشر
                        </button>
                      )}
                      {t.publishedAt && !t.nextVersionExists && canManage && (
                        <button type="button" onClick={() => void createVersion(t)} className="text-primary text-xs hover:underline">
                          نسخة جديدة
                        </button>
                      )}
                      {can('workflow-templates.delete') && (
                        <button type="button" onClick={() => void remove(t)} className="text-destructive text-xs hover:underline">
                          حذف
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Read-only stage list for a published version — no edit controls, just enough to see the graph (كل مرحلة وبعديها إيه). */
function TemplateViewer({
  template,
  departments,
  users,
  onClose,
}: {
  template: WorkflowTemplate;
  departments: Department[];
  users: User[];
  onClose: () => void;
}) {
  const stageName = (id: string | null) => template.stages.find((s) => s.id === id)?.name ?? '—';
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {template.name} <span className="text-muted-foreground text-base font-normal">(نسخة {template.version} — منشور)</span>
          </h1>
          <p className="text-muted-foreground text-sm">{template.description || '—'}</p>
        </div>
        <Button variant="secondary" onClick={onClose}>
          رجوع
        </Button>
      </div>
      <div className="space-y-2">
        {template.stages.map((s) => (
          <div key={s.id} className="border-border bg-card space-y-1 rounded-xl border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{s.order}. {s.name}</span>
              <StatusBadge tone="info">{STAGE_TYPE_LABELS[s.stageType]}</StatusBadge>
              {s.requiresApproval && <StatusBadge tone="warning">بوابة موافقة</StatusBadge>}
              {!s.isMandatory && <StatusBadge tone="neutral">اختيارية</StatusBadge>}
            </div>
            <p className="text-muted-foreground text-xs">
              القسم: {departments.find((d) => d.id === s.departmentId)?.name ?? '—'} — المسؤول الافتراضي:{' '}
              {users.find((u) => u.id === s.defaultAssignedEmployeeId)?.name ?? '—'}
            </p>
            <p className="text-muted-foreground text-xs">
              التالي عند النجاح: {stageName(s.nextStageId)} — عند الرفض/الفشل: {stageName(s.failureStageId)}
            </p>
            {s.variables.length > 0 && (
              <p className="text-muted-foreground text-xs">المتغيرات: {s.variables.map((v) => v.label).join('، ')}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TemplateEditor({
  initial,
  departments,
  users,
  onClose,
  onSaved,
}: {
  initial: WorkflowTemplate | null;
  departments: Department[];
  users: User[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState<ProductionTrack | ''>((initial?.code as ProductionTrack) ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [stages, setStages] = useState<DraftStage[]>(initial ? stagesFromTemplate(initial) : [emptyStage()]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const updateStage = (index: number, patch: Partial<DraftStage>) => {
    setStages((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const moveStage = (index: number, dir: -1 | 1) => {
    setStages((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  };

  const removeStage = (index: number) => {
    setStages((prev) => {
      const removedKey = prev[index]!.tempKey;
      return prev
        .filter((_, i) => i !== index)
        .map((s) => ({
          ...s,
          nextStageTempKey: s.nextStageTempKey === removedKey ? '' : s.nextStageTempKey,
          failureStageTempKey: s.failureStageTempKey === removedKey ? '' : s.failureStageTempKey,
        }));
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (stages.length === 0) {
      setError('لازم مرحلة واحدة على الأقل');
      return;
    }
    if (stages.some((s) => !s.name.trim())) {
      setError('كل مرحلة لازم يكون ليها اسم');
      return;
    }

    const stagesPayload: CreateWorkflowStageInput[] = stages.map((s, idx) => ({
      tempKey: s.tempKey,
      order: idx + 1,
      name: s.name.trim(),
      stageType: s.stageType,
      departmentId: s.departmentId || undefined,
      defaultAssignedEmployeeId: s.defaultAssignedEmployeeId || undefined,
      estimatedDurationMinutes: s.estimatedDurationMinutes ? Number(s.estimatedDurationMinutes) : undefined,
      requiresFiles: s.requiresFiles,
      requiresApproval: s.requiresApproval,
      requiresCostEntry: s.requiresCostEntry,
      requiresTimeTracking: s.requiresTimeTracking,
      isMandatory: s.isMandatory,
      canSkip: s.canSkip,
      nextStageTempKey: s.nextStageTempKey || undefined,
      failureStageTempKey: s.failureStageTempKey || undefined,
      internalVisible: s.internalVisible,
      customerVisible: s.customerVisible,
      variables: s.variables
        .filter((v) => v.key.trim() && v.label.trim())
        .map((v, vi) => ({
          key: v.key.trim(),
          label: v.label.trim(),
          dataType: v.dataType,
          selectOptions:
            v.dataType === 'SELECT'
              ? v.selectOptions
                  .split(/[,،]/)
                  .map((x) => x.trim())
                  .filter(Boolean)
              : undefined,
          isRequired: v.isRequired,
          order: vi,
        })),
    }));

    setSubmitting(true);
    try {
      if (initial) {
        const input: UpdateWorkflowTemplateInput = { name: name.trim(), description: description.trim() || null, stages: stagesPayload };
        await apiPut(`/api/workflow-templates/${initial.id}`, input);
      } else {
        if (!code) {
          setError('اختار المسار الإنتاجي (الكود)');
          setSubmitting(false);
          return;
        }
        const input: CreateWorkflowTemplateInput = { code, name: name.trim(), description: description.trim() || undefined, stages: stagesPayload };
        await apiPost('/api/workflow-templates', input);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر الحفظ');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{initial ? `تعديل — ${initial.name} (نسخة ${initial.version}، مسودة)` : 'قالب سير عمل جديد'}</h1>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'جارٍ الحفظ…' : 'حفظ كمسودة'}
          </Button>
        </div>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="border-border bg-card grid grid-cols-1 gap-3 rounded-2xl border p-4 sm:grid-cols-3">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">الكود (المسار الإنتاجي)</span>
          {initial ? (
            <input disabled value={initial.code} className="border-input bg-muted/40 text-muted-foreground w-full rounded-md border px-3 py-2 text-sm" />
          ) : (
            <select
              required
              value={code}
              onChange={(e) => setCode(e.target.value as ProductionTrack)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="">— اختر —</option>
              {ALL_TRACKS.map((t) => (
                <option key={t} value={t}>
                  {PRODUCTION_TRACK_LABELS[t]} ({t})
                </option>
              ))}
            </select>
          )}
        </label>
        <label className="space-y-1 text-sm sm:col-span-2">
          <span className="text-muted-foreground">اسم القالب</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm sm:col-span-3">
          <span className="text-muted-foreground">وصف مختصر (اختياري)</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="مثال: التصميم (اختياري) ← تجهيز زنك ← طباعة ← ترقيم ← تقفيل ← تسليم"
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="space-y-3">
        {stages.map((stage, index) => {
          const otherStages = stages.filter((_, i) => i !== index);
          return (
            <div key={stage.tempKey} className="border-border bg-card space-y-3 rounded-2xl border p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-sm font-semibold">المرحلة {index + 1}</span>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => moveStage(index, -1)} disabled={index === 0}>
                    ↑
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => moveStage(index, 1)} disabled={index === stages.length - 1}>
                    ↓
                  </Button>
                  {stages.length > 1 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeStage(index)}>
                      حذف المرحلة
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                <label className="space-y-1 text-sm sm:col-span-2">
                  <span className="text-muted-foreground">اسم المرحلة</span>
                  <input
                    required
                    value={stage.name}
                    onChange={(e) => updateStage(index, { name: e.target.value })}
                    className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">النوع</span>
                  <select
                    value={stage.stageType}
                    onChange={(e) => updateStage(index, { stageType: e.target.value as WorkflowStageType })}
                    className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                  >
                    {(Object.keys(STAGE_TYPE_LABELS) as WorkflowStageType[]).map((t) => (
                      <option key={t} value={t}>
                        {STAGE_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">مدة تقديرية (دقيقة)</span>
                  <input
                    type="number"
                    min={1}
                    value={stage.estimatedDurationMinutes}
                    onChange={(e) => updateStage(index, { estimatedDurationMinutes: e.target.value })}
                    className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                  />
                </label>
                <label className="space-y-1 text-sm sm:col-span-2">
                  <span className="text-muted-foreground">القسم المسؤول</span>
                  <Combobox
                    items={[{ id: '', name: '— بدون —' }, ...departments]}
                    value={stage.departmentId}
                    getKey={(d) => d.id}
                    getLabel={(d) => d.name}
                    onChange={(d) => updateStage(index, { departmentId: d.id })}
                    placeholder="— بدون —"
                    searchPlaceholder="اكتب اسم القسم…"
                  />
                </label>
                <label className="space-y-1 text-sm sm:col-span-2">
                  <span className="text-muted-foreground">المسؤول الافتراضي (اختياري)</span>
                  <Combobox
                    items={[{ id: '', name: '— بدون —' }, ...users]}
                    value={stage.defaultAssignedEmployeeId}
                    getKey={(u) => u.id}
                    getLabel={(u) => u.name}
                    onChange={(u) => updateStage(index, { defaultAssignedEmployeeId: u.id })}
                    placeholder="— بدون —"
                    searchPlaceholder="اكتب اسم الموظف…"
                  />
                </label>
                <label className="space-y-1 text-sm sm:col-span-2">
                  <span className="text-muted-foreground">المرحلة التالية عند النجاح</span>
                  <select
                    value={stage.nextStageTempKey}
                    onChange={(e) => updateStage(index, { nextStageTempKey: e.target.value })}
                    className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                  >
                    <option value="">— آخر مرحلة (يقفل أمر الشغل) —</option>
                    {otherStages.map((s) => (
                      <option key={s.tempKey} value={s.tempKey}>
                        {s.name || '(بدون اسم)'}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm sm:col-span-2">
                  <span className="text-muted-foreground">مرحلة الرجوع عند الرفض/الفشل (التراجع)</span>
                  <select
                    value={stage.failureStageTempKey}
                    onChange={(e) => updateStage(index, { failureStageTempKey: e.target.value })}
                    className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                  >
                    <option value="">— بدون (مفيش تراجع من هنا) —</option>
                    {otherStages.map((s) => (
                      <option key={s.tempKey} value={s.tempKey}>
                        {s.name || '(بدون اسم)'}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                {(
                  [
                    ['requiresFiles', 'محتاجة ملفات مرفقة'],
                    ['requiresApproval', 'بوابة موافقة (العميل/المسؤول لازم يوافق قبل ما تتقدم)'],
                    ['requiresCostEntry', 'محتاجة تسجيل تكلفة'],
                    ['requiresTimeTracking', 'محتاجة تسجيل وقت'],
                    ['isMandatory', 'إجبارية'],
                    ['canSkip', 'ممكن تتخطى'],
                    ['internalVisible', 'ظاهرة للموظفين'],
                    ['customerVisible', 'ظاهرة للعميل'],
                  ] as [keyof DraftStage, string][]
                ).map(([field, label]) => (
                  <label key={field} className="flex items-center gap-1.5">
                    <Checkbox
                      checked={stage[field] as boolean}
                      onCheckedChange={(v) => updateStage(index, { [field]: v === true } as Partial<DraftStage>)}
                    />
                    {label}
                  </label>
                ))}
              </div>

              <StageVariablesEditor
                variables={stage.variables}
                onChange={(variables) => updateStage(index, { variables })}
              />
            </div>
          );
        })}

        <Button type="button" variant="secondary" onClick={() => setStages((prev) => [...prev, emptyStage()])}>
          + أضف مرحلة
        </Button>
      </div>
    </form>
  );
}

/** Per-stage custom data fields (زي "نص/بيانات العميل على المنتج" في مسار المنتجات الأخرى) — free-form key/label/type list, matches `CreateWorkflowStageVariableInput` exactly. */
function StageVariablesEditor({ variables, onChange }: { variables: DraftVariable[]; onChange: (next: DraftVariable[]) => void }) {
  const update = (index: number, patch: Partial<DraftVariable>) => {
    onChange(variables.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  };
  const remove = (index: number) => onChange(variables.filter((_, i) => i !== index));
  const add = () => onChange([...variables, { key: '', label: '', dataType: 'TEXT', selectOptions: '', isRequired: false }]);

  return (
    <div className="space-y-2 border-t pt-3">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs">متغيرات مخصصة لهذه المرحلة (اختياري — مثال: نص يكتبه الموظف وقت التنفيذ)</span>
        <Button type="button" variant="ghost" size="sm" onClick={add}>
          + متغير
        </Button>
      </div>
      {variables.map((v, i) => (
        <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <input
            value={v.key}
            onChange={(e) => update(i, { key: e.target.value })}
            placeholder="key (إنجليزي، مثال: customer_text)"
            dir="ltr"
            className="border-input bg-background rounded-md border px-2 py-1 text-xs"
          />
          <input
            value={v.label}
            onChange={(e) => update(i, { label: e.target.value })}
            placeholder="اسم المتغير المعروض"
            className="border-input bg-background rounded-md border px-2 py-1 text-xs"
          />
          <select
            value={v.dataType}
            onChange={(e) => update(i, { dataType: e.target.value as WorkflowVariableDataType })}
            className="border-input bg-background rounded-md border px-2 py-1 text-xs"
          >
            {(Object.keys(VARIABLE_TYPE_LABELS) as WorkflowVariableDataType[]).map((t) => (
              <option key={t} value={t}>
                {VARIABLE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          {v.dataType === 'SELECT' ? (
            <input
              value={v.selectOptions}
              onChange={(e) => update(i, { selectOptions: e.target.value })}
              placeholder="خيارات مفصولة بفاصلة"
              className="border-input bg-background rounded-md border px-2 py-1 text-xs"
            />
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs">
              <Checkbox checked={v.isRequired} onCheckedChange={(checked) => update(i, { isRequired: checked === true })} />
              إجباري
            </label>
            <Button type="button" variant="ghost" size="sm" onClick={() => remove(i)}>
              حذف
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
