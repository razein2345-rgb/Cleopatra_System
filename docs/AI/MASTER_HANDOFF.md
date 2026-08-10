# Cleopatra Press ERP — MASTER HANDOFF
## المرجع الموحد لاستكمال تطوير النظام مع Claude

> **الغرض من الملف:** هذه الوثيقة تجمع المتطلبات والقرارات والقواعد التي تم الاتفاق عليها أثناء بناء نظام إدارة Cleopatra Press، حتى يمكن استخدامها كمرجع ثابت عند استكمال التطوير مع Claude.
>
> **قاعدة مهمة:** لا تعتبر أي نقطة "منفذة" لمجرد أنها مذكورة هنا. حالة التنفيذ يجب أن تُراجع من تقارير Claude والكود الفعلي. هذه الوثيقة هي مرجع للمتطلبات والقرارات، وليست بديلاً عن `PROJECT_MEMORY.md` أو `VISION.md` أو تقارير الـ Sprints.

---

# 1. رؤية المنتج

النظام هو ERP متكامل لإدارة المطبعة والخدمات المرتبطة بها، وليس مجرد برنامج فواتير.

يجب أن يغطي دورة العمل:

**عميل → طلب/عرض سعر (عند الحاجة) → أمر شغل → تصميم → إنتاج داخلي أو خارجي → تسليم → فاتورة/دفعة → خزينة → تقارير وتحليل → قرارات نمو وتسويق.**

ويجب أن يكون النظام:

- عربي وRTL كواجهة أساسية.
- سريع وسهل الاستخدام.
- واضح للموظف، وليس مصممًا فقط للمبرمج.
- قابل للتعديل من الإعدادات بدون تعديل الكود.
- لا يعتمد على بيانات وهمية.
- لا يخترع أرقامًا أو حسابات عند عدم وجود مصدر حقيقي.
- يحافظ على البيانات التاريخية بعد تغيير الإعدادات.
- يدعم التوسع التدريجي في الأقسام والخدمات.

---

# 2. قاعدة مهمة جدًا: لا تغيّر القديم لمجرد أن هناك طريقة جديدة

إذا حدث تعارض بين:

1. القواعد القديمة المتفق عليها مع صاحب النظام،
2. وبين نظام/Artifact/برنامج مرجعي أو طريقة حساب جديدة،

فالأولوية للقواعد التي تم الاتفاق عليها للنظام الحالي.

خصوصًا في:

- حساب الدفاتر.
- الورق السايب.
- عدد التكرارات.
- التراج.
- المقاسات.
- حسابات Offset/Digital.
- قواعد التسعير.

لا يتم استبدال هذه القواعد بنظام جاهز لمجرد أنه موجود في برنامج آخر.

---

# 3. الخدمات والأقسام

النظام يجب أن يدعم خدمات المطبعة والخدمات الإبداعية/الرقمية.

## خدمات المطبعة الأساسية

- Offset Printing
- Digital Printing
- دفاتر
- ورق سايب
- روشتات
- فواتير
- إيصالات
- كروت شخصية
- استيكرات
- بنرات
- Flex
- Vinyl
- شهادات
- بوسترات
- مستلزمات المدارس والمدرسين
- مستلزمات العيادات والمستشفيات
- خدمات ترقيم
- تجليد
- تصميم
- خدمات ما بعد الطباعة

## خدمات مستقبلية/إضافية

- Graphic Design
- Montage / Video Editing
- Photography
- Website Building
- Digital Marketing
- Marketing Services for Customers

هذه الخدمات لا يشترط أن تكون منفذة داخل المطبعة.

---

# 4. الأقسام المستقبلية

النظام يفهم أن بعض الأقسام قد تبدأ بدون موظفين أو معدات.

عند ارتفاع الطلب، النظام يجب أن يساعد صاحب العمل في معرفة:

- متى يحتاج موظفًا جديدًا؟
- متى يحتاج ماكينة جديدة؟
- متى يحتاج فتح قسم جديد؟
- متى يبدأ في جلب عملاء لخدمة معينة؟
- هل الطلب الحالي يكفي لتشغيل قسم؟
- هل الأفضل التوسع داخليًا أم الاستعانة بمورد خارجي؟

---

# 5. التسويق — قسم داخلي + خدمة للعملاء

يوجد فرق مهم جدًا:

## A. Marketing للمطبعة نفسها

المطبعة لديها قسم Marketing خاص بها.

النظام يجب أن يقترح:

- متى نعمل Campaign؟
- لماذا نعملها؟
- أي خدمة نروّج لها؟
- هل الهدف إدخال شغل Design؟
- هل الهدف إدخال شغل Montage؟
- هل الهدف إدخال شغل Websites؟
- هل الهدف إدخال Photography؟
- هل الهدف إدخال Printing؟
- هل الهدف إدخال Marketing clients؟

مثال:

> "حاليًا قسم التصميم لديه طاقة متاحة وطلبات قليلة، من الأفضل إطلاق حملة تستهدف أصحاب الشركات/العيادات لجلب أعمال تصميم."

