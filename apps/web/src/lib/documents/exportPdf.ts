/**
 * UX_PRODUCT_AUDIT.md § مشكلة 9.1 ("طباعة فقط عن طريق window.print()، مفيش
 * تصدير PDF") — a real one-click PDF file (attachable to WhatsApp/email),
 * not just relying on the user finding "Save as PDF" inside their own
 * browser's print dialog.
 *
 * Deliberately screenshots `.document-print-root` (the same on-screen
 * preview element `DocumentRenderer.tsx` already renders, and the only
 * element the existing `@media print` CSS keeps visible — see its own doc
 * comment) into a raster image rather than building the PDF from text.
 * This was the pragmatic call over two alternatives that were ruled out
 * after checking what's already installed/deployed:
 *   - A server-side renderer (Puppeteer/Playwright) would need Render's API
 *     service, which deploys as a native-Node runtime (`render.yaml`), to
 *     ship a full headless-Chromium install — a heavy, deploy-risking
 *     dependency for a "quick win"-tier item.
 *   - Building the PDF from real selectable text (jsPDF's own text API)
 *     needs manual RTL/Arabic layout and font embedding from scratch —
 *     none of that exists anywhere in this codebase yet.
 * Screenshotting the already-correct, already-RTL-laid-out DOM sidesteps
 * both problems entirely, at the cost of the PDF text not being
 * selectable/searchable — an acceptable trade for a printed invoice.
 *
 * `jspdf`/`html2canvas-pro` are loaded via dynamic `import()`, not a static
 * top-of-file import — UX_PRODUCT_AUDIT.md § مشكلة 12.1 already flags this
 * app's single ~1.25MB bundle with no code splitting; these two libraries
 * alone add ~600KB, and the overwhelming majority of page loads never
 * touch a document page's "تنزيل PDF" button at all.
 *
 * Owner (2026-08-23, "مفيش اوبشن تصدير Pdf دايركت للفاتورة... Attempting
 * to parse an unsupported color function 'oklab'") — plain `html2canvas`
 * (last meaningfully maintained before OKLCH/OKLAB became common) can't
 * read the CSS color functions Tailwind v4's own theme is built on, so
 * every export threw the moment it tried to screenshot any themed
 * element. Swapped for `html2canvas-pro`, a drop-in fork with the exact
 * same API that adds oklch/oklab/lab/color-mix support — no other line in
 * this file changes.
 *
 * Owner (2026-09-01, "لما نزل 13 بند... نزلي على ورقتين والورقتين كأنهم
 * الجزء اللي تحت اتقطع على الصفحة اللي بعده... عايزه لما يكون مفيش مساحة
 * يخليه على ورقتين، الورقة التانية فيها اللوجو والهيدر والليتر وكل حاجه...
 * لكن مينفعش ترحل مني") — the original slicer cut the tall screenshot at a
 * fixed pixel height with zero awareness of where table rows actually sit,
 * so a row straddling that line printed half on each page, and page 2
 * showed a bare mid-table crop instead of repeating the letterhead. Fixed
 * by measuring each table row's real position in the live DOM (before
 * screenshotting) and only ever breaking the page just above a row that
 * would otherwise straddle the cut — and by cropping the letterhead block
 * (everything through the table's own column-header row) into its own
 * image, redrawn at the top of every continuation page.
 */
