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
 */
export async function downloadDocumentAsPdf(filename: string): Promise<void> {
  const element = document.querySelector<HTMLElement>('.document-print-root');
  if (!element) {
    throw new Error('لا يوجد مستند لتصديره');
  }

  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas-pro')]);

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
  });

  const imageData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const imageWidth = pageWidth;
  const imageHeight = (canvas.height * imageWidth) / canvas.width;

  if (imageHeight <= pageHeight) {
    pdf.addImage(imageData, 'PNG', 0, 0, imageWidth, imageHeight);
  } else {
    // Longer documents (many line items) span more than one A4 page —
    // slice the tall canvas into page-sized chunks rather than shrinking
    // everything to fit (which would make small print unreadable).
    let renderedHeight = 0;
    let firstPage = true;
    while (renderedHeight < imageHeight) {
      if (!firstPage) pdf.addPage();
      pdf.addImage(imageData, 'PNG', 0, -renderedHeight, imageWidth, imageHeight);
      renderedHeight += pageHeight;
      firstPage = false;
    }
  }

  pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}
