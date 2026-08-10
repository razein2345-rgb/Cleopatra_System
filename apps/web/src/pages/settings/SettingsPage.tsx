import { useParams } from 'react-router-dom';
import { Breadcrumbs } from '@/components/cleopatra';
import { SETTINGS_CATEGORIES } from './categories';
import { SettingsHome } from './SettingsHome';

export function SettingsPage() {
  const { categoryId } = useParams<{ categoryId?: string }>();

  if (!categoryId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">الإعدادات</h1>
        <SettingsHome />
      </div>
    );
  }

  const category = SETTINGS_CATEGORIES.find((c) => c.id === categoryId);

  if (!category) {
    return (
      <div className="space-y-4">
        <Breadcrumbs items={[{ label: 'الإعدادات', to: '/settings' }, { label: 'غير موجود' }]} />
        <div className="text-muted-foreground text-sm">
          هذا القسم غير موجود.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: 'الإعدادات', to: '/settings' }, { label: category.label }]} />
      <h1 className="text-2xl font-bold">{category.label}</h1>
      <category.Component />
    </div>
  );
}
