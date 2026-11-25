import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { FONTS_MISSING_MESSAGE, missingReportFonts, REPORT_FONT_FILES, reportFontsDir } from './fonts';

/** ADR 0026 decision 3: a report job's render may take at most 30 seconds. */
export const RENDER_TIMEOUT_MS = 30_000;

export class RenderTimeoutError extends Error {}

/**
 * Renders a pdfmake document definition in its own thread (report-pipeline design.md
 * decision 5): pdfmake renders synchronously, so only a separate thread can be stopped at
 * the timeout, and the worker's event loop stays free meanwhile.
 */
export async function renderPdf(definition: unknown, timeoutMs = RENDER_TIMEOUT_MS): Promise<Buffer> {
  const fontsDir = reportFontsDir();
  if (missingReportFonts(fontsDir).length > 0) {
    throw new Error(FONTS_MISSING_MESSAGE);
  }
  const worker = new Worker(join(__dirname, 'pdf-thread.js'), {
    workerData: { definition, fontsDir, fonts: REPORT_FONT_FILES },
  });
  try {
    return await new Promise<Buffer>((resolvePromise, reject) => {
      const timer = setTimeout(() => reject(new RenderTimeoutError(`report rendering took longer than ${timeoutMs / 1000} s`)), timeoutMs);
      worker.once('message', (message: { bytes?: Uint8Array; error?: string }) => {
        clearTimeout(timer);
        if (message.error !== undefined) reject(new Error(message.error));
        else resolvePromise(Buffer.from(message.bytes!));
      });
      worker.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      worker.once('exit', (code) => {
        clearTimeout(timer);
        if (code !== 0) reject(new Error(`report render thread exited with code ${code}`));
      });
    });
  } finally {
    await worker.terminate();
  }
}