## B. Marketing كخدمة للعميل

المطبعة نفسها تقدم Marketing Service للعملاء.

أي أن النظام يجب أن يفرق بين:

- **Internal Marketing**
- **Marketing Service sold to Customers**

---

# 6. AI / ERP Advisor

النظام مستقبلاً يجب أن يقدم توصيات مبنية على بيانات حقيقية.

أمثلة:

### Department Growth
- هل نحتاج موظف؟
- هل نحتاج ماكينة؟
- هل نفتح قسم؟
- هل نزيد ساعات العمل؟

### Marketing Advisor
- أي خدمة تحتاج حملة؟
- هل هناك طاقة إنتاجية غير مستغلة؟
- أي نوع من العملاء يجب استهدافه؟
- هل الحملة مناسبة للميزانية؟

### Business-Line Growth
النظام يقارن:

- الطلب.
- الطاقة.
- التكلفة.
- الربحية.
- الموردين الخارجيين.
- التسويق.

ثم يعطي توصية.

**لكن التوصيات لا تنفذ تلقائيًا. موافقة الإنسان مطلوبة دائمًا.**

كل توصية يجب أن ترتبط بهدف استراتيجي واضح أو يقول النظام إنه لا يملك بيانات كافية.

---

# 7. Notifications

النظام سبق أن تم تصميمه بحيث ينبه صاحب العمل عند الحاجة إلى:

- ماكينة جديدة.
- موظفين جدد.

ويضاف إليه:

- فتح قسم جديد.
- زيادة قدرة قسم.
- بدء Campaign لخدمة معينة.
- التركيز على جلب عملاء لخدمة فيها طاقة متاحة.
- مؤشرات انخفاض/ارتفاع الطلب.

---

# 8. الإنتاج الداخلي والخارجي

ليس كل شيء يتم داخل المطبعة.

هناك أعمال يتم إخراجها لموردين/مطابع أخرى.

أمثلة مؤكدة:

- بعض أعمال Offset ذات الأرضيات الغامقة يتم تنفيذها خارج المطبعة.
- الكروت الشخصية Offset يتم طباعتها خارج المطبعة.

النظام يجب أن يعرف أن الخدمة قد تكون:

**Internal Production** أو **External Supplier**.

---

# 9. Supplier Service Costing

عندما تكون الخدمة غير موجودة داخليًا، يتم حساب تكلفة المورد كالتالي:

**Supplier Cost
+ Transportation Cost
+ Employee Handling Cost
+ Profit Margin
= Customer Price**

## Supplier Cost
السعر الذي تدفعه للمورد.

## Transportation Cost
تكلفة المواصلات/النقل المتعلقة بإحضار أو تسليم الشغل.

## Employee Handling Cost
تكلفة وقت الموظف الذي يذهب/يحضر/يتابع الشغل.

## Profit Margin
هامش الربح المطلوب.

هذه القاعدة يجب أن تكون قابلة للاستخدام مع أي خدمة خارجية.

ولا يتم تسجيل سعر المورد فقط كسعر العميل النهائي.

---

# 10. العملاء

Customer/Partner ليس مجرد اسم وتليفون.

يجب أن تكون له صفحة واضحة باللغة العربية، ومن الطبيعي أن يرى المستخدم منها:

- بيانات العميل.
- عروض الأسعار.
- أوامر الشغل.
- الفواتير.
- الدفعات.
- الرصيد.
- الخدمات/التعاملات.

يجب تجنب وجود صفحات داخل العميل بها نصوص إنجليزية بلا داعٍ.

---

# 11. عروض الأسعار Quotation

عرض السعر يجب أن يكون مستندًا حقيقيًا وليس مجرد سجل أرقام.

يجب أن يحتوي على التفاصيل الطبيعية مثل:

- Logo
- اسم المطبعة
- بيانات المطبعة
- بيانات العميل
- رقم عرض السعر
- التاريخ
- البنود
- الوصف
- الكمية
- الوحدة
- السعر
- الإجمالي
- الخصم عند الحاجة
- الضريبة عند الحاجة
- الإجمالي النهائي
- الشروط/الملاحظات
- بيانات التواصل

## Multiple Quotation Templates

المستخدم يريد أن يستطيع إنشاء أكثر من Form/Template لعرض السعر.

مثلاً:

- عرض سعر رسمي.
- عرض سعر مختصر.
- عرض سعر بتصميم مختلف.

ويتم اختيار النموذج المناسب.

---

# 12. One-Time Quotation / Document Override

من أهم المتطلبات:

قد تكون إعدادات النظام الافتراضية مناسبة لـ 99% من عروض الأسعار، لكن يوجد عرض واحد يحتاج شكلًا أو إعدادًا مختلفًا.

**لا يجب تغيير Settings العامة من أجل عرض واحد.**

المطلوب:

**Global Settings
→ Template Configuration
→ Document One-Time Overrides
→ Frozen Document Snapshot**

الـ Override يكون خاصًا بالمستند فقط.

أمثلة:

