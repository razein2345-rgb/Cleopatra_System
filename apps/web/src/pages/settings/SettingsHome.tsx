import { Link } from 'react-router-dom';
import { SETTINGS_CATEGORIES } from './categories';

export function SettingsHome() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {SETTINGS_CATEGORIES.map((category) => (
        <Link
          key={category.id}
          to={`/settings/${category.id}`}
          className="border-border bg-card hover:bg-accent/40 flex flex-col gap-2 rounded-2xl border p-5 transition-colors"
        >
          <category.icon className="text-primary size-6" />
          <span className="font-bold">{category.label}</span>
          <span className="text-muted-foreground text-sm">{category.description}</span>
        </Link>
      ))}
    </div>
  );
}
