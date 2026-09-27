import { chromium, type Browser } from 'playwright-core';

/**
 * Launch Chromium in whichever environment we happen to be in.
 *
 * Locally the browser comes from the `playwright` package's downloaded
 * binaries. On Vercel there are none: the full `playwright` package bundles
 * roughly 400MB of browsers, well past the 250MB unzipped function limit, so
 * the runtime uses `@sparticuz/chromium` — a Chromium build compiled for
 * Lambda-style environments — and `playwright-core`, which ships no binaries.
 *
 * Both paths go through `playwright-core`, so the pool and collector code is
 * identical in either place.
 */

const BASE_ARGS = [
  '--disable-dev-shm-usage',
  '--no-sandbox',
  '--disable-blink-features=AutomationControlled',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
];

export const isServerless = (): boolean =>
  !!process.env['VERCEL'] || !!process.env['AWS_LAMBDA_FUNCTION_NAME'];

/**
 * Resolve the local Chromium that `npx playwright install` downloaded.
 *
 * `playwright` is a devDependency, so this import must stay dynamic — on
 * Vercel the package is absent and a static import would fail the build.
 */
async function localExecutablePath(): Promise<string | undefined> {
  // Explicit override, e.g. when the machine's policy blocks Playwright's
  // full chrome.exe but allows the headless shell or an installed Chrome.
  if (process.env['CHROME_EXECUTABLE_PATH']) return process.env['CHROME_EXECUTABLE_PATH'];
  try {
    const pw = (await import('playwright')) as unknown as {
      chromium: { executablePath(): string };
    };
    return pw.chromium.executablePath();
  } catch {
    // Not installed: fall through and let playwright-core try its own default,
    // which is right when PLAYWRIGHT_BROWSERS_PATH is configured.
    return undefined;
  }
}

export async function launchBrowser(): Promise<Browser> {
  if (isServerless()) {
    const mod = (await import('@sparticuz/chromium')) as unknown as {
      default?: SparticuzChromium;
    } & SparticuzChromium;
    const sparticuz = mod.default ?? mod;

    return chromium.launch({
      headless: true,
      executablePath: await sparticuz.executablePath(),
      args: [...sparticuz.args, ...BASE_ARGS],
    });
  }

  return chromium.launch({
    headless: true,
    executablePath: await localExecutablePath(),
    args: BASE_ARGS,
  });
}

interface SparticuzChromium {
  args: string[];
  executablePath(input?: string): Promise<string>;
}
