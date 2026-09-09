import { Section } from './Section';
import { HrScalingThresholdsForm } from './HrScalingThresholdsForm';

export function ProductionSettings() {
  return (
    <Section
      title="تنبيهات التوسع في الفريق"
      subtitle="حدود قابلة للتعديل — لو أي قسم إنتاجي تجاوزها، يظهر تنبيه في لوحة التحكم الرئيسية"
    >
      <HrScalingThresholdsForm />
    </Section>
  );
}