- تغيير شعار/بيانات عرض معين.
- تغيير نص.
- إخفاء/إظهار جزء.
- تغيير إعداد عرض.
- تعديل بعض بيانات النموذج لمرة واحدة.

ولا يؤثر ذلك على باقي المستندات.

---

# 13. Frozen Snapshot

مهم جدًا للحفاظ على التاريخ.

لو طبعت عرض سعر اليوم بعنوان الشركة:

> Alexandria — Phone X

ثم بعد سنة تم تعديل العنوان في Settings، لا يجب أن يتغير المستند القديم عند إعادة فتحه.

لذلك عند تثبيت/طباعة المستند يتم حفظ:

**documentSnapshot**

والـ snapshot هو المرجع التاريخي.

لا يتم إعادة حسابه تلقائيًا بسبب تغيير:

- Settings
- Template
- Business Identity

---

# 14. الفواتير

الفاتورة يجب أن تكون جزءًا أساسيًا من النظام.

وتحتوي طبيعيًا على:

- Logo
- بيانات المطبعة
- بيانات العميل
- رقم الفاتورة
- التاريخ
- البنود
- الكمية
- الوحدة
- السعر
- الخصم
- الضريبة عند الحاجة
- الإجمالي
- المدفوع
- المتبقي
- طريقة الدفع
- الملاحظات

---

# 15. Direct Customer → Order/Invoice Flow

ليس كل عميل يعمل عرض سعر.

هذا مهم جدًا.

هناك عميل قد يدخل ويقول:

> "اعمل لي 1000 ورقة/فاتورة/كارت..."

في هذه الحالة:

**Customer → Direct Order → Invoice/Deposit**

بدون إنشاء Quotation أولًا.

النظام لا يجب أن يجبر المستخدم على عمل عرض سعر لكل عميل.

---

# 16. Deposit / Remaining Payment

مثال:

إجمالي الشغل = 5000 جنيه.

العميل دفع عند الطلب:

**2000 Deposit**

المتبقي:

**3000**

عند استلام الشغل:

**يدفع 3000**

النظام يجب أن يحسب ويعرض:

- Total
- Paid
- Remaining

ويمنع التناقضات في الحسابات.

---

# 17. Payments + Treasury

الدفع ليس مجرد رقم على الفاتورة.

كل Payment يجب أن يرتبط بالخزينة.

عند تسجيل دفعة:

**Payment + Treasury Entry**

ويتم إنشاء الاثنين في transaction واحدة.

لا نريد:

- Payment تم حفظه والخزينة فشلت.
- أو Treasury Entry بدون Payment.

## Treasury

يجب أن يكون هناك قسم واضح باسم:

**الخزينة والنقدية**

ويشمل:

### وارد
مثل:
- دفعات العملاء.
- إيرادات.
- أي دخل آخر.

### منصرف
مثل:
- مواصلات.
- موردين.
- مصاريف تشغيل.
- شراء.
- مصروفات أخرى.

ويجب عرض:

- الرصيد.
- إجمالي الوارد.
- إجمالي المنصرف.
- الحركة.
- المصدر.
- التاريخ.
- الوصف.

---

# 18. Work Order

أمر الشغل جزء أساسي من الإنتاج.

يجب أن يحتوي على:

- رقم أمر الشغل.
- العميل.
- تفاصيل الشغل.
- الكمية.
- القسم.
- الأولوية.
- الموعد.
- الحالة.
- ملاحظات.
- المسؤول.
- مراحل التنفيذ.

ويجب أن يكون قابلًا للطباعة.

---

# 19. Printing Documents

المستندات الأساسية التي يجب طباعتها:

1. Quotation
2. Invoice
3. Work Order

ويجب أن يكون لكل مستند:

- Preview
- Print
- Form/Template
- Logo
- بيانات المطبعة
- بيانات العميل
- التفاصيل الطبيعية للمستند
- RTL
- شكل احترافي

يفضل استخدام Browser Print Flow بدون dependency إضافية إذا كان ذلك متوافقًا مع architecture.

---

# 20. Document Templates

يجب وجود قسم Settings لإدارة:

**إعدادات المستندات / نماذج المستندات**

يشمل:

- Quotation Templates
- Invoice Templates
- Work Order Templates

والنموذج يجب أن يدعم:

- Create
- Edit Draft
- Publish
- Set Default
- Duplicate
- New Version
- Delete إذا لم يكن مستخدمًا في مستند تاريخي

## Versioning

النماذج المنشورة لا يتم تعديلها بطريقة تكسر المستندات القديمة.

يمكن إنشاء Version جديدة.

---

# 21. Template Hierarchy

الأولوية:

**Global Settings**
↓
**Template Config**
↓
**Document One-Time Overrides**
↓
**Frozen documentSnapshot**

ويجب عدم تعديل الإعدادات العامة من أجل مستند واحد.

---

# 22. Business Identity Settings

يجب أن يكون هناك مكان في Settings لإدخال بيانات المطبعة نفسها، مثل:

