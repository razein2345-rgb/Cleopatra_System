import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';

/**
 * FEATURE-005 Sprint 2.5 — Fail/Skip change a real `WorkflowInstance`'s
 * status and are hard to reverse (see `PRODUCTION_READINESS_REVIEW.md` F11),
 * unlike Complete which stays a single click. This dialog adds no business
 * logic of its own — `onConfirm` calls the same `advance()` the button
 * already called before this milestone.
 */
export function ConfirmStageActionDialog({
  stageName,
  action,
  onConfirm,
  onCancel,
}: {
  stageName: string;
  action: 'FAIL' | 'SKIP';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const actionLabel = action === 'FAIL' ? 'فشل' : 'تخطي';
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تأكيد الإجراء</DialogTitle>
          <DialogDescription>
            هل أنت متأكد من تسجيل هذه المرحلة كـ "{actionLabel}"؟ — {stageName}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            تأكيد {actionLabel}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
