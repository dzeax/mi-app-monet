import { existsSync } from 'node:fs';
import { join } from 'node:path';

import chromium from '@sparticuz/chromium';
import type { Browser, PuppeteerLaunchOptions } from 'puppeteer-core';
import puppeteerCore from 'puppeteer-core';

type PuppeteerModule = typeof import('puppeteer');

const VIEWPORT_WIDTH = 600;
const VIEWPORT_HEIGHT = 900;
const MAX_VIEWPORT_HEIGHT = 1600;

const LOCAL_CHROME_ARGS = [
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--disable-setuid-sandbox',
  '--no-sandbox',
  '--no-zygote',
  '--single-process',
];

function resolveLocalChromeExecutable(): string | null {
  if (process.env.CHROME_EXECUTABLE_PATH) {
    const manualPath = process.env.CHROME_EXECUTABLE_PATH.trim();
    if (manualPath && existsSync(manualPath)) {
      return manualPath;
    }
  }

  if (process.platform === 'win32') {
    const programFiles = process.env['PROGRAMFILES'] ?? 'C:\\Program Files';
    const programFilesX86 = process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)';
    const localAppData = process.env['LOCALAPPDATA'] ?? join(process.env['USERPROFILE'] ?? 'C:\\', 'AppData', 'Local');

    const candidates = [
      join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate;
    }
  }

  if (process.platform === 'darwin') {
    const candidates = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate;
    }
  }

  if (process.platform === 'linux') {
    const candidates = [
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/snap/bin/chromium',
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate;
    }
  }

  return null;
}

function resolveBundledChromiumExecutable(puppeteer: PuppeteerModule): string | null {
  try {
    const executablePath = typeof puppeteer.executablePath === 'function' ? puppeteer.executablePath() : null;
    if (executablePath && existsSync(executablePath)) {
      return executablePath;
    }
  } catch (error) {
    console.warn('[ai:screenshot] Unable to use Puppeteer bundled Chromium', error);
  }

  return null;
}

async function launchLocalChrome(): Promise<Browser | null> {
  try {
    const maybeModule = (await import('puppeteer')) as PuppeteerModule & { default?: PuppeteerModule };
    const puppeteer = maybeModule.default ?? maybeModule;

    const executablePath = resolveLocalChromeExecutable() ?? resolveBundledChromiumExecutable(puppeteer) ?? undefined;

    const launchOptions: PuppeteerLaunchOptions = {
      headless: true,
      defaultViewport: {
        width: VIEWPORT_WIDTH,
        height: VIEWPORT_HEIGHT,
        deviceScaleFactor: 1,
      },
      args: LOCAL_CHROME_ARGS,
      ...(executablePath ? { executablePath } : {}),
    };

    return await puppeteer.launch(launchOptions);
  } catch (error) {
    console.warn('[ai:screenshot] Failed to launch local Chrome instance', error);
    return null;
  }
}

async function launchBrowser(): Promise<Browser | null> {
  const localChrome = await launchLocalChrome();
  if (localChrome) return localChrome;

  try {
    const executablePath = await chromium.executablePath();
    if (!executablePath) {
      console.warn('[ai:screenshot] Chromium executable path is unavailable in this environment');
      return null;
    }

    const launchOptions: PuppeteerLaunchOptions = {
      args: chromium.args,
      defaultViewport: {
        width: VIEWPORT_WIDTH,
        height: VIEWPORT_HEIGHT,
        deviceScaleFactor: 1,
      },
      executablePath,
      headless: chromium.headless,
    };

    return await puppeteerCore.launch(launchOptions);
  } catch (error) {
    console.warn('[ai:screenshot] Failed to launch Chromium instance', error);
    return null;
  }
}

function normalizeHtmlDocument(html: string): string {
  if (/<html[\s>]/i.test(html)) {
    return html;
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body>${html}</body></html>`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export async function captureEmailScreenshot(html: string): Promise<string | null> {
  const browser = await launchBrowser();
  if (!browser) return null;

  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: VIEWPORT_WIDTH,
      height: VIEWPORT_HEIGHT,
      deviceScaleFactor: 1,
    });

    await page.setContent(normalizeHtmlDocument(html), {
      waitUntil: ['domcontentloaded', 'networkidle0'],
    });

    try {
      await page.waitForNetworkIdle({ idleTime: 500, timeout: 5000 });
    } catch {
      await page.waitForTimeout(500);
    }

    const { contentHeight } = await page.evaluate(() => {
      const doc = document.documentElement;
      const body = document.body;
      const height = Math.max(
        doc?.scrollHeight ?? 0,
        body?.scrollHeight ?? 0,
        doc?.offsetHeight ?? 0,
        body?.offsetHeight ?? 0,
        window.innerHeight ?? 0
      );

      window.scrollTo(0, 0);

      if (body) {
        body.style.margin = '0';
        body.style.background = body.style.background || '#ffffff';
      }
      if (doc) {
        doc.style.margin = '0';
        doc.style.background = doc.style.background || '#ffffff';
      }

      return { contentHeight: height };
    });

    const targetHeight = clamp(Math.round(contentHeight), VIEWPORT_HEIGHT, MAX_VIEWPORT_HEIGHT);
    if (targetHeight !== VIEWPORT_HEIGHT) {
      await page.setViewport({
        width: VIEWPORT_WIDTH,
        height: targetHeight,
        deviceScaleFactor: 1,
      });
    }

    await page.evaluate(() => window.scrollTo(0, 0));

    const screenshot = await page.screenshot({
      type: 'png',
      clip: {
        x: 0,
        y: 0,
        width: VIEWPORT_WIDTH,
        height: targetHeight,
      },
      encoding: 'base64',
    });

    await page.close();
    return typeof screenshot === 'string' ? screenshot : screenshot.toString('base64');
  } catch (error) {
    console.warn('[ai:screenshot] Failed to capture HTML preview', error);
    return null;
  } finally {
    await browser.close();
  }
}