- Business Name
- Arabic Business Name
- Address
- Phone
- Email
- Tax Number عند الحاجة
- بيانات التواصل
- Logo/Logo URL إذا كان نظام الرفع موجودًا
- أي بيانات تظهر على المستندات

هذه البيانات تدخل في الـ document rendering.

---

# 23. Logo

قبل تنفيذ Upload يجب التأكد هل يوجد endpoint رفع شعار فعليًا.

إذا لا يوجد:

- لا نخترع Upload API.
- يمكن استخدام URL field مؤقتًا حسب التصميم المعتمد.

لكن الهدف النهائي أن يظهر Logo حقيقي على:

- Quotation
- Invoice
- Work Order

---

# 24. Printing Calculation Rules

هذه من أهم أجزاء النظام.

لا يتم استبدال قواعد الحساب المتفق عليها بقواعد برنامج جاهز.

## مثال سابق

100 دفتر روشتات:

- 100 دفتر.
- 100 ورقة لكل دفتر.
- 1 لون.
- 80g.
- A5.
- يتم اختيار أفضل مقاس فرخ يسمح بالتكرار.
- A3 يمكن أن يحتوي 4 من A5 في المثال السابق.
- إجمالي الأوراق = 10,000.
- حساب التراج منفصل عن حساب الترقيم.

مثال التكلفة السابق:

- زنكات = 75
- تصميم = 75
- طباعة = حسب عدد التراجات
- 10,000 ÷ تكرار المقاس في الفرخ
- التراجات حسب قاعدة المطبعة.
- تجليد = عدد الدفاتر × سعر التجليد.

**هذه القواعد هي Golden Rules للمطبعة ولا يتم تغييرها لمجرد أن Artifact آخر يحسب بطريقة مختلفة.**

---

# 25. التراج

مفهوم:

**تراج الطباعة**

يجب أن يبقى منفصلًا عن:

**Numbering Runs**

لا تستخدم حجم قبول ماكينة الترقيم لتحديد عدد تراج الطباعة.

---

# 26. Numbering

يوجد حد معروف لماكينة الترقيم:

**35 × 25**

لكن هذا لا يعني استخدامه في حساب تراج الطباعة.

Numbering calculation لها قواعدها الخاصة.

---

# 27. Offset / Digital

في النظام يجب أن يظهر:

**Offset** و **Digital**

كخدمات/أقسام واضحة.

ويجب أن تكون الحسابات الخاصة بكل نوع مستقلة حسب القواعد التي تم الاتفاق عليها.

---

# 28. Settings

Settings ليست صفحة شكلية.

يجب أن يستطيع المستخدم تعديل وإضافة:

## أسعار

- أسعار المقاسات.
- أسعار الورق.
- الأسعار الثابتة.
- الخدمات.
- المنتجات الجاهزة.
- تكاليف حسب الحاجة.

## Paper Sizes

يجب أن يستطيع:

- تعديل سعر مقاس.
- إضافة مقاس جديد.
- تعديل بيانات المقاس.
- إدارة Sheet Types.

## Size Guide

إدارة:

- Size Families
- Size Entries
- المقاسات
- عدد التكرارات/pieces per sheet عند الحاجة.

---

# 29. Settings يجب ألا تكون Hardcoded

أي سعر أو إعداد تجاري يتوقع أن يتغير يجب ألا يحتاج تعديل الكود.

يجب أن يكون قابلًا للتعديل من Settings متى كان له backing data مناسب.

ولا يتم اختراع UI لشيء لا يوجد له backend/data source حقيقي.

---

# 30. Smart Search

البحث الذكي الحالي مصمم بطريقة Provider Architecture.

المصادر الموجودة/المؤكدة:

### الصفحات
يبحث في اسم الصفحة.

### العملاء والموردون
من `/api/partners`

البحث في:

- nameAr
- nameEn
- phone
- email

### عروض الأسعار
من `/api/quotations`

البحث في:

- quotationNumber

### المنتجات الجاهزة
من `/api/ready-products`

البحث في:

- name

### الخدمات
من `/api/services`

البحث في:

- name

## مهم

لا يتم اختراع Search لشيء لا يوجد له endpoint/data source حقيقي.

المطلوب مستقبلًا إضافة:

- Orders
- Invoices
- Employees
- Machines
- Barcode/QR
- Document Number

عندما تصبح endpoints والبيانات متاحة فعليًا.

---

# 31. Dashboard

Dashboard يجب أن يكون مبنيًا على بيانات حقيقية.

المبدأ:

**No fake statistics.**

لا تظهر 0 كبديل أثناء loading إذا كانت البيانات لم تصل.

يفضل loading state.

الـ Dashboard الحالي تطور إلى aggregate endpoint واحد بدل fan-out متعدد:

`GET /api/workflow-instances/dashboard-summary`

ويتم استخدام real data.

---

# 32. Production Dashboard

الهدف ليس فقط معرفة:

> هل هناك مشكلة؟

بل أيضًا:

> أين المشكلة؟
> ما حجمها؟
> من المسؤول؟
> ما الإجراء المطلوب؟

