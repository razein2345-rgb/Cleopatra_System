import { SizeCalculationError, type SizeFamilyInput } from './sizeCalculation.js';
import type { SheetBase } from '../schemas/sheetType.js';

/** Dimensions are centimetres. Reject malformed/zero/nonfinite values before packing. */
export function parseOffsetDimensions(label: string): [number, number] | null {
  const aSeries: Record<string, [number, number]> = { A7: [7.4, 10.5], A6: [10.5, 14.8], A5: [14.8, 21], A4: [21, 29.7], A3: [29.7, 42], A2: [42, 59.4], A1: [59.4, 84.1] };
  if (Object.prototype.hasOwnProperty.call(aSeries, label)) return aSeries[label];
  const normalized = label.trim().replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632)).replace(/٫/g, '.');
  const match = /^(\d+(?:\.\d+)?)\s*[×xX*]\s*(\d+(?:\.\d+)?)$/.exec(normalized);
  if (!match) return null;
  const w = Number(match[1]), h = Number(match[2]);
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? [w, h] : null;
}

export function canonicalOffsetLabel(label: string): string {
  const dimensions = parseOffsetDimensions(label);
  return dimensions && !/^A[1-7]$/.test(label) ? dimensions.join('×') : label.trim();
}

/** Uniform rows with either 0° or 90° rotation; never round an area ratio into pieces. */
export function fitOffsetPieces(container: [number, number], piece: [number, number]) {
  const grid = (w: number, h: number) => Math.floor((container[0] + 1e-9) / w) * Math.floor((container[1] + 1e-9) / h);
  const straight = grid(...piece), rotated = grid(piece[1], piece[0]);
  return { pieces: Math.max(straight, rotated), rotation: (rotated > straight ? 90 : 0) as 0 | 90 };
}

export interface CustomOffsetLayout {
  calcLabel: string;
  repeat: number;
  calcPiecesPerSheet: number;
  rotation: 0 | 90;
  unusedAreaPercent: number;
  piecesPerFullSheet: number;
  sheetBase: SheetBase;
  marginCm: number;
  printableWidthCm: number;
  printableHeightCm: number;
}

/** Use only configured sizes of the chosen paper base. Catalogue cutting counts remain authoritative,
 * taken from the existing cutting tables, which can include mixed cutting layouts. Quarter-sheet press: regular 35×50, gayer 33×44.
 * Reserve 1 cm on every edge. Maximise full-sheet yield; on ties prefer the smaller press sheet.
 */
export function resolveCustomOffsetSize(params: {
  realLabel: string; base: SheetBase; families: SizeFamilyInput[]; calcLabelOverride?: string;
}): CustomOffsetLayout {
  const piece = parseOffsetDimensions(params.realLabel);
  if (!piece) throw new SizeCalculationError('المقاس لازم يكون عرض×ارتفاع بالسنتيمتر وبأرقام أكبر من صفر');
  const full: [number, number] = params.base === 'GAYER' ? [66, 88] : [70, 100];
  const quarter: [number, number] = [full[0] / 2, full[1] / 2];
  const candidates: CustomOffsetLayout[] = [];
  for (const family of params.families.filter(f => f.base === params.base)) {
    for (const entry of family.entries) {
      if (params.calcLabelOverride && canonicalOffsetLabel(entry.label) !== canonicalOffsetLabel(params.calcLabelOverride)) continue;
      const size = parseOffsetDimensions(entry.label);
      if (!size || fitOffsetPieces(quarter, size).pieces < 1) continue;
      const printable: [number, number] = [size[0] - 2, size[1] - 2];
      if (printable[0] <= 0 || printable[1] <= 0) continue;
      const { pieces: repeat, rotation } = fitOffsetPieces(printable, piece);
      const count = Math.floor(entry.piecesPerSheet);
      if (!repeat || count < 1 || !Number.isFinite(count)) continue;
      candidates.push({ calcLabel: entry.label, repeat, calcPiecesPerSheet: count, rotation,
        piecesPerFullSheet: repeat * count, sheetBase: params.base,
        marginCm: 1, printableWidthCm: printable[0], printableHeightCm: printable[1],
        unusedAreaPercent: Math.max(0, (1 - repeat * piece[0] * piece[1] / (size[0] * size[1])) * 100) });
    }
  }
  candidates.sort((a,b) => b.piecesPerFullSheet - a.piecesPerFullSheet || (a.printableWidthCm + 2) * (a.printableHeightCm + 2) - (b.printableWidthCm + 2) * (b.printableHeightCm + 2) || a.unusedAreaPercent - b.unusedAreaPercent || a.calcLabel.localeCompare(b.calcLabel));
  if (!candidates.length) throw new SizeCalculationError('لا يوجد مقاس طباعة مناسب ضمن المقاسات المسجلة وحدود ماكينة ربع فرخ ونوع الورق المختار');
  return candidates[0];
}

/** Numbering is independently packed inside its 23×33 limit; no printing-sheet multiplier. */
export function resolveCustomOffsetNumbering(realLabel: string, families: SizeFamilyInput[], base: SheetBase, override?: string) {
  const piece = parseOffsetDimensions(realLabel);
  if (!piece) throw new SizeCalculationError('مقاس الترقيم غير صالح');
  const labels = override ? [override] : families.filter(f => f.base === base).flatMap(f => f.entries.map(e => e.label));
  const candidates = labels.flatMap(targetLabel => {
    const dimensions = parseOffsetDimensions(targetLabel);
    if (!dimensions || !fitOffsetPieces([23, 33], dimensions).pieces) return [];
    const { pieces: repeat } = fitOffsetPieces(dimensions, piece);
    return repeat ? [{ targetLabel, repeat }] : [];
  }).sort((a,b) => b.repeat - a.repeat || a.targetLabel.localeCompare(b.targetLabel));
  if (!candidates.length) throw new SizeCalculationError('المقاس لا يناسب ماكينة الترقيم 23×33');
  return candidates[0];
}