export async function downloadDocumentAsPdf(filename: string): Promise<void> {
  const element = document.querySelector<HTMLElement>('.document-print-root');
  if (!element) {
    throw new Error('لا يوجد مستند لتصديره');
  }

  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas-pro')]);

  const containerRect = element.getBoundingClientRect();

  // Rows (and the table's own header row) must never be sliced across a
  // page boundary — measured in the live DOM, in CSS px relative to the
  // container's own top, before the screenshot flattens everything into
  // one raster image.
  const rowBoundariesCss = Array.from(element.querySelectorAll<HTMLElement>('table tr')).map((row) => {
    const r = row.getBoundingClientRect();
    return { top: r.top - containerRect.top, bottom: r.bottom - containerRect.top };
  });

  // The letterhead block to repeat on every continuation page: everything
  // from the top through the table's own column-header row (business name/
  // logo, customer/date block, "م / البيان / الكمية / ..." row) — not the
  // item rows themselves.
  const headerRow = element.querySelector<HTMLElement>('table thead tr');
  const headerHeightCss = headerRow ? headerRow.getBoundingClientRect().bottom - containerRect.top : 0;

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
  });

  // Measured, not assumed — html2canvas's actual output resolution can
  // differ slightly from a naive `scale`-only calculation (device pixel
  // ratio, sub-pixel layout rounding).
  const canvasPxPerCssPx = canvas.width / containerRect.width;
  const rowBoundaries = rowBoundariesCss.map((b) => ({ top: b.top * canvasPxPerCssPx, bottom: b.bottom * canvasPxPerCssPx }));
  const headerHeightPx = headerHeightCss * canvasPxPerCssPx;

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidthMm = pdf.internal.pageSize.getWidth();
  const pageHeightMm = pdf.internal.pageSize.getHeight();
  const mmPerCanvasPx = pageWidthMm / canvas.width;
  const pageHeightPx = pageHeightMm / mmPerCanvasPx;

  if (canvas.height * mmPerCanvasPx <= pageHeightMm) {
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pageWidthMm, canvas.height * mmPerCanvasPx);
    pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
    return;
  }

  // Longer documents (many line items) span more than one A4 page — slice
  // the tall canvas into page-sized chunks rather than shrinking everything
  // to fit (which would make small print unreadable).
  //
  // If the letterhead itself doesn't fit on a page (an unrealistically
  // huge logo/header config), repeating it would leave no room for any
  // body content and force near-zero-height slices for the rest of the
  // document — give up on repeating it rather than produce a garbage
  // thousand-page PDF.
  const effectiveHeaderHeightPx = headerHeightPx < pageHeightPx * 0.9 ? headerHeightPx : 0;
  let cursor = 0;
  let firstPage = true;
  while (cursor < canvas.height - 1) {
    // Guard against a degenerate letterhead taller than a whole page (an
    // unusually large logo/header config) — without this floor, a
    // continuation page's `availableHeightPx` could go zero or negative
    // and the loop would never advance `cursor`, hanging the export.
    const availableHeightPx = Math.max(1, firstPage ? pageHeightPx : pageHeightPx - effectiveHeaderHeightPx);
    const naiveBreakPoint = Math.min(cursor + availableHeightPx, canvas.height);
    let breakPoint = naiveBreakPoint;

    // Never cut through a row: if one straddles the naive break point,
    // pull the break back to just above it instead.
    for (const row of rowBoundaries) {
      if (row.top > cursor && row.top < breakPoint && row.bottom > breakPoint) {
        breakPoint = row.top;
      }
    }
    // A single row taller than one whole page can't be moved above
    // `cursor` — fall back to the naive cut so this never loops forever.
    if (breakPoint <= cursor) breakPoint = naiveBreakPoint;
    // Absolute last resort: guarantee forward progress no matter what.
    if (breakPoint <= cursor) breakPoint = Math.min(cursor + 1, canvas.height);

    if (!firstPage) pdf.addPage();

    let yMm = 0;
    if (!firstPage && effectiveHeaderHeightPx > 0) {
      const headerCanvas = cropCanvas(canvas, 0, effectiveHeaderHeightPx);
      pdf.addImage(headerCanvas.toDataURL('image/png'), 'PNG', 0, 0, pageWidthMm, effectiveHeaderHeightPx * mmPerCanvasPx);
      yMm = effectiveHeaderHeightPx * mmPerCanvasPx;
    }

    const bodyCanvas = cropCanvas(canvas, cursor, breakPoint - cursor);
    pdf.addImage(bodyCanvas.toDataURL('image/png'), 'PNG', 0, yMm, pageWidthMm, (breakPoint - cursor) * mmPerCanvasPx);

    cursor = breakPoint;
    firstPage = false;
  }

  pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}

/** Crops `[sy, sy+sh)` out of `source` into a new same-width canvas — used to split the one full-document screenshot into a repeatable header slice and per-page body slices without redrawing the DOM. */
function cropCanvas(source: HTMLCanvasElement, sy: number, sh: number): HTMLCanvasElement {
  const cropped = document.createElement('canvas');
  cropped.width = source.width;
  cropped.height = Math.max(1, Math.round(sh));
  const ctx = cropped.getContext('2d');
  if (ctx) ctx.drawImage(source, 0, sy, source.width, sh, 0, 0, source.width, sh);
  return cropped;
}