مؤشرات الإنتاج المطلوبة تشمل:

- Open Quotations
- Active Work Orders
- Waiting Jobs
- Delayed Jobs
- Jobs in Progress
- Daily Production
- Jobs by Department
- Jobs by Operator
- Supplier Delays
- Failed Today

---

# 33. Production Board

يوجد:

`/production-board`

ويشمل:

- Department Switcher
- Queue
- Priority
- Due Date
- Time in Stage
- Customer
- Delayed/Urgent indicators
- Search
- Filters
- Mobile card layout
- Refresh
- Last Updated
- Fail/Skip confirmation
- Complete
- Fail
- Skip
- Edit

## Mobile

لا نريد horizontal scroll للوصول إلى Actions.

على mobile يجب أن تتحول الصفوف إلى Cards.

---

# 34. Work Order Timeline

يوجد تصور لشاشة:

`/production-board/timeline/:workflowInstanceId`

تعرض رحلة أمر الشغل عبر الأقسام/المراحل.

الغرض:

- معرفة أين وصل الشغل.
- المراحل السابقة.
- المرحلة الحالية.
- المراحل القادمة.
- الزمن.
- المشاكل/التأخير.

---

# 35. Dashboard Click-through

إذا كان الرقم يمثل Department محددًا، يمكن جعله Link.

مثال:

**Jobs by Department → Production Board?department=<id>**

لكن لا نربط Aggregate عالمي بصفحة Department واحدة بشكل مضلل.

لذلك:

- Jobs by Department: clickable.
- Delayed global total: informational ما لم يوجد screen يمثل نفس scope.
- Jobs by Operator: لا يتم توجيهه لقسم عشوائي.

---

# 36. RTL / Arabic

الواجهة الأساسية:

**Arabic / RTL**

ويجب ترجمة:

- App Shell
- Dashboard
- Partners
- Quotations
- Users
- Roles
- Permissions
- Settings
- Production Board
- Treasury
- Documents
- Forms

ولا نريد أن يدخل المستخدم إلى Customer أو Quotation ثم يجد أجزاء كبيرة بالإنجليزية.

الـ CSS الجديد يجب أن يستخدم Logical Properties عند الحاجة:

- start/end
- وليس left/right

مع الحفاظ على `dir="ltr"` للحقول التي تحتاج ذلك مثل:

- Email
- Password
- بعض الأرقام/الأكواد حسب الاستخدام.

---

# 37. Sidebar / Navigation

يجب أن تكون الأقسام الأساسية واضحة.

خصوصًا:

- Dashboard
- Orders / Work Orders
- Quotations
- Invoices
- Customers/Partners
- Suppliers
- Treasury / Cash
- Production
- Marketing
- Settings

ولا يجب دفن قسم أساسي مثل Treasury داخل Settings.

---

# 38. Library — Barcode & QR

تم الاتفاق على وجود:

**نظام مكتبة باستخدام Barcode + QR**

ويجب أن يكون له استخدام فعلي وليس مجرد إضافة شكلية.

المستقبل:

- Document identification
- Work Order tracking
- Library items
- Search/scan
- Status tracking

لكن لا يتم إضافة QR/Barcode في كل مكان بلا سبب تشغيلي.

في Production Board الحالي كان QR/Barcode مؤجلًا وليس bundled تلقائيًا مع Sprint 2.5.

---

# 39. Supplier / External Workflow

عند إخراج شغل للخارج يجب تتبع:

- المورد.
- الخدمة.
- تكلفة المورد.
- النقل.
- تكلفة الموظف.
- هامش الربح.
- السعر على العميل.
- الربحية.

والهدف لاحقًا:

**External Manufacturing Profitability Analysis**

لمعرفة هل إخراج الشغل مربح أم لا.

---

# 40. Reports

مستقبلًا نحتاج تقارير حقيقية، مثل:

- Sales
- Quotations
- Orders
- Invoices
- Payments
- Treasury
- Supplier Costs
- External Manufacturing Profitability
- Department Performance
- Customer Profitability
- Marketing Performance
- Production Turnaround
- On-time delivery

لا يتم إضافة أرقام أو Charts بدون data source حقيقي.

---

# 41. Inventory

Inventory جزء مطلوب مستقبلًا.

يشمل حسب الحاجة:

- خامات.
- ورق.
- مستلزمات.
- استهلاك.
- شراء.
- مورد.
- تكلفة.

لكن لا يتم بناء Inventory وهمي قبل تحديد مصادر البيانات وقواعده.

---

# 42. Library

Library يجب أن تكون قسمًا حقيقيًا عندما يبدأ تنفيذها.

وتتصل بفكرة:

- Barcode
- QR
- document tracking
- lookup
- physical/production items

---

# 43. Employees

النظام يجب أن يعرف:

- الموظفين.
- الأقسام.
- الأدوار.
- الصلاحيات.
- workload.
- الإنتاجية.

ويستخدم هذه البيانات في:

- Hiring recommendation
- Department growth
- Capacity analysis

---

# 44. Machines

