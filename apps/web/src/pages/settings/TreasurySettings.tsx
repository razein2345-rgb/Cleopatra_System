import { Section } from './Section';
import { TreasuryCategoriesManagement } from './TreasuryCategoriesManagement';
import { AutoCloseTimeForm } from './AutoCloseTimeForm';

export function TreasurySettings() {
  return (
    <>
      <Section
        title="إدارة تصنيفات المصروفات/الإيرادات"
        subtitle="تصنيفات حركات الخزينة اليدوية — تظهر كقائمة عند تسجيل حركة جديدة بدل الكتابة الحرة"
      >
        <TreasuryCategoriesManagement />
      </Section>

      <Section title="تقفيل الحساب التلقائي">
        <AutoCloseTimeForm />
      </Section>
    </>
  );
}
