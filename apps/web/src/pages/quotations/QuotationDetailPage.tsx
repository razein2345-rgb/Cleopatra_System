import { useNavigate, useParams } from 'react-router-dom';
import { QuotationDetail } from './QuotationDetail';

/**
 * Thin, routed full-page host for `QuotationDetail` — today's only
 * presentation. `QuotationDetail` itself has no route/page assumptions,
 * so a future Side Panel/Modal/Workspace Tab host can render it directly
 * without this wrapper (FEATURE-003 M1's Multi View Compatibility
 * architectural decision).
 */
export function QuotationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  if (!id) return null;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => navigate('/quotations')}
        className="text-muted-foreground hover:text-foreground text-sm"
      >
        ← العودة إلى المستندات
      </button>
      <QuotationDetail key={id} quotationId={id} />
    </div>
  );
}