النظام يجب أن يتابع:

- الماكينات.
- القسم.
- القدرة.
- workload.
- الاستخدام.

ويستطيع Advisor لاحقًا أن يقول:

> "الطلب على Digital وصل إلى مستوى يجعل إضافة ماكينة/وردية أمرًا منطقيًا."

لكن التوصية لا تتحول إلى قرار تلقائي.

---

# 45. Capacity-Aware Marketing

هذه نقطة مهمة جدًا.

إذا كان قسم معين لديه:

- طاقة إنتاجية متاحة.
- موظفين متاحين.
- طلب منخفض.

يمكن للنظام اقتراح Campaign لهذا النوع من العمل.

مثال:

> قسم Design عنده طاقة 40 ساعة أسبوعيًا، المستخدم منها 15 فقط → نحتاج Marketing Campaign لجلب أعمال تصميم.

ونفس الشيء:

- Montage
- Photography
- Websites
- Printing
- Marketing Services

---

# 46. Campaign Recommendations

النظام مستقبلاً يجب أن يقول:

**ماذا نعمل؟**

مثلاً:

> "ابدأ حملة لجلب تصميمات سوشيال ميديا."

**لماذا؟**

> "لأن الطاقة المتاحة مرتفعة والطلبات منخفضة."

**لمن؟**

> "عيادات/مطاعم/شركات صغيرة."

**الميزانية المقترحة؟**

حسب Budget المتاح.

**الهدف؟**

زيادة Orders في Department معين.

---

# 47. Direct Order vs Quotation

هذه قاعدة أساسية:

### Scenario A
عميل يحتاج تسعير أولًا:

**Customer → Quotation → Approval → Work Order → Invoice/Payment**

### Scenario B
عميل يعرف ما يريد:

**Customer → Direct Order → Invoice/Deposit → Work Order → Production → Remaining Payment**

لا تجبر العميل على Quotation في Scenario B.

---

# 48. Financial State

كل Order/Invoice يجب أن تكون حالته المالية واضحة:

**Total**

**Paid**

**Remaining**

والدفعات مرتبطة بالخزينة.

مثال:

5000 total

2000 paid

3000 remaining

بعد دفع 3000:

5000 paid

0 remaining

---

# 49. Document Numbering

هناك ADR خاص بـ Document Numbering.

لا يتم اختراع طريقة جديدة للأرقام إذا كان النظام الحالي لديه DocumentSequence.

الأنواع المؤكدة تشمل:

- Quotation
- Invoice
- Work Order

ويجب الحفاظ على uniqueness والتسلسل.

---

# 50. Freeze by Default

يوجد ADR خاص بـ:

**Independent Quotation / WorkOrder + Freeze-by-default snapshotting**

أي أن المستند التاريخي لا يعتمد على mutable settings بطريقة تجعل إعادة العرض تغير التاريخ.

هذا يتكامل مع:

- documentTemplateId
- documentOverrides
- documentSnapshot

---

# 51. Database / Schema Principles

أي Schema Change:

- يكون additive قدر الإمكان.
- لا يكسر البيانات القديمة.
- لا يضيف migration إلا عند الحاجة.
- يجب أن يكون له سبب واضح.
- يجب مراجعة RLS.
- يجب اختبار migration.
- يجب اختبار البيانات الموجودة.

---

# 52. API Principles

لا يتم بناء frontend يعتمد على fake endpoints.

أي feature يجب أن يكون له:

- Schema
- Service
- Controller
- Route
- Permission
- UI

عندما تكون طبيعة الميزة تحتاج ذلك.

---

# 53. Permission Principles

كل شاشة/عملية حساسة يجب أن تعتمد على permission.

مثل:

- settings.view
- settings.edit
- partners.view
- quotations.view
- orders.view
- orders.edit
- work-orders.view
- work-orders.edit
- treasury.*
- production.*

ولا يتم bypass للصلاحيات من UI.

---

# 54. No Fake Data Rule

قاعدة صارمة:

لا:

- mock data
- fake statistics
- hardcoded business numbers
- fake API responses
- placeholder calculations

إذا لم توجد البيانات:

**اعرض Empty State واضحًا.**

إذا كانت البيانات Loading:

**اعرض Loading.**

إذا لا يوجد backend:

**قل إن الميزة غير جاهزة بدل اختراع نتيجة.**

---

# 55. Verification Rules مع Claude

كل milestone يجب أن يمر:

1. Typecheck
2. Lint
3. Build
4. Backend tests عند الحاجة
5. Live browser verification
6. API verification عند الحاجة
7. التأكد من عدم وجود regression

وعند عدم وجود بيانات حقيقية لتجربة حالة معينة:

يجب قول:

> "Code-reviewed / structurally verified, but not end-to-end بسبب عدم وجود بيانات حقيقية."

ولا يتم إنشاء fake production data فقط لادعاء النجاح.

---

# 56. Known Architecture Pattern

النظام يستخدم patterns تم اعتمادها:

## Search
Provider architecture:

`SearchProvider[]`

