import { pdfjs } from 'react-pdf'

/**
 * Configure the PDF.js worker once, bundled by Vite from the installed
 * `pdfjs-dist` (no CDN dependency, version stays locked to the package).
 * Imported for its side effect by the PDF viewer before any document loads.
 */
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

// cMaps (CJK glyphs) and standard fonts ship as directories that Vite can't
// bundle from a `new URL(...)`, so we load them from a CDN pinned to the exact
// installed PDF.js version. Most PDFs embed their fonts and never fetch these;
// this makes non-embedded / CJK documents render correctly in production.
const PDFJS_CDN = `https://unpkg.com/pdfjs-dist@${pdfjs.version}`

/** Options shared by every <Document>; keeps standard fonts/cmaps working. */
export const PDF_OPTIONS = {
  cMapUrl: `${PDFJS_CDN}/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${PDFJS_CDN}/standard_fonts/`,
} as const
