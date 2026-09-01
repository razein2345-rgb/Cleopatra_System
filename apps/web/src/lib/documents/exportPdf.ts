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
 * Owner (2026-09-01, multi-turn real-document debugging with several
 * rounds of a real exported file, "لما نزل 13 بند... نزلي على ورقتين
 * والورقتين كأنهم الجزء اللي تحت اتقطع على الصفحة اللي بعده... لكن مينفعش
 * ترحل مني") — the original slicer cut the tall screenshot at a fixed
 * pixel height with zero awareness of content boundaries. Never cutting a
 * table row (or any `[data-pdf-atomic]` block) mid-page is a real fix
 * shared by every document type calling `downloadDocumentAsPdf` — always
 * on, no flag needed.
 *
 * Everything else below is opt-in via `{ enhanced: true }`. Owner
 * (2026-09-01, "بس انا مطلبتش تعدل ده في الفاتورة طلبت ده يحصل في عرض
 * السعر" — after `[data-pdf-repeat-footer]`/`[data-pdf-light-header]`/the
 * 1cm margin had already shipped and silently applied to every document
 * type through this one shared function) — confirmed explicitly: only the
 * Quotation gets the fuller letterhead treatment; Invoice/Work
 * Order/statements/reports keep the plain row-safe behavior only, calling
 * `downloadDocumentAsPdf(filename)` with no options. The enhanced design,
 * confirmed over several rounds against a real multi-item quotation:
 *   1. Every page — including the first — repeats the same bottom block:
 *      the stamp + closing line, *and* the business contact footer
 *      (address/email/phone/Facebook), stacked together
 *      (`[data-pdf-repeat-footer]`, confirmed explicitly: "كل الصفحات
 *      لازم يكون فيها... الختم والجملة اللي تحتيه... والإيميل، وأرقام
 *      التليفونات، وصفحة الفيس... يتكرر مع الختم تحت"). Both are excised
 *      from the normal flow and redrawn fresh at the bottom of every page,
 *      flush against the bottom margin regardless of how short the body
 *      content is ("أياً يكن عدد البنود حتى لو بند واحد... تكون في أسفل
 *      الصفحة دايماً").
 *   2. A continuation page's top repeat is a *light* header
 *      (`[data-pdf-light-header]` — logo/business name — plus the table's
 *      own column-header row), never the full first-page header (customer
 *      name/salutation/title only make sense once, on page 1).
 *   3. The trailing block after the table (totals → signature) must end
 *      up on the SAME page as at least one real item row — never alone on
 *      an item-less page — even if that means showing fewer items on the
 *      final page than would otherwise fit ("لو هتضطر ترحل بند او اتنين
 *      اعمل كده... شرط... يكون فيها على الأقل بند واحد"). The forward fill
 *      is already maximally dense, so this only ever merges the final page
 *      backward into whichever page holds the nearest item.
 *   4. A real 1cm margin on all four sides ("محتاجين 1سم فوق وتحت ويمين
 *      وشمال فاضي علشان الكتابة متبوظش") — printers have their own
 *      unprintable edge, so content drawn flush to the page edge risks
 *      being physically clipped.
 */
const MARGIN_MM = 10;

export interface DownloadPdfOptions {
  /**
   * Quotation-only letterhead treatment (see this file's own doc comment):
   * 1cm margins, the stamp/closing-line + contact footer repeated at the
   * bottom of every page, a light logo/name header repeated on
   * continuation pages, and the "final page always has ≥1 item" guarantee.
   * Every other document type (Invoice, Work Order, customer/supplier
   * statements, reports) omits this and keeps only the shared row-safe
   * pagination — explicit owner decision, not an oversight.
   */
  enhanced?: boolean;
}

export async function downloadDocumentAsPdf(filename: string, options: DownloadPdfOptions = {}): Promise<void> {
  const element = document.querySelector<HTMLElement>('.document-print-root');
  if (!element) {
    throw new Error('لا يوجد مستند لتصديره');
  }
  const enhanced = options.enhanced ?? false;
  const marginMm = enhanced ? MARGIN_MM : 0;

  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas-pro')]);

  const containerRect = element.getBoundingClientRect();
  const rectOf = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return { top: r.top - containerRect.top, bottom: r.bottom - containerRect.top };
  };

  // Table rows and `[data-pdf-atomic]` blocks must never be sliced across
  // a page boundary, in every mode — measured in the live DOM, in CSS px
  // relative to the container's own top, before the screenshot flattens
  // everything into one raster image.
  const tableRowRectsCss = Array.from(element.querySelectorAll<HTMLElement>('table tr')).map(rectOf);
  const atomicRectsCss = Array.from(element.querySelectorAll<HTMLElement>('[data-pdf-atomic]')).map(rectOf);
  const theadRow = element.querySelector<HTMLElement>('table thead tr');
  const theadRectCss = theadRow ? rectOf(theadRow) : null;
  // The continuation-page header when not `enhanced` (or when this
  // document has no `[data-pdf-light-header]` at all) — everything from
  // the very top through the table's own header row.
  const legacyHeaderHeightCss = theadRectCss ? theadRectCss.bottom : 0;

  // Enhanced-only measurements — cheap to always compute, only ever used
  // below when `enhanced` is true.
  const lightHeaderEl = element.querySelector<HTMLElement>('[data-pdf-light-header]');
  const lightHeaderRectCss = lightHeaderEl ? rectOf(lightHeaderEl) : null;
  // Both the stamp/closing-line block and the contact footer carry this
  // marker — repeated together, in DOM order, at the bottom of every page.
  const repeatFooterRectsCss = enhanced
    ? Array.from(element.querySelectorAll<HTMLElement>('[data-pdf-repeat-footer]')).map(rectOf)
    : [];
  // Outside `enhanced` mode, `[data-pdf-repeat-footer]` blocks (the stamp
  // and contact footer) simply flow normally with everything else — still
  // protected from being split mid-block like any other atomic content.
  const repeatFooterAsAtomicCss = enhanced
    ? []
    : Array.from(element.querySelectorAll<HTMLElement>('[data-pdf-repeat-footer]')).map(rectOf);

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
  });

  // Measured, not assumed — html2canvas's actual output resolution can
  // differ slightly from a naive `scale`-only calculation (device pixel
  // ratio, sub-pixel layout rounding).
  const canvasPxPerCssPx = canvas.width / containerRect.width;
  const toPx = (v: number) => v * canvasPxPerCssPx;
  const toRectPx = (r: { top: number; bottom: number }) => ({ top: toPx(r.top), bottom: toPx(r.bottom) });

  let tableRowRects = tableRowRectsCss.map(toRectPx);
  let atomicRects = [...atomicRectsCss, ...repeatFooterAsAtomicCss].map(toRectPx);
  const lightHeaderPx = enhanced && lightHeaderRectCss ? toRectPx(lightHeaderRectCss) : null;
  const theadPx = theadRectCss ? toRectPx(theadRectCss) : null;
  const legacyHeaderHeightPx = toPx(legacyHeaderHeightCss);
  const repeatFooterRegions = repeatFooterRectsCss.map(toRectPx).filter((r) => r.bottom > r.top);

  // Excise every repeat-footer region from the normal flow entirely
  // (they're redrawn fresh on every page below, never as part of a body
  // slice) — stitch the canvas back together without those slices, and
  // shift every boundary that sat below each one up to match. Only
  // happens in `enhanced` mode (`repeatFooterRegions` is empty otherwise).
  let flowCanvas = canvas;
  if (repeatFooterRegions.length > 0) {
    flowCanvas = exciseRegions(canvas, repeatFooterRegions);
    const shift = (v: number) => shiftPastExcised(v, repeatFooterRegions);
    const inAnyRegion = (b: { top: number; bottom: number }) => repeatFooterRegions.some((r) => b.top < r.bottom && b.bottom > r.top);
    const shiftBoundary = (b: { top: number; bottom: number }) => ({ top: shift(b.top), bottom: shift(b.bottom) });
    tableRowRects = tableRowRects.filter((b) => !inAnyRegion(b)).map(shiftBoundary);
    atomicRects = atomicRects.filter((b) => !inAnyRegion(b)).map(shiftBoundary);
  }
  // Everything that must never be sliced mid-block — rows first, then
  // atomic blocks; order doesn't matter for the snapping logic below.
  const noSplitBoundaries = [...tableRowRects, ...atomicRects];
  // Real item rows only (excludes the table's own thead row) — used to
  // guarantee the final page always has at least one, never just the
  // trailing block alone. Enhanced-only concern.
  const itemRowRects = theadPx ? tableRowRects.filter((r) => r.top !== theadPx.top) : tableRowRects;

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidthMm = pdf.internal.pageSize.getWidth();
  const pageHeightMm = pdf.internal.pageSize.getHeight();
  const contentWidthMm = pageWidthMm - marginMm * 2;
  const contentHeightMm = pageHeightMm - marginMm * 2;
  const mmPerCanvasPx = contentWidthMm / flowCanvas.width;
  const pageContentHeightPx = contentHeightMm / mmPerCanvasPx;

  // The continuation-page top repeat: light header + the table's own
  // column-header row, composed into one image (they're not adjacent in
  // the original layout — the customer/title block sits between them and
  // is deliberately skipped). Falls back to "everything through the table
  // header" outside `enhanced` mode, or when this document has no
  // `[data-pdf-light-header]` at all.
  let continuationHeaderCanvas: HTMLCanvasElement | null = null;
  if (lightHeaderPx && theadPx) {
    continuationHeaderCanvas = composeCanvas(flowCanvas, [
      { sy: lightHeaderPx.top, sh: lightHeaderPx.bottom - lightHeaderPx.top },
      { sy: theadPx.top, sh: theadPx.bottom - theadPx.top },
    ]);
  } else if (legacyHeaderHeightPx > 0) {
    continuationHeaderCanvas = cropCanvas(flowCanvas, 0, legacyHeaderHeightPx);
  }
  let continuationHeaderHeightPx = continuationHeaderCanvas?.height ?? 0;

  const repeatFooterCanvas =
    repeatFooterRegions.length > 0
      ? composeCanvas(
          canvas,
          repeatFooterRegions.map((r) => ({ sy: r.top, sh: r.bottom - r.top })),
        )
      : null;
  let repeatFooterHeightPx = repeatFooterCanvas?.height ?? 0;

  // If the repeated header+footer together would leave no real room for
  // any body content (a degenerate, unrealistically huge logo/stamp
  // config), give up on repeating them rather than produce a garbage
  // many-page PDF.
  if (continuationHeaderHeightPx + repeatFooterHeightPx >= pageContentHeightPx * 0.9) {
    continuationHeaderHeightPx = 0;
    repeatFooterHeightPx = 0;
  }

  const drawImageAt = (dataUrl: string, xMm: number, yMm: number, wMm: number, hMm: number) => {
    pdf.addImage(dataUrl, 'PNG', marginMm + xMm, marginMm + yMm, wMm, hMm);
  };
  // Owner (2026-09-01, "أياً يكن عدد البنود حتى لو بند واحد الحاجات دي
  // تكون في أسفل الصفحة دايماً... مع مراعاة الـ1سم") — the repeated footer
  // always sits flush against the bottom margin, on every page, not just
  // wherever the body content happens to end. A short document (e.g. a
  // 3-item invoice) leaves real blank space between its last line and the
  // footer instead of the footer floating up right beneath it.
  const footerHeightMm = repeatFooterHeightPx * mmPerCanvasPx;
  const footerYMm = contentHeightMm - footerHeightMm;
  const drawFooter = () => {
    if (!repeatFooterCanvas) return;
    drawImageAt(repeatFooterCanvas.toDataURL('image/png'), 0, footerYMm, contentWidthMm, footerHeightMm);
  };

  const singlePageBudgetPx = pageContentHeightPx - repeatFooterHeightPx;
  if (flowCanvas.height <= singlePageBudgetPx) {
    drawImageAt(flowCanvas.toDataURL('image/png'), 0, 0, contentWidthMm, flowCanvas.height * mmPerCanvasPx);
    drawFooter();
    pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
    return;
  }

  // More than one page is needed. Fill pages forward, greedily and as
  // densely as possible — this is what keeps every page but the last as
  // full as it can be, instead of a backward-reserved split starving
  // whichever page sits right before the trailing block.
  const pages: { start: number; end: number }[] = [];
  {
    let cursor = 0;
    let isFirstPage = true;
    while (cursor < flowCanvas.height - 1) {
      const availableHeightPx = Math.max(1, pageContentHeightPx - repeatFooterHeightPx - (isFirstPage ? 0 : continuationHeaderHeightPx));
      const naiveBreakPoint = Math.min(cursor + availableHeightPx, flowCanvas.height);
      let breakPoint = naiveBreakPoint;
      for (const b of noSplitBoundaries) {
        if (b.top > cursor && b.top < breakPoint && b.bottom > breakPoint) breakPoint = b.top;
      }
      // A single block taller than one whole page can't be moved above
      // `cursor` — fall back to the naive cut. Absolute last resort:
      // guarantee forward progress no matter what (avoids ever hanging).
      if (breakPoint <= cursor) breakPoint = naiveBreakPoint;
      if (breakPoint <= cursor) breakPoint = Math.min(cursor + 1, flowCanvas.height);

      pages.push({ start: cursor, end: breakPoint });
      cursor = breakPoint;
      isFirstPage = false;
    }
  }

  // Owner (2026-09-01, "لو علشان يظهروا هتضطر ترحل بند او اتنين اعمل
  // كده... شرط... يكون فيها على الأقل بند واحد") — enhanced-only: the
  // trailing block (totals → signature) must never end up alone on a page
  // with zero real item rows. The forward fill above is already maximally
  // dense, so this only ever needs to *merge* the last page backward into
  // whichever page holds the nearest item — never rebuild the whole
  // layout, and never leave an earlier page starved the way reserving the
  // split point up front would.
  if (enhanced) {
    while (pages.length > 1 && !itemRowRects.some((r) => r.top >= pages[pages.length - 1]!.start)) {
      const removed = pages.pop()!;
      pages[pages.length - 1]!.end = removed.end;
    }
  }

  let firstPage = true;
  for (const page of pages) {
    if (!firstPage) pdf.addPage();
    let yMm = 0;
    if (!firstPage && continuationHeaderCanvas && continuationHeaderHeightPx > 0) {
      drawImageAt(continuationHeaderCanvas.toDataURL('image/png'), 0, 0, contentWidthMm, continuationHeaderHeightPx * mmPerCanvasPx);
      yMm = continuationHeaderHeightPx * mmPerCanvasPx;
    }
    const bodyCanvas = cropCanvas(flowCanvas, page.start, page.end - page.start);
    drawImageAt(bodyCanvas.toDataURL('image/png'), 0, yMm, contentWidthMm, (page.end - page.start) * mmPerCanvasPx);
    drawFooter();
    firstPage = false;
  }

  pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}

/** Crops `[sy, sy+sh)` out of `source` into a new same-width canvas — used to split the one full-document screenshot into repeatable header/footer slices and per-page body slices without redrawing the DOM. */
function cropCanvas(source: HTMLCanvasElement, sy: number, sh: number): HTMLCanvasElement {
  const cropped = document.createElement('canvas');
  cropped.width = source.width;
  cropped.height = Math.max(1, Math.round(sh));
  const ctx = cropped.getContext('2d');
  if (ctx) ctx.drawImage(source, 0, sy, source.width, sh, 0, 0, source.width, sh);
  return cropped;
}

/** Removes every `[top, bottom)` region in `regions` (sorted ascending, non-overlapping) from `source`, stitching the remaining slices back together with no gaps — used to pull the repeat-footer blocks out of the normal document flow so they never also appear at their original in-flow position. */
function exciseRegions(source: HTMLCanvasElement, regions: { top: number; bottom: number }[]): HTMLCanvasElement {
  const totalRemoved = regions.reduce((sum, r) => sum + (r.bottom - r.top), 0);
  const result = document.createElement('canvas');
  result.width = source.width;
  result.height = Math.max(1, Math.round(source.height - totalRemoved));
  const ctx = result.getContext('2d');
  if (ctx) {
    let srcY = 0;
    let dstY = 0;
    for (const r of regions) {
      const sh = r.top - srcY;
      if (sh > 0) {
        ctx.drawImage(source, 0, srcY, source.width, sh, 0, dstY, source.width, sh);
        dstY += sh;
      }
      srcY = r.bottom;
    }
    const tailSh = source.height - srcY;
    if (tailSh > 0) ctx.drawImage(source, 0, srcY, source.width, tailSh, 0, dstY, source.width, tailSh);
  }
  return result;
}

/** Maps a canvas-space y-coordinate from before `exciseRegions` ran to the equivalent coordinate after — subtracts the height of every excised region that sat entirely above it. */
function shiftPastExcised(value: number, regions: { top: number; bottom: number }[]): number {
  let shift = 0;
  for (const r of regions) {
    if (value >= r.bottom) shift += r.bottom - r.top;
  }
  return value - shift;
}

/** Stacks several non-contiguous crops of `source` into one new canvas, back to back with no gap — used to compose the continuation-page header (light header + table column-header row) from two pieces that aren't adjacent in the original layout. */
function composeCanvas(source: HTMLCanvasElement, pieces: { sy: number; sh: number }[]): HTMLCanvasElement {
  const totalHeight = Math.max(1, Math.round(pieces.reduce((sum, p) => sum + p.sh, 0)));
  const result = document.createElement('canvas');
  result.width = source.width;
  result.height = totalHeight;
  const ctx = result.getContext('2d');
  if (ctx) {
    let dy = 0;
    for (const piece of pieces) {
      ctx.drawImage(source, 0, piece.sy, source.width, piece.sh, 0, dy, source.width, piece.sh);
      dy += piece.sh;
    }
  }
  return result;
}