## Dashboard
Widget Registry:

`registry.ts`

## Workflow
Shared Provider / aggregate endpoint.

## Settings
Category-based Settings.

هذه patterns يجب الحفاظ عليها بدل إعادة بناء architecture جديدة بلا سبب.

---

# 57. Feature-005 Status

تم تنفيذ وإغلاق:

## Sprint 1
- Arabic UX
- Smart Search
- Dashboard
- Settings CRUD
- RTL
- Mobile foundation

## Sprint 2
- Production Dashboard
- Production Board
- Aggregate endpoint
- Workflow widgets

## Sprint 2.5
- Customer name
- Due date
- Time in stage
- Filters
- Mobile cards
- Fail/Skip confirmation
- Refresh
- Last updated
- Department deep links
- Delayed badge
- Work Order timeline

مع الالتزام بقاعدة عدم اختراع البيانات.

---

# 58. FEATURE-006 Document Templates / Financial Foundation

تم البدء في تنفيذ:

## M1
Schema:

- DocumentTemplate
- documentTemplateId
- documentOverrides
- documentSnapshot
- business identity fields in Setting

## M2
Direct Order creation.

مثال تم اختباره:

`CLP-INV-2026-000006`

## M3
Payments:

- payment record
- automatic Treasury entry
- atomic transaction

## M4
Treasury:

- main navigation entry
- balance
- income
- expense
- manual entry
- automatic payment entries
- filters

## M5
Document Template service:

- CRUD
- Publish
- Default
- Versioning
- Duplicate
- Delete protection
- Exclusivity lock

## M6
Settings:

- Business Identity
- Document Templates
- Quotation / Invoice / Work Order template management

هذه الحالة يجب اعتبارها "ما تم الإبلاغ عن تنفيذه والتحقق منه في تقارير Claude"، وليس بديلًا عن مراجعة الكود عند استكمال العمل.

---

# 59. Current Major Gap: Pricing Engine

من أهم النتائج في Master Product Review:

**Pricing / Calculation Engine هو blocker رئيسي.**

الـ Quotation/Order سابقًا كان يعتمد على إدخال subtotal/finalTotal يدويًا.

المطلوب بناء Pricing Engine حقيقي يطبق قواعد المطبعة.

قبل التوسع الكبير في الفواتير والتقارير، يجب التأكد أن الحسابات الأساسية تعمل.

---

# 60. Pricing Engine Golden Master

مثال مرجعي سابق:

100 دفتر روشتات
1 لون
80g
A5
100 ورقة لكل دفتر

الإجمالي:

100 × 100 = 10,000 ورقة.

مع تكرار A5 على A3:

4 A5 / A3

ثم حساب عدد التراجات حسب قاعدة المطبعة.

مثال سابق كان:

3 تراج × 75 = 225

مع:

- زنكات = 75
- تصميم = 75
- تجليد = 100 × 2.5 = 250

لكن يجب الاحتفاظ بالقواعد الدقيقة التي تم اعتمادها في النظام وعدم تحويل المثال إلى hardcoded calculator.

---

# 61. Pricing Engine المطلوب

يجب أن يكون هناك Calculator/Engine واحد.

ويعطي:

- Cost breakdown
- Customer price
- quantity
- material
- paper
- printing
- plates
- design
- numbering
- binding
- finishing
- external supplier
- transport
- employee handling
- margin
- discount
- tax
- total

ويتم حفظ breakdown مع OrderItem عند الحاجة.

---

# 62. Quotation Item Override

عند وجود اختلاف في عرض سعر واحد:

لا نغير Global Pricing.

الـ override يجب أن يكون على مستوى المستند/البند حسب التصميم النهائي.

مثال:

السعر الطبيعي = 500

عرض معين = 450

هذا لا يعني تغيير سعر الخدمة العامة إلى 450.

---

# 63. Historical Integrity

أي مستند أصبح تاريخيًا يجب ألا يتأثر لاحقًا بـ:

- تغيير السعر.
- تغيير الورق.
- تغيير المقاس.
- تغيير Template.
- تغيير Business Identity.
- تغيير Margin.

لذلك نحتاج snapshot/breakdown frozen where appropriate.

---

# 64. UX Philosophy

النظام يجب ألا يجعل المستخدم "يتوه".

خصوصًا:

- Quotation
- Invoice
- Work Order
- Customer
- Treasury

كل صفحة يجب أن تجيب:

**أنا فين؟**

**أعمل إيه؟**

**الخطوة التالية إيه؟**

مثال:

Quotation:

- حفظ
- اعتماد
- طباعة
- تحويل لأمر شغل

Invoice:

- تسجيل دفعة
- طباعة
- مشاهدة المتبقي

Work Order:

- إرسال للتصميم
- إرسال للإنتاج
- متابعة المرحلة

Treasury:

- إضافة وارد
- إضافة منصرف
- متابعة الرصيد

---

# 65. Document UX

المستخدم يجب أن يستطيع:

**Create → Preview → Print**

بوضوح.

والطباعة لا يجب أن تكون hidden.

