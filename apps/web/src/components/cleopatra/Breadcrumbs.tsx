import { Link } from 'react-router-dom';
import { Fragment } from 'react';

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

/**
 * A plain "/" separator, not a directional chevron — sidesteps deciding
 * which way an arrow should point under `dir="rtl"` entirely (a real
 * defect class this sprint's RTL pass is otherwise fixing).
 */
export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="مسار التنقل" className="text-muted-foreground flex items-center gap-2 text-sm">
      {items.map((item, index) => (
        <Fragment key={item.label}>
          {index > 0 && <span aria-hidden="true">/</span>}
          {item.to ? (
            <Link to={item.to} className="hover:text-foreground">
              {item.label}
            </Link>
          ) : (
            <span className="text-foreground font-medium">{item.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
