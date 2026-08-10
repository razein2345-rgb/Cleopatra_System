import { Section } from './Section';
import { CategoriesManagement } from './CategoriesManagement';
import { TagsManagement } from './TagsManagement';

export function CompanySettings() {
  return (
    <>
      <Section title="إدارة التصنيفات" subtitle="تصنيفات العملاء — تصنيف واحد أو بدون لكل عميل">
        <CategoriesManagement />
      </Section>

      <Section title="إدارة الوسوم" subtitle="وسوم العملاء — عدد غير محدود لكل عميل">
        <TagsManagement />
      </Section>
    </>
  );
}
