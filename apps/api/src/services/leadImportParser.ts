import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import type { ParsedLeadImportRow } from '@cleopatra/shared';

/**
 * Owner (2026-09-08) — parses an uploaded Excel/CSV file of leads into rows
 * for review before import. Uses `exceljs` rather than `xlsx`/SheetJS: the
 * latter has two unpatched HIGH-severity advisories (prototype pollution +
 * ReDoS) on the npm-published package, directly in the file-parsing code
 * path — exactly the attack surface a user-uploaded file exercises.
 */
export class LeadImportParseError extends Error {}

const MAX_ROWS = 500;

type LeadImportField = 'name' | 'phone' | 'email' | 'facebookUrl';

/** Recognized header names (Arabic + English, case-insensitive) — falls back to fixed column order (name, phone, email, facebookUrl) when none match, so a header-less sheet still works. */
const HEADER_FIELD_MAP: Record<string, LeadImportField> = {
  'الاسم': 'name',
  'اسم': 'name',
  'اسم العميل': 'name',
  name: 'name',
  'الهاتف': 'phone',
  'رقم الهاتف': 'phone',
  'الموبايل': 'phone',
  'موبايل': 'phone',
  'تليفون': 'phone',
  phone: 'phone',
  'الايميل': 'email',
  'الإيميل': 'email',
  'ايميل': 'email',
  'إيميل': 'email',
  email: 'email',
  'فيسبوك': 'facebookUrl',
  'لينك فيسبوك': 'facebookUrl',
  'رابط فيسبوك': 'facebookUrl',
  facebook: 'facebookUrl',
  facebookurl: 'facebookUrl',
};

const POSITIONAL_COLUMNS: Record<LeadImportField, number> = { name: 1, phone: 2, email: 3, facebookUrl: 4 };

function cellText(row: ExcelJS.Row, col: number): string {
  const value = row.getCell(col).value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if ('text' in value) return String((value as { text: unknown }).text ?? '').trim();
    if ('result' in value) return String((value as { result: unknown }).result ?? '').trim();
  }
  return String(value).trim();
}

export async function parseLeadImportFile(buffer: Buffer, originalFileName: string): Promise<ParsedLeadImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  const isCsv = originalFileName.toLowerCase().endsWith('.csv');

  let worksheet: ExcelJS.Worksheet | undefined;
  try {
    if (isCsv) {
      // exceljs's default CSV cell mapper runs `Number(datum)` on anything
      // that looks numeric and returns the number instead of the original
      // text — silently stripping the leading zero off an Egyptian phone
      // number like "01099887766" (→ 1099887766). Overriding `map` to keep
      // every cell as raw text avoids that corruption; this app has no use
      // for CSV auto-casting to numbers/dates anyway (every field here —
      // name/phone/email/facebookUrl — is free text).
      worksheet = await workbook.csv.read(Readable.from(buffer), {
        map: (datum: string) => (datum === '' ? null : datum),
      });
    } else {
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
      worksheet = workbook.worksheets[0];
    }
  } catch {
    throw new LeadImportParseError('تعذر قراءة الملف — تأكد إنه ملف Excel (xlsx) أو CSV صالح');
  }

  if (!worksheet || worksheet.rowCount < 1) {
    throw new LeadImportParseError('الملف فاضي');
  }

  const headerRow = worksheet.getRow(1);
  const columnByField = new Map<LeadImportField, number>();
  headerRow.eachCell((_cell, colNumber) => {
    const raw = cellText(headerRow, colNumber).toLowerCase();
    const field = HEADER_FIELD_MAP[raw];
    if (field && !columnByField.has(field)) columnByField.set(field, colNumber);
  });

  const usePositional = columnByField.size === 0;
  const colFor = (field: LeadImportField) => (usePositional ? POSITIONAL_COLUMNS[field] : columnByField.get(field));

  const rows: ParsedLeadImportRow[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const nameCol = colFor('name');
    const phoneCol = colFor('phone');
    const emailCol = colFor('email');
    const facebookCol = colFor('facebookUrl');

    const name = nameCol ? cellText(row, nameCol) : '';
    const phone = phoneCol ? cellText(row, phoneCol) : '';
    const email = emailCol ? cellText(row, emailCol) : '';
    const facebookUrl = facebookCol ? cellText(row, facebookCol) : '';

    if (!name && !phone && !email && !facebookUrl) return;

    let error: string | undefined;
    if (!name) error = 'الاسم مطلوب';
    else if (!phone) error = 'الهاتف مطلوب';

    rows.push({ rowNumber, name, phone, email: email || undefined, facebookUrl: facebookUrl || undefined, error });
  });

  if (rows.length === 0) {
    throw new LeadImportParseError('لم يتم العثور على أي صفوف بيانات في الملف');
  }
  if (rows.length > MAX_ROWS) {
    throw new LeadImportParseError(`الملف يحتوي على ${rows.length} صف — الحد الأقصى ${MAX_ROWS} صف في المرة، قسّمه لدفعات أصغر`);
  }

  return rows;
}
