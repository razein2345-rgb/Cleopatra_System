import type { ComponentType } from 'react';

/**
 * One Dashboard card. `Component` is fully self-contained — it fetches
 * its own data (directly, or via a shared context provider when several
 * widgets read the same source, see `providers/`) and renders its own
 * `<DashboardWidget>`. `DashboardPage.tsx` only filters this list by
 * permission and renders `<w.Component />` — it never contains widget
 * logic itself.
 *
 * `permission` accepts one or more permission keys; every one listed
 * must pass `can()` for the widget to render at all (not "any of").
 */
export interface DashboardWidgetDefinition {
  id: string;
  permission?: string | string[];
  Component: ComponentType;
  /**
   * Grid width, purely a layout hint `DashboardPage.tsx` applies
   * generically (it never knows what any specific widget shows).
   * `'sm'` (default) is one column in the 4-up grid — a single metric.
   * `'lg'` spans two columns on `sm:`+ — a small list/breakdown widget
   * (e.g. Jobs by Department) that needs more room than one number.
   */
  span?: 'sm' | 'lg';
}

export function isWidgetPermitted(
  widget: DashboardWidgetDefinition,
  can: (permission: string) => boolean,
): boolean {
  if (!widget.permission) return true;
  const required = Array.isArray(widget.permission) ? widget.permission : [widget.permission];
  return required.every((p) => can(p));
}
