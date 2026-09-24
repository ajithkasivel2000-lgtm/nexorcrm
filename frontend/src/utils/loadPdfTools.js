/**
 * Loads jsPDF and its table plugin, on demand.
 *
 * They are large and most sessions never export anything, so they stay out of
 * the main bundle and are fetched the first time someone asks for a PDF.
 *
 * The one place that goes wrong is worth naming. In development, a dependency
 * reached only through a dynamic import is unknown to Vite at startup: the
 * first export makes it discover these, re-run dependency optimisation, and
 * re-hash every pre-bundled module — so requests already in flight fail with
 * "504 (Outdated Optimize Dep)" and the export dies with
 * "Failed to fetch dynamically imported module", which means nothing to the
 * person who clicked Export.
 *
 * vite.config.js pre-bundles both so that cannot happen; this turns whatever
 * does go wrong — that, a stale cache, a dropped connection — into a sentence
 * someone can act on.
 */
export default async function loadPdfTools() {
  try {
    const [jspdf, autotable] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);

    // jspdf exports the class both ways depending on the build.
    const jsPDF = jspdf.jsPDF || jspdf.default;
    const autoTable = autotable.default || autotable.autoTable;

    if (!jsPDF || !autoTable) {
      throw new Error('The PDF tools loaded but look wrong.');
    }
    return { jsPDF, autoTable };
  } catch (error) {
    console.error('Could not load the PDF tools', error);
    throw new Error(
      'The PDF tools could not be loaded. Reload the page and try again — '
      + 'if it keeps happening, the dev server needs restarting.',
    );
  }
}