Quotation يجب أن يحتوي على:

- اختيار Template
- Preview
- Print

Invoice:

- Preview
- Print

Work Order:

- Preview
- Print

---

# 66. Multiple Forms

في حالة Quotation على الأقل:

المستخدم يريد أكثر من Form.

مثلاً:

- Template A
- Template B
- Template C

ويستطيع تحديد default.

ولا يجب أن يؤدي تغيير Template إلى تعديل المستندات القديمة.

---

# 67. Supplier Management

Supplier يجب أن يكون Entity مستقل أو Partner type واضح.

ويشمل:

- بيانات المورد.
- الخدمات التي يقدمها.
- أسعار المورد.
- External Jobs.
- Payments.
- Outstanding.
- Profitability.

---

# 68. Reports & AI later

بعد وجود بيانات حقيقية، يمكن بناء:

- Profitability
- Customer value
- Supplier comparison
- Department utilization
- Marketing ROI
- Campaign effectiveness
- Hiring needs
- Machine needs

لا يتم بناء AI فوق بيانات غير موجودة.

---

# 69. Product Development Priority

الأولوية العملية المقترحة:

## P0
1. Pricing Engine
2. Direct Order
3. Invoice
4. Payments
5. Treasury
6. Document printing/templates
7. Customer financial view

## P1
8. Production/Workflow improvements
9. Suppliers
10. Reports
11. Inventory
12. Library + QR/Barcode

## P2
13. Marketing Advisor
14. Capacity-aware marketing
15. AI Business Advisor
16. Growth recommendations
17. Advanced analytics

---

# 70. How Claude Should Work

عند إعطاء Claude مهمة:

1. اقرأ `VISION.md`.
2. اقرأ `PROJECT_MEMORY.md`.
3. اقرأ هذا الملف.
4. افحص الكود الحالي قبل التخطيط.
5. لا تفترض أن feature موجودة لأنها مكتوبة في documentation.
6. لا تكرر implementation موجود.
7. لا تغير architecture بدون سبب.
8. اكتب Requirements.
9. اكتب Analysis.
10. اكتب Plan.
11. توقف عند قرارات حقيقية تحتاج موافقة.
12. عند الموافقة نفذ milestone-by-milestone.
13. اختبر بعد كل milestone.
14. لا تستخدم fake data.
15. حدث documentation.

---

# 71. Claude Stop Conditions

Claude يجب أن يتوقف ويسأل إذا وجد:

- تعارضًا بين requirementين.
- تغييرًا قد يكسر calculation rules.
- تغييرًا في historical data.
- migration كبيرة غير متوقعة.
- permission decision غير واضحة.
- scope decision غير واضحة.
- feature تحتاج business rule غير معروف.
- click-through قد يكون misleading.
- endpoint غير واضح ownership.
- template behavior غير محدد.
- pricing behavior غير محدد.

---

# 72. مثال Prompt افتتاحي لاستكمال العمل

استخدم:

> اقرأ أولًا:
>
> 1. `VISION.md`
> 2. `PROJECT_MEMORY.md`
> 3. `MASTER_HANDOFF.md`
> 4. الـ ADRs المرتبطة بالـ feature الحالية.
>
> تعامل مع `MASTER_HANDOFF.md` كمرجع للمتطلبات والقرارات التجارية التي اتفقنا عليها.
>
> لا تفترض أن أي feature مذكورة فيه منفذة؛ تحقق من الكود الفعلي.
>
> لا تستخدم mock/fake data.
>
> لا تغيّر قواعد حساب المطبعة المعتمدة.
>
> لا تغيّر Global Settings من أجل مستند واحد؛ استخدم Document Override + Snapshot.
>
> حافظ على Arabic RTL.
>
> قبل التنفيذ:
> - افحص architecture الحالية.
> - حدد ما هو موجود.
> - حدد ما هو ناقص.
> - اكتب Requirements.
> - اكتب Analysis.
> - اكتب Plan milestone-by-milestone.
>
> إذا ظهر قرار business حقيقي أو تعارض، توقف واسألني.
>
> بعد الموافقة نفذ milestone واحدًا في كل مرة، واختبر typecheck/lint/build/tests/live verification بعد كل milestone.
>
> لا تدّعي نجاح live verification إذا لم توجد بيانات حقيقية لتجربة الحالة.

---

# 73. أهم قاعدة في المشروع

**هذا نظام مطبعة حقيقي، وليس Demo.**

أي شيء يظهر للمستخدم يجب أن يكون:

- مفهومًا.
- قابلًا للتشغيل.
- مرتبطًا ببيانات حقيقية.
- متوافقًا مع طريقة تشغيل المطبعة.
- قابلًا للتعديل.
- آمنًا على البيانات التاريخية.
- عربيًا.
- ومريحًا للموظف.

والهدف النهائي ليس أن يكون الكود "نظيفًا فقط".

الهدف:

**صاحب المطبعة يقدر يدير شغله بالكامل من النظام بدون ما يحتاج يفكر في كيفية عمل النظام من الداخل.**
