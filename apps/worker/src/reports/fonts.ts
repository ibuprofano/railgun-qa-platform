import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** The report fonts (ADR 0026), fetched by `npm run fonts -w apps/worker` (ADR 0027). */
export const REPORT_FONT_FILES = {
  body: 'NotoSansJP-Regular.otf',
  bodyBold: 'NotoSansJP-Bold.otf',
  mono: 'NotoSansMonoCJKjp-Regular.otf',
} as const;

export const FONTS_MISSING_MESSAGE = 'Report fonts are not installed';

/** Where the fonts live: REPORT_FONTS_DIR, else apps/worker/fonts. */
export function reportFontsDir(): string {
  return resolve(process.env.REPORT_FONTS_DIR ?? join(__dirname, '..', '..', 'fonts'));
}

/** The font files that are missing, empty when the worker can render reports. */
export function missingReportFonts(dir = reportFontsDir()): string[] {
  return Object.values(REPORT_FONT_FILES).filter((file) => !existsSync(join(dir, file)));
}
