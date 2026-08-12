import { Section } from './Section';
import { CategoriesManagement } from './CategoriesManagement';
import { TagsManagement } from './TagsManagement';
import { BranchesEditor } from './BranchesEditor';

export function CompanySettings() {
  return (
    <>
      <Section title="إدارة الفروع" subtitle="فروع الشركة — تُستخدم عند إنشاء الفواتير وعروض الأسعار">
        <BranchesEditor />
      </Section>

      <Section title="إدارة التصنيفات" subtitle="تصنيفات العملاء — تصنيف واحد أو بدون لكل عميل">
        <CategoriesManagement />
      </Section>

      <Section title="إدارة الوسوم" subtitle="وسوم العملاء — عدد غير محدود لكل عميل">
        <TagsManagement />
      </Section>
    </>
  );
}
