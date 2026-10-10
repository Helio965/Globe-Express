#!/usr/bin/env node
/**
 * Authentic documentation capture against an already running World Explorer.
 * No request interception, fixtures, application changes, or TLS exceptions.
 *
 * node scripts/capture-demo.mjs --record --manifest /tmp/globe-demo/capture-manifest.json
 * WORLD_EXPLORER_URL=https://example.org CHROMIUM_PATH=/usr/bin/chromium node scripts/capture-demo.mjs
 */
import { chromium } from "@playwright/test";
import { access, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { spawn } from "node:child_process";
import { once } from "node:events";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaults = {
  url: process.env.WORLD_EXPLORER_URL || "http://127.0.0.1:3000",
  query: "Lisboa",
  output: join(repository, "docs/media/screenshots"),
  manifest: join(repository, "docs/media/capture-manifest.json"),
  heroPhoto: 2,
  timeout: 60_000,
};

function help() {
  console.log(`Capture screenshots of the real application; add --record for a 94-second usable demonstration.

Usage: node scripts/capture-demo.mjs [options]
  --url URL           Running application (default: ${defaults.url})
  --query TEXT        Real search query (default: Lisboa)
  --output PATH       Screenshot directory (default: docs/media/screenshots)
  --manifest PATH     JSON scene timings and provider credits
  --raw-dir PATH      Parent directory for a unique raw recording directory (default: OS temporary directory)
  --hero-photo N      Initial gallery photograph, counting from 1 (default: 2)
  --timeout MS        Per-operation deadline (default: 60000)
  --record            Record desktop browser and hold explanatory scenes
  --headed            Use a visible browser when a display is available
  --overwrite         Explicitly permit replacement of these screenshots and the manifest
  --help              Show this help

Requires npm ci, a running server, real provider access, and Chromium.
CHROMIUM_PATH selects an installed Chromium; /usr/bin/chromium is detected automatically.
This workflow omits the Google map. No 03-map.png is created.
Recording requires FFmpeg on PATH (or FFMPEG_PATH). Chromium sends genuine compositor
frames through CDP; FFmpeg timestamps them at 30 FPS in a temporary H.264 MP4.
scripts/render-demo.mjs removes setup segments and creates the final subtitled MP4.`);
}

function optionsFromArgs(args) {
  const options = { ...defaults, record: false, headed: false, overwrite: false };
  const values = { "--url": "url", "--query": "query", "--output": "output", "--manifest": "manifest", "--raw-dir": "rawDir", "--hero-photo": "heroPhoto", "--timeout": "timeout" };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help") { help(); return null; }
    if (arg === "--record") options.record = true;
    else if (arg === "--headed") options.headed = true;
    else if (arg === "--overwrite") options.overwrite = true;
    else if (values[arg]) {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}.`);
      options[values[arg]] = value;
    } else throw new Error(`Unknown option: ${arg}. Use --help.`);
  }
  const url = new URL(options.url);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("Use an HTTP(S) application URL without credentials, query parameters, or fragments.");
  }
  options.url = url.href;
  options.output = resolve(options.output);
  options.manifest = resolve(options.manifest);
  options.heroPhoto = Number(options.heroPhoto);
  options.timeout = Number(options.timeout);
  if (!Number.isInteger(options.heroPhoto) || options.heroPhoto < 1 || options.heroPhoto > 20) throw new Error("--hero-photo must be between 1 and 20.");
  if (!Number.isFinite(options.timeout) || options.timeout < 10_000 || options.timeout > 180_000) throw new Error("--timeout must be between 10000 and 180000 milliseconds.");
  if (options.query.trim().length < 2 || options.query.length > 180) throw new Error("Use a search query with 2–180 characters.");
  return options;
}

async function exists(path) {
  try { await access(path, constants.F_OK); return true; }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

async function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  if (await exists("/usr/bin/chromium")) return "/usr/bin/chromium";
  return undefined;
}

// Google photo resource URLs are deliberately excluded from a reusable media archive.
function photoMetadata(photo) {
  if (!photo) return undefined;
  const { id, alt, source, author, authorUrl, attributions, license, sourceUrl, width, height } = photo;
  return {
    id, alt, source, author, authorUrl, attributions, license, sourceUrl, width, height,
    ...(source === "Wikimedia Commons" ? { url: photo.url, thumbnailUrl: photo.thumbnailUrl } : {}),
  };
}

function destinationMetadata(destination) {
  return {
    place: destination.place,
    summary: destination.summary,
    description: destination.description,
    photos: destination.photos.map(photoMetadata),
    nearby: destination.nearby.map(item => ({ ...item, photo: photoMetadata(item.photo) })),
    facts: destination.facts,
    sources: destination.sources,
    warnings: destination.warnings,
  };
}

/**
 * Record the actual Chromium compositor without requiring Playwright's separate
 * FFmpeg download. Keep each received frame's clock time, sample those real frames
 * at 30 FPS, and repeat the most recent real frame between screen updates.
 * Writes wait for FFmpeg's stdin to drain, preserving timing under backpressure.
 */
async function startRecorder(context, page, directory) {
  const fps = 30;
  const path = join(directory, "browser-recording.mp4");
  const cdp = await context.newCDPSession(page);
  const ffmpeg = spawn(process.env.FFMPEG_PATH || "ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-n", "-f", "image2pipe", "-vcodec", "mjpeg", "-threads", "2",
    "-framerate", String(fps), "-i", "pipe:0", "-an", "-c:v", "libx264", "-preset", "veryfast",
    "-crf", "18", "-threads", "2", "-pix_fmt", "yuv420p", "-movflags", "+faststart", path,
  ], { stdio: ["pipe", "ignore", "pipe"] });
  let origin;
  let framesWritten = 0;
  let sampledFrame;
  let running = true;
  let failure;
  let errorOutput = "";
  let pumpTask;
  const updates = [];
  let resolveFirst;
  const firstFrame = new Promise(resolve => { resolveFirst = resolve; });
  const complete = new Promise(resolve => {
    ffmpeg.on("error", error => { failure = error; resolve({ error }); });
    ffmpeg.on("close", code => {
      if (code !== 0) failure = new Error(`FFmpeg exited with status ${code}: ${errorOutput}`);
      resolve({ code, error: failure });
    });
  });
  ffmpeg.stderr.on("data", data => { errorOutput = (errorOutput + data.toString()).slice(-2000); });
  ffmpeg.stdin.on("error", error => { failure = error; });
  const assertHealthy = () => { if (failure) throw failure; };
  const pump = async target => {
    assertHealthy();
    while (framesWritten < target) {
      const timestamp = framesWritten / fps;
      while (updates.length && updates[0].timestamp <= timestamp) sampledFrame = updates.shift().data;
      if (!sampledFrame) break;
      const drained = ffmpeg.stdin.write(sampledFrame);
      framesWritten += 1;
      if (!drained) await once(ffmpeg.stdin, "drain");
      assertHealthy();
    }
  };
  const onFrame = frame => {
    const now = performance.now();
    if (origin === undefined) origin = now;
    if (running) {
      updates.push({ timestamp: (now - origin) / 1000, data: Buffer.from(frame.data, "base64") });
      // Bound the queue: fail instead of silently discarding real animation
      // frames if the system cannot keep up with the encoder.
      if (updates.length > 512) failure = new Error("Recording encoder could not keep up with real browser frames.");
    }
    resolveFirst();
    cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(error => { if (running) failure = error; });
  };
  cdp.on("Page.screencastFrame", onFrame);
  let initialDeadline;
  try {
    await cdp.send("Page.enable");
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 95, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
    await Promise.race([firstFrame, new Promise((_, reject) => {
      initialDeadline = setTimeout(() => reject(new Error("Chromium did not provide an initial recording frame.")), 15_000);
    })]);
    assertHealthy();
  } catch (error) {
    running = false;
    await cdp.send("Page.stopScreencast").catch(() => {});
    ffmpeg.stdin.destroy();
    ffmpeg.kill("SIGTERM");
    throw error;
  } finally { clearTimeout(initialDeadline); }
  const interval = setInterval(() => {
    if (pumpTask || !running) return;
    const target = Math.floor((performance.now() - origin) / 1000 * fps) + 1;
    pumpTask = pump(target).catch(error => { failure = error; }).finally(() => { pumpTask = undefined; });
  }, 10);
  return {
    origin,
    path,
    assertHealthy,
    async stop() {
      if (!running) return;
      running = false;
      const stoppedAt = performance.now();
      clearInterval(interval);
      await cdp.send("Page.stopScreencast").catch(() => {});
      await pumpTask;
      try {
        const target = Math.max(1, Math.ceil((stoppedAt - origin) / 1000 * fps));
        await pump(target);
        ffmpeg.stdin.end();
      } catch (error) {
        ffmpeg.stdin.destroy();
        ffmpeg.kill("SIGTERM");
        throw error;
      }
      const result = await complete;
      await cdp.detach().catch(() => {});
      if (result.error) throw result.error;
      return { frames: framesWritten, fps, durationSeconds: framesWritten / fps, elapsedSeconds: (stoppedAt - origin) / 1000 };
    },
  };
}

const screenshotNames = {
  home: "01-home.png", search: "02-search.png", cinematic: "04-cinematic.png",
  details: "05-details.png", gallery: "06-gallery.png", favorites: "07-favorites.png", mobile: "08-mobile.png",
};

async function main(options) {
  const plannedFiles = [...Object.values(screenshotNames).map(name => join(options.output, name)), options.manifest];
  for (const file of plannedFiles) {
    if (!options.overwrite && await exists(file)) throw new Error(`Output already exists: ${file}. Review it first; use --overwrite to replace the capture set.`);
  }
  // Fail before creating media files if there is no actual server to demonstrate.
  const probe = await fetch(options.url, { signal: AbortSignal.timeout(15_000) });
  if (!probe.ok) throw new Error(`The running application returned HTTP ${probe.status}.`);
  await probe.body?.cancel();
  await mkdir(options.output, { recursive: true });
  await mkdir(dirname(options.manifest), { recursive: true });
  const rawParent = resolve(options.rawDir || tmpdir());
  if (options.record) await mkdir(rawParent, { recursive: true });
  const rawDirectory = options.record ? await mkdtemp(join(rawParent, "world-explorer-raw-")) : undefined;
  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    application: "World Explorer",
    baseUrl: options.url,
    query: options.query,
    completed: false,
    authentication: "Fresh isolated browser context; no saved account or private browser data.",
    captureMethod: "Playwright interactions against live APIs, without fixtures, routing overrides, style or DOM injection.",
    map: { captured: false, reason: "This capture omits Google map scenes. No map screenshot or claim of a verified functional map was generated." },
    recording: {
      enabled: options.record,
      viewport: { width: 1920, height: 1080 },
      method: "Genuine Chromium CDP compositor frames encoded with system FFmpeg as H.264, 30 FPS. Static intervals repeat the most recent real frame.",
      timingNote: "Segment seconds use a monotonic clock starting with the first received Chromium frame, before navigation. Container time uses the same origin, rounded to the 1/30-second frame interval.",
    },
    segments: [], screenshots: [], searches: [], destinations: [],
  };
  let browser;
  let context;
  let page;
  let mobileContext;
  let recorder;
  let origin;
  const pendingMetadata = new Set();
  const elapsed = () => Math.round((performance.now() - origin) / 10) / 100;
  const recordSegment = async (key, title, duration, action, include = true) => {
    recorder?.assertHealthy();
    const start = elapsed();
    console.log(`${include ? "Scene" : "Setup"}: ${key} (${start.toFixed(2)}s)`);
    await action?.();
    if (options.record && include) {
      const remaining = duration * 1000 - (performance.now() - origin - start * 1000);
      if (remaining > 0) await page.waitForTimeout(remaining);
    }
    manifest.segments.push({ key, start, end: elapsed(), title, include });
    recorder?.assertHealthy();
  };
  const moveTo = async (locator) => {
    const box = await locator.boundingBox();
    if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 20 });
  };
  const click = async (locator) => { await moveTo(locator); await locator.click(); };
  const readyPhotos = async (targetPage) => {
    await targetPage.locator(".cinematic-background-photo.cinematic-photo--ready").waitFor();
    await targetPage.waitForFunction(() => {
      const photos = [...document.querySelectorAll(".cinematic-photo-rail .cinematic-photo")];
      return photos.length > 0 && photos.every(photo => photo.classList.contains("cinematic-photo--ready"));
    });
    // Preserve the original GSAP and image fade animations, then capture their settled state.
    await targetPage.waitForTimeout(1600);
  };
  const assertClean = async (targetPage) => {
    if (await targetPage.locator(".error-banner").isVisible()) throw new Error("Application displayed an unexpected error; no demonstration image was fabricated.");
    await targetPage.locator(".request-banner").waitFor({ state: "hidden" });
  };
  const saveScreenshot = async (key, targetPage, target, extra = {}) => {
    await assertClean(targetPage);
    const file = join(options.output, screenshotNames[key]);
    if (target) await target.screenshot({ path: file, animations: "allow" });
    else await targetPage.screenshot({ path: file, fullPage: key === "home", animations: "allow" });
    manifest.screenshots.push({ key, file: relative(repository, file).split("\\").join("/"), ...extra });
    console.log(`Captured ${relative(repository, file)}`);
  };
  const recordResponses = (targetPage) => {
    targetPage.on("response", response => {
      const pathname = new URL(response.url()).pathname;
      if (!["/api/destination", "/api/search"].includes(pathname) || response.status() !== 200) return;
      const task = response.json().then(data => {
        if (pathname === "/api/search") {
          manifest.searches.push({ receivedAt: new Date().toISOString(), query: response.request().postDataJSON().query, provider: data.provider, suggestions: data.suggestions.map(({ label, ref }) => ({ label, ref })), warnings: data.warnings });
          return;
        }
        const destination = destinationMetadata(data);
        manifest.destinations.push({ receivedAt: new Date().toISOString(), destination });
        if (!manifest.destination) {
          manifest.destination = destination;
          manifest.photos = destination.photos;
          manifest.nearby = destination.nearby;
        }
      }).catch(() => {
        manifest.metadataWarning = "A provider response could not be recorded; review source credits before publishing.";
      });
      pendingMetadata.add(task);
      task.finally(() => pendingMetadata.delete(task));
    });
  };
  const selectLiveResult = async (targetPage, alreadyQueried = false) => {
    const search = targetPage.getByRole("combobox", { name: "Pesquisar qualquer lugar do mundo" });
    if (!alreadyQueried) await search.fill(options.query);
    const results = targetPage.getByRole("option");
    await results.first().waitFor();
    await targetPage.getByLabel("Pesquisando", { exact: true }).waitFor({ state: "hidden" });
    const labels = await results.locator("strong").allTextContents();
    const exactIndex = labels.findIndex(label => label.localeCompare(options.query, "pt", { sensitivity: "base" }) === 0);
    if (exactIndex < 0) throw new Error("No exact real geographic result matched the requested destination. Choose another --query; the script does not invent a result.");
    return results.nth(exactIndex);
  };

  try {
    browser = await chromium.launch({ headless: !options.headed, executablePath: await chromiumPath() });
    context = await browser.newContext({ viewport: manifest.recording.viewport, deviceScaleFactor: 1, locale: "pt-BR", reducedMotion: "no-preference" });
    page = await context.newPage();
    if (options.record) {
      recorder = await startRecorder(context, page, rawDirectory);
      origin = recorder.origin;
      manifest.rawVideoPath = recorder.path;
    } else origin = performance.now();
    page.setDefaultTimeout(options.timeout);
    page.setDefaultNavigationTimeout(options.timeout);
    recordResponses(page);
    await recordSegment("setup-start", "Navegação e carregamento inicial", 0, async () => {
      await page.goto(options.url, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { level: 1 }).filter({ hasText: "O mundo tem" }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1800);
    }, false);
    await recordSegment("home", "World Explorer — encontre a sua próxima descoberta", 8, async () => {
      await saveScreenshot("home", page);
      await moveTo(page.getByRole("combobox"));
    });
    await recordSegment("search", "Pesquisa dinâmica com resultados reais", 12, async () => {
      const search = page.getByRole("combobox");
      await click(search);
      await search.pressSequentially(options.query, { delay: 175 });
      await page.getByRole("option").first().waitFor();
      await page.getByLabel("Pesquisando", { exact: true }).waitFor({ state: "hidden" });
      await saveScreenshot("search", page);
      await moveTo(page.getByRole("option").first());
    });
    await recordSegment("setup-destination", "Seleção, consulta de fontes e carregamento; mapa indisponível omitido", 0, async () => {
      const result = await selectLiveResult(page, true);
      const destinationResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/destination" && response.status() === 200);
      await click(result);
      const data = await (await destinationResponse).json();
      if (data.photos.length < 2) throw new Error("This destination has fewer than two verified photographs. Choose another query for a gallery demonstration.");
      if (await page.getByText("Mapa disponível após configurar o Google Maps.", { exact: false }).isVisible()) {
        manifest.map.reason = "The real interface reported unavailable Google Maps credentials. The map screenshot and scene were omitted.";
        manifest.map.credentialState = "unavailable";
      } else manifest.map.credentialState = "not verified by this capture";
      manifest.placeName = data.place.name;
      manifest.selectedPhotoIndex = Math.min(options.heroPhoto, data.photos.length);
      await click(page.getByRole("button", { name: "Explorar este local", exact: true }));
      await page.getByRole("heading", { level: 1, name: data.place.name, exact: true }).waitFor();
      await readyPhotos(page);
      // Visit real gallery photographs through their existing controls to settle/cache the
      // two video photographs before the kept scenes. These setup moments are excluded.
      const preferred = manifest.selectedPhotoIndex;
      for (let index = 1; index < Math.min(preferred + 1, data.photos.length); index += 1) {
        await click(page.getByRole("button", { name: "Próxima fotografia", exact: true }));
        await readyPhotos(page);
      }
      if (preferred < data.photos.length) {
        await click(page.getByRole("button", { name: "Fotografia anterior", exact: true }));
        await readyPhotos(page);
      }
      await page.locator(".cinematic-scene").evaluate(element => element.scrollIntoView({ behavior: "smooth", block: "start" }));
      await page.waitForTimeout(900);
    }, false);
    const photoIndex = manifest.selectedPhotoIndex;
    const photo = manifest.destination.photos[photoIndex - 1];
    await recordSegment("cinematic", "Fotografias reais em uma apresentação cinematográfica", 14, async () => {
      await saveScreenshot("cinematic", page, page.locator(".cinematic-scene"), { photoIndex, photoId: photo.id });
      await moveTo(page.getByRole("button", { name: "Saiba mais", exact: true }));
    });
    await recordSegment("gallery", "Explore outras fotografias do mesmo destino", 12, async () => {
      await click(page.getByRole("button", { name: "Próxima fotografia", exact: true }));
      await readyPhotos(page);
      const nextIndex = photoIndex % manifest.destination.photos.length + 1;
      await saveScreenshot("gallery", page, page.locator(".cinematic-scene"), { photoIndex: nextIndex, photoId: manifest.destination.photos[nextIndex - 1].id });
    });
    await recordSegment("details", "História e geografia com fontes e referências", 12, async () => {
      await click(page.getByRole("button", { name: "Saiba mais", exact: true }));
      const dialog = page.getByRole("dialog", { name: manifest.placeName, exact: true });
      await dialog.waitFor();
      if (options.record) await page.waitForTimeout(4500);
      const facts = dialog.locator(".cinematic-facts");
      const sources = dialog.locator(".cinematic-sources");
      const focus = await facts.count() ? facts : sources;
      if (await focus.count()) {
        // Use the native dialog scroll; retain the original layout and text.
        // Center the facts so the end of the description, text licence and
        // reference links share the viewport instead of capturing only its top.
        await focus.evaluate(element => element.scrollIntoView({ behavior: "smooth", block: "center" }));
        await page.waitForTimeout(1100);
        await page.waitForFunction(() => {
          const modal = document.querySelector(".cinematic-dialog[open]");
          if (!modal) return false;
          const bounds = modal.getBoundingClientRect();
          return [...modal.querySelectorAll(".cinematic-facts, .cinematic-text-attribution, .cinematic-sources")].every(element => {
            const rect = element.getBoundingClientRect();
            return rect.top >= bounds.top + 2 && rect.bottom <= bounds.bottom - 2;
          });
        });
      }
      await saveScreenshot("details", page, undefined, { focus: "Destination facts, text licence and source references reached by native scrolling." });
    });
    await recordSegment("setup-nearby", "Fechar detalhes e avançar para locais próximos", 0, async () => {
      await page.keyboard.press("Escape");
      if (manifest.destination.nearby.length) {
        await click(page.getByRole("button", { name: "CONTINUE EXPLORANDO", exact: true }));
        await page.waitForTimeout(1000);
        await page.waitForFunction(() => [...document.querySelectorAll(".cinematic-nearby .cinematic-photo")].every(photo => !photo.classList.contains("cinematic-photo--loading")));
        await page.waitForTimeout(700);
      }
    }, false);
    if (manifest.destination.nearby.length) {
      await recordSegment("nearby", "Lugares próximos com informações disponíveis", 8, async () => {
        await moveTo(page.locator(".cinematic-nearby-button").first());
      });
    } else manifest.nearbySceneOmitted = "No nearby places were returned by the real providers.";
    await recordSegment("setup-favorites", "Retornar à apresentação", 0, async () => {
      await page.locator(".cinematic-scene").evaluate(element => element.scrollIntoView({ behavior: "smooth", block: "start" }));
      await page.waitForTimeout(900);
    }, false);
    await recordSegment("favorites", "Salve seus lugares favoritos neste navegador", 12, async () => {
      await click(page.getByRole("button", { name: `Salvar ${manifest.placeName} nos favoritos`, exact: true }));
      await page.getByRole("button", { name: `Remover ${manifest.placeName} dos favoritos`, exact: true }).waitFor();
      if (options.record) await page.waitForTimeout(2200);
      await click(page.getByRole("button", { name: "Meus lugares", exact: true }));
      await page.getByRole("dialog", { name: "Meus lugares.", exact: true }).waitFor();
      await saveScreenshot("favorites", page);
    });
    await recordSegment("history", "Retorne às suas últimas explorações", 8, async () => {
      await click(page.getByRole("button", { name: "Histórico", exact: true }));
      await page.getByRole("dialog", { name: "Por onde você passou.", exact: true }).waitFor();
    });
    await recordSegment("setup-closing", "Fechar o histórico e retornar ao início", 0, async () => {
      await click(page.getByRole("button", { name: "Fechar lugares salvos", exact: true }));
      await click(page.getByRole("button", { name: "World Explorer — início", exact: true }));
      await page.getByRole("heading", { level: 1 }).filter({ hasText: "O mundo tem" }).waitFor();
      await page.waitForTimeout(1800);
    }, false);
    await recordSegment("closing", "World Explorer — explore o mundo de uma nova maneira", 8, async () => {
      await moveTo(page.getByRole("combobox"));
    });
    manifest.recording.elapsedSeconds = elapsed();
    if (recorder) {
      manifest.recording.encoder = await recorder.stop();
      recorder = undefined;
    }
    await context.close();
    context = undefined;

    // Mobile is a separate fresh context, so it cannot affect the desktop recording.
    mobileContext = await browser.newContext({ viewport: { width: 393, height: 851 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: "pt-BR", reducedMotion: "no-preference" });
    const mobile = await mobileContext.newPage();
    mobile.setDefaultTimeout(options.timeout);
    recordResponses(mobile);
    await mobile.goto(options.url, { waitUntil: "domcontentloaded" });
    await mobile.waitForLoadState("networkidle");
    await mobile.evaluate(() => document.fonts.ready);
    // Let the ordinary client hydration and welcome animation finish before input.
    await mobile.waitForTimeout(1800);
    const result = await selectLiveResult(mobile);
    await result.click();
    await mobile.getByRole("button", { name: "Explorar este local", exact: true }).click();
    await mobile.getByRole("heading", { level: 1, name: manifest.placeName, exact: true }).waitFor();
    await readyPhotos(mobile);
    for (let index = 1; index < manifest.selectedPhotoIndex; index += 1) {
      await mobile.getByRole("button", { name: "Próxima fotografia", exact: true }).click();
      await readyPhotos(mobile);
    }
    // Exercise the mobile details controls and restore focus through the real
    // dialog, without hiding accessibility elements or changing styles.
    await mobile.getByRole("button", { name: "Saiba mais", exact: true }).tap();
    await mobile.getByRole("dialog", { name: manifest.placeName, exact: true }).waitFor();
    await mobile.getByRole("button", { name: "Fechar detalhes", exact: true }).tap();
    // Capturing the entire genuine section retains author/licence/source credits
    // beneath mobile cards instead of cropping them out of an 851px viewport.
    await saveScreenshot("mobile", mobile, mobile.locator(".cinematic-scene"), { viewport: { width: 393, height: 851 }, photoIndex, photoId: photo.id });
    await mobileContext.close();
    mobileContext = undefined;
    await Promise.allSettled([...pendingMetadata]);
    if (manifest.metadataWarning) throw new Error(manifest.metadataWarning);
    manifest.usefulDurationSeconds = Math.round(manifest.segments.filter(segment => segment.include).reduce((total, segment) => total + segment.end - segment.start, 0) * 100) / 100;
    manifest.completed = true;
    console.log(`Capture completed: ${manifest.screenshots.length} screenshots${options.record ? `, ${manifest.usefulDurationSeconds}s of usable real-browser scenes` : ""}.`);
  } finally {
    if (recorder) {
      try { manifest.recording.encoder = await recorder.stop(); }
      catch { manifest.recording.failure = "Recording did not encode successfully; do not publish the partial raw file."; }
    }
    if (context) {
      await context.close().catch(() => {});
    }
    await mobileContext?.close().catch(() => {});
    await browser?.close().catch(() => {});
    await Promise.allSettled([...pendingMetadata]);
    await writeFile(options.manifest, `${JSON.stringify(manifest, null, 2)}\n`, { flag: options.overwrite ? "w" : "wx" });
    console.log(`Manifest: ${options.manifest}`);
  }
}

try {
  const options = optionsFromArgs(process.argv.slice(2));
  if (options) await main(options);
} catch (error) {
  console.error(`Capture failed: ${error.message}`);
  process.exitCode = 1;
}
