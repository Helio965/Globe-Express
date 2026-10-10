#!/usr/bin/env node
/**
 * Edit a real Playwright recording into the documented World Explorer demo.
 * No application responses, interface images, music, or speech are generated.
 * Requires Node.js 22+, FFmpeg with libx264/libass/mov_text, and an installed font.
 *
 * node scripts/render-demo.mjs --manifest /tmp/globe-demo/capture-manifest.json
 * Add --overwrite to replace previously generated documentation media.
 */
import { spawn } from "node:child_process";
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(root, "docs/media/video");
const outputNames = [
  "world-explorer-demo.mp4",
  "video-thumbnail.png",
  "subtitles-pt-br.srt",
  "render-info.json",
];
const maxVideoBytes = 25 * 1024 * 1024;
const fps = 30;
const defaultCreditsUrl = "https://github.com/Helio965/Globe-Express/blob/main/docs/media/MEDIA_CREDITS.md";

const scenes = {
  home: {
    title: "WORLD EXPLORER — EXPLORE O MUNDO",
    captions: [
      "Conheça o World Explorer: uma experiência visual de exploração geográfica.",
      "Descubra lugares, paisagens e as histórias disponíveis sobre cada destino.",
    ],
  },
  search: {
    title: "PESQUISA DINÂMICA",
    captions: [
      "Pesquise uma localidade e acompanhe as sugestões reais.",
      "Selecione um resultado para conhecer o destino e suas informações disponíveis.",
    ],
  },
  cinematic: {
    title: "APRESENTAÇÃO CINEMATOGRÁFICA",
    captions: [
      "Fotografias reais e fontes enciclopédicas compõem a apresentação do destino.",
      "A interface reúne imagem, descrição e cartões em uma experiência imersiva.",
    ],
  },
  gallery: {
    title: "GALERIA DE FOTOGRAFIAS REAIS",
    captions: [
      "Navegue entre as fotografias disponíveis para conhecer outros ângulos do local.",
      "Cada fotografia mantém seus créditos e a indicação da fonte e da licença.",
    ],
  },
  details: {
    title: "HISTÓRIA, GEOGRAFIA E FONTES",
    captions: [
      "Abra os detalhes para consultar informações geográficas e históricas.",
      "Os dados disponíveis e suas referências variam conforme o destino e as fontes.",
    ],
  },
  nearby: {
    title: "LUGARES PRÓXIMOS",
    captions: [
      "Os cartões apresentam outros lugares encontrados nas proximidades do destino.",
      "Escolha um lugar para continuar sua exploração.",
    ],
  },
  favorites: {
    title: "SEUS LUGARES FAVORITOS",
    captions: [
      "Salve um destino como favorito e consulte sua lista de lugares.",
      "Os favoritos ficam neste navegador e permitem retomar uma exploração.",
    ],
  },
  history: {
    title: "HISTÓRICO DE EXPLORAÇÃO",
    captions: [
      "O histórico registra os destinos visitados neste navegador.",
      "Consulte os lugares explorados recentemente para voltar a eles.",
    ],
  },
  closing: {
    title: "WORLD EXPLORER — DISCOVER THE WORLD",
    captions: [
      "Projeto e documentação: github.com/Helio965/Globe-Express",
      "Capturas e edição: CC BY-SA 4.0. Autores, fontes e licenças nos créditos.",
    ],
  },
};

function parseOptions() {
  let manifest = path.join(root, "docs/media/capture-manifest.json");
  let creditsUrl = defaultCreditsUrl;
  let overwrite = false;
  for (let index = 2; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    if (argument === "--manifest") {
      const value = process.argv[++index];
      if (!value || value.startsWith("--")) throw new Error("--manifest exige um caminho de arquivo JSON.");
      manifest = path.resolve(value);
    } else if (argument === "--credits-url") {
      const value = process.argv[++index];
      if (!value || value.startsWith("--")) throw new Error("--credits-url exige uma URL HTTPS pública.");
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.href.length > 200) {
        throw new Error("--credits-url exige HTTPS sem credenciais, parâmetros ou fragmentos e até 200 caracteres.");
      }
      creditsUrl = url.href;
    } else if (argument === "--overwrite") {
      overwrite = true;
    } else if (argument === "--help" || argument === "-h") {
      console.log(`Uso: node scripts/render-demo.mjs [--manifest caminho.json] [--credits-url URL] [--overwrite]\n\nProduz MP4 real sem voz e sem música, com explicações visíveis em português,\nlegendas SRT/mov_text, miniatura e informações técnicas em docs/media/video.\n\n--credits-url define o endereço HTTPS público dos créditos mostrado no final.\nPadrão: ${defaultCreditsUrl}`);
      process.exit(0);
    } else {
      throw new Error(`Argumento desconhecido: ${argument}`);
    }
  }
  return { manifest, creditsUrl, overwrite };
}

function execute(program, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout = (stdout + chunk.toString()).slice(-128_000); });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-64_000); });
    child.on("error", (error) => reject(new Error(`Não foi possível executar ${program}: ${error.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${program} terminou com código ${code}.\n${stderr.slice(-8_000)}`));
    });
  });
}

async function probe(file) {
  const result = await execute("ffprobe", [
    "-v", "error", "-show_entries",
    "format=duration,size:stream=index,codec_name,codec_type,width,height,r_frame_rate,pix_fmt",
    "-of", "json", file,
  ]);
  return JSON.parse(result.stdout);
}

async function fileExists(file) {
  try { await access(file); return true; } catch { return false; }
}

async function loadCapture(manifestPath) {
  const details = await stat(manifestPath);
  if (!details.isFile() || details.size > 2 * 1024 * 1024) throw new Error("Manifesto inválido ou maior que 2 MiB.");
  const capture = JSON.parse(await readFile(manifestPath, "utf8"));
  if (capture.completed !== true) throw new Error("A captura precisa estar concluída (completed: true).");
  if (typeof capture.rawVideoPath !== "string" || !path.isAbsolute(capture.rawVideoPath)) {
    throw new Error("O manifesto precisa indicar rawVideoPath como caminho absoluto da gravação real.");
  }
  const rawVideoPath = await realpath(capture.rawVideoPath);
  if (!(await stat(rawVideoPath)).isFile()) throw new Error("A gravação precisa ser um arquivo regular.");
  const input = await probe(rawVideoPath);
  const video = input.streams?.find((stream) => stream.codec_type === "video");
  const duration = Number(input.format?.duration);
  if (!video || video.width < 1280 || video.height < 720 || !Number.isFinite(duration)) {
    throw new Error("A gravação deve ter vídeo com resolução mínima de 1280 × 720 e duração válida.");
  }
  if (!Array.isArray(capture.segments)) throw new Error("O manifesto precisa conter segments.");
  const selected = capture.segments.filter((segment) => segment.include !== false);
  const seen = new Set();
  let previousEnd = 0;
  let timeline = 0;
  const segments = selected.map((segment) => {
    if (!segment || !Object.hasOwn(scenes, segment.key) || seen.has(segment.key)) {
      throw new Error("As cenas incluídas devem ter chaves conhecidas e únicas.");
    }
    const { start, end } = segment;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || start < previousEnd - 0.05 || end > duration + 0.15) {
      throw new Error(`Intervalo inválido na cena ${segment.key}. Confira a linha do tempo da gravação.`);
    }
    const frames = Math.floor((end - start) * fps);
    const length = frames / fps;
    if (length < 3 || length > 30) throw new Error(`A cena ${segment.key} precisa durar entre 3 e 30 segundos.`);
    seen.add(segment.key);
    previousEnd = end;
    const result = { key: segment.key, sourceStart: start, sourceEnd: start + length, frames, length, start: timeline, end: timeline + length };
    timeline += length;
    return result;
  });
  if (segments.length < 2 || timeline < 60 || timeline > 120) {
    throw new Error("As cenas úteis precisam somar entre 60 e 120 segundos.");
  }
  if (!seen.has("cinematic")) throw new Error("É necessária uma cena cinematográfica real para a miniatura.");
  return { capture, rawVideoPath, segments, duration: timeline, rawDuration: duration };
}

function timeSrt(seconds) {
  const total = Math.round(seconds * 1000);
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor(total / 60_000) % 60;
  const wholeSeconds = Math.floor(total / 1000) % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")},${String(total % 1000).padStart(3, "0")}`;
}

function timeAss(seconds) {
  const total = Math.round(seconds * 100);
  return `${Math.floor(total / 360_000)}:${String(Math.floor(total / 6000) % 60).padStart(2, "0")}:${String(Math.floor(total / 100) % 60).padStart(2, "0")}.${String(total % 100).padStart(2, "0")}`;
}

function assText(value) {
  return value.replace(/\\/g, "＼").replace(/\{/g, "(").replace(/\}/g, ")").replace(/\r?\n/g, "\\N");
}

function assHeader(fontName) {
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Title,${fontName},22,&H00B9CFDA,&H00B9CFDA,&H00201B17,&H00201B17,-1,0,0,0,100,100,1,0,1,0,0,7,110,110,0,1\nStyle: Explanation,${fontName},29,&H00F2F4F6,&H00F2F4F6,&H00201B17,&H00201B17,0,0,0,0,100,100,0,0,1,0,0,7,110,110,0,1\nStyle: Credits,${fontName},22,&H00F2F4F6,&H00F2F4F6,&H00201B17,&H00201B17,0,0,0,0,100,100,0,0,1,0,0,7,110,110,0,1\nStyle: ThumbTitle,${fontName},31,&H00F2F4F6,&H00F2F4F6,&H00201B17,&H00201B17,-1,0,0,0,100,100,1,0,1,0,0,7,110,110,0,1\nStyle: ThumbSubtitle,${fontName},22,&H00B9CFDA,&H00B9CFDA,&H00201B17,&H00201B17,0,0,0,0,100,100,1,0,1,0,0,7,110,110,0,1\nStyle: ThumbButton,${fontName},25,&H00B9CFDA,&H00B9CFDA,&H00201B17,&H00201B17,-1,0,0,0,100,100,0,0,1,0,0,7,110,110,0,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
}

function event(start, end, style, position, text) {
  return `Dialogue: 0,${timeAss(start)},${timeAss(end)},${style},,0,0,0,,{\\an7\\pos(${position})}${assText(text)}\n`;
}

function sceneFor(key, creditsUrl) {
  const scene = scenes[key];
  if (key !== "closing") return scene;
  return {
    ...scene,
    captions: [scene.captions[0], `${scene.captions[1]}\n${creditsUrl.replace(/^https:\/\//, "")}`],
  };
}

function captionEvents(segment, fontName, creditsUrl) {
  const scene = sceneFor(segment.key, creditsUrl);
  const half = Math.floor(segment.frames / 2) / fps;
  const captionStyle = segment.key === "closing" ? "Credits" : "Explanation";
  return assHeader(fontName)
    + event(0, segment.length, "Title", "110,977", scene.title)
    + event(0, half, captionStyle, "110,1014", scene.captions[0])
    + event(half, segment.length, captionStyle, "110,1014", scene.captions[1]);
}

function subtitleFile(segments, creditsUrl) {
  let number = 0;
  return segments.map((segment) => {
    const half = Math.floor(segment.frames / 2) / fps;
    return sceneFor(segment.key, creditsUrl).captions.map((caption, index) => {
      const start = segment.start + (index === 0 ? 0 : half);
      const end = index === 0 ? segment.start + half : segment.end;
      return `${++number}\n${timeSrt(start)} --> ${timeSrt(end)}\n${caption}\n`;
    }).join("\n");
  }).join("\n");
}

function filterPath(value) {
  return value.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'").replace(/,/g, "\\,").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

async function prepareFont(workDirectory) {
  const candidates = [
    { file: "/usr/share/fonts/truetype/open-sans/OpenSans-Regular.ttf", bold: "/usr/share/fonts/truetype/open-sans/OpenSans-Bold.ttf", name: "Open Sans" },
    { file: "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", bold: "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", name: "DejaVu Sans" },
  ];
  const font = (await Promise.all(candidates.map(async (candidate) => ({ ...candidate, exists: await fileExists(candidate.file) })))).find((candidate) => candidate.exists);
  if (!font) throw new Error("Instale a fonte Open Sans ou DejaVu Sans para as legendas em português.");
  const directory = path.join(workDirectory, "fonts");
  await mkdir(directory);
  await copyFile(font.file, path.join(directory, "Demo-Regular.ttf"));
  if (await fileExists(font.bold)) await copyFile(font.bold, path.join(directory, "Demo-Bold.ttf"));
  return { directory, name: font.name };
}

async function render(capture, workDirectory, font, creditsUrl) {
  const clips = [];
  for (const [index, segment] of capture.segments.entries()) {
    console.log(`Renderizando cena ${index + 1}/${capture.segments.length}: ${segment.key}`);
    const ass = path.join(workDirectory, `scene-${index}.ass`);
    const clip = path.join(workDirectory, `scene-${index}.mp4`);
    await writeFile(ass, captionEvents(segment, font.name, creditsUrl), "utf8");
    const fade = 0.18;
    const filters = [
      "setpts=PTS-STARTPTS",
      "fps=30",
      "scale=1920:960:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos:out_range=tv",
      "setparams=range=limited",
      "pad=1920:1080:(ow-iw)/2:0:color=0x151b20",
      "setsar=1",
      "drawbox=x=0:y=960:w=iw:h=120:color=0x151b20:t=fill",
      "drawbox=x=110:y=961:w=1700:h=1:color=0xdacfba@0.35:t=fill",
      `ass=filename='${filterPath(ass)}':fontsdir='${filterPath(font.directory)}'`,
      `fade=t=in:st=0:d=${fade}`,
      `fade=t=out:st=${(segment.length - fade).toFixed(6)}:d=${fade}`,
      "format=yuv420p",
    ].join(",");
    await execute("ffmpeg", [
      "-hide_banner", "-loglevel", "warning", "-nostdin", "-y",
      "-ss", segment.sourceStart.toFixed(6), "-i", capture.rawVideoPath,
      "-map", "0:v:0", "-an", "-sn", "-dn", "-vf", filters,
      "-frames:v", String(segment.frames), "-t", segment.length.toFixed(6),
      "-c:v", "libx264", "-preset", "fast", "-crf", "21", "-maxrate", "1900k", "-bufsize", "3800k",
      "-threads", "4", "-profile:v", "high", "-level:v", "4.1", "-pix_fmt", "yuv420p", "-color_range", "tv",
      "-r", "30", "-video_track_timescale", "30000", "-movflags", "+faststart", clip,
    ]);
    clips.push(clip);
  }
  const concatenation = path.join(workDirectory, "clips.txt");
  // These filenames are generated in a private ASCII mkdtemp directory, never shell input.
  await writeFile(concatenation, clips.map((clip) => `file '${clip}'\n`).join(""), "utf8");
  const subtitles = path.join(workDirectory, "subtitles-pt-br.srt");
  await writeFile(subtitles, subtitleFile(capture.segments, creditsUrl), "utf8");
  const video = path.join(workDirectory, "world-explorer-demo.mp4");
  await execute("ffmpeg", [
    "-hide_banner", "-loglevel", "warning", "-nostdin", "-y", "-f", "concat", "-safe", "0", "-i", concatenation,
    "-i", subtitles, "-map", "0:v:0", "-map", "1:0", "-c:v", "copy", "-c:s", "mov_text",
    "-disposition:s:0", "0",
    "-metadata:s:s:0", "language=por", "-metadata:s:s:0", "handler_name=Português brasileiro",
    "-metadata", "title=WORLD EXPLORER — Explore o mundo de uma nova maneira",
    "-metadata", `comment=Demonstração real da aplicação. Sem narração e sem música. Explicações visíveis em português. Capturas e edição: CC BY-SA 4.0. Autores, fontes e licenças: ${creditsUrl}`,
    "-movflags", "+faststart", video,
  ]);
  if ((await stat(video)).size > maxVideoBytes) {
    console.log("Ajustando a compressão para manter o MP4 abaixo de 25 MiB.");
    const compact = path.join(workDirectory, "compact.mp4");
    await execute("ffmpeg", [
      "-hide_banner", "-loglevel", "warning", "-nostdin", "-y", "-i", video,
      "-map", "0:v:0", "-map", "0:s:0", "-c:v", "libx264", "-preset", "fast", "-crf", "24",
      "-maxrate", "1400k", "-bufsize", "2800k", "-threads", "4", "-pix_fmt", "yuv420p", "-r", "30",
      "-c:s", "copy", "-map_metadata", "0", "-movflags", "+faststart", compact,
    ]);
    await copyFile(compact, video);
  }
  const info = await probe(video);
  const stream = info.streams.find((item) => item.codec_type === "video");
  const subtitle = info.streams.find((item) => item.codec_type === "subtitle");
  const duration = Number(info.format.duration);
  const bytes = Number(info.format.size);
  if (stream.codec_name !== "h264" || stream.width !== 1920 || stream.height !== 1080 || stream.pix_fmt !== "yuv420p" || stream.r_frame_rate !== "30/1" || subtitle?.codec_name !== "mov_text" || info.streams.some((item) => item.codec_type === "audio") || bytes >= maxVideoBytes || Math.abs(duration - capture.duration) > 0.15 || duration < 60 || duration > 120) {
    throw new Error(`O arquivo final não atende às especificações de vídeo, duração, legendas ou tamanho: ${JSON.stringify({ stream, subtitle, duration, expectedDuration: capture.duration, bytes, audio: info.streams.some((item) => item.codec_type === "audio") })}`);
  }
  // Decode every video frame; metadata alone does not prove that the final file is playable.
  await execute("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-i", video, "-map", "0:v:0", "-an", "-sn", "-f", "null", "-"]);
  const cinematic = capture.segments.find((segment) => segment.key === "cinematic");
  const thumbnailTime = cinematic.start + Math.min(6, cinematic.length / 2);
  const thumbnailAss = path.join(workDirectory, "thumbnail.ass");
  await writeFile(thumbnailAss, assHeader(font.name)
    + event(0, 1, "ThumbTitle", "110,973", "WORLD EXPLORER")
    + event(0, 1, "ThumbSubtitle", "110,1023", "DEMONSTRAÇÃO DO SISTEMA")
    + event(0, 1, "ThumbButton", "1360,1003", "ASSISTIR AO VÍDEO"), "utf8");
  const thumbnail = path.join(workDirectory, "video-thumbnail.png");
  await execute("ffmpeg", [
    "-hide_banner", "-loglevel", "warning", "-nostdin", "-y", "-ss", thumbnailTime.toFixed(6), "-i", video,
    "-map", "0:v:0", "-an", "-sn", "-vf",
    `setpts=PTS-STARTPTS,drawbox=x=0:y=960:w=iw:h=120:color=0x151b20:t=fill,drawbox=x=110:y=961:w=1700:h=1:color=0xdacfba@0.35:t=fill,ass=filename='${filterPath(thumbnailAss)}':fontsdir='${filterPath(font.directory)}'`,
    "-frames:v", "1", "-update", "1", thumbnail,
  ]);
  const renderInfo = {
    title: "WORLD EXPLORER — Explore o mundo de uma nova maneira",
    generatedAt: new Date().toISOString(),
    durationSeconds: duration,
    bytes,
    sizeMiB: Number((bytes / 1024 / 1024).toFixed(2)),
    width: stream.width,
    height: stream.height,
    framesPerSecond: fps,
    videoCodec: "H.264",
    pixelFormat: stream.pix_fmt,
    narration: false,
    music: false,
    audioTrack: false,
    explanationLanguage: "pt-BR",
    subtitles: { visible: true, embedded: "mov_text", external: "subtitles-pt-br.srt" },
    composition: "Gravação real preservada integralmente, ajustada proporcionalmente em 1920 × 960; faixa editorial externa de 120 px para explicações.",
    transitions: "Fades discretos de 0,18 s entre cenas; sem aceleração das interações.",
    decodedEveryFrame: true,
    thumbnailFrameSeconds: thumbnailTime,
    creditsUrl,
    scenes: capture.segments.map((segment) => ({ key: segment.key, title: scenes[segment.key].title, start: segment.start, end: segment.end, sourceStart: segment.sourceStart, sourceEnd: segment.sourceEnd })),
    files: outputNames,
  };
  await writeFile(path.join(workDirectory, "render-info.json"), `${JSON.stringify(renderInfo, null, 2)}\n`, "utf8");
  return renderInfo;
}

async function main() {
  const options = parseOptions();
  if (!options.overwrite) {
    for (const name of outputNames) {
      if (await fileExists(path.join(outputDirectory, name))) throw new Error(`${name} já existe. Use --overwrite para substituí-lo.`);
    }
  }
  const capabilities = await Promise.all([
    execute("ffmpeg", ["-hide_banner", "-filters"]),
    execute("ffmpeg", ["-hide_banner", "-encoders"]),
  ]);
  if (!/\bass\s/.test(capabilities[0].stdout) || !/\blibx264\s/.test(capabilities[1].stdout) || !/\bmov_text\s/.test(capabilities[1].stdout)) {
    throw new Error("FFmpeg precisa incluir os recursos libass, libx264 e mov_text.");
  }
  const capture = await loadCapture(options.manifest);
  const workDirectory = await mkdtemp(path.join(tmpdir(), "world-explorer-render-"));
  try {
    const font = await prepareFont(workDirectory);
    const info = await render(capture, workDirectory, font, options.creditsUrl);
    await mkdir(outputDirectory, { recursive: true });
    // Publish only validated deliverables; raw clips and temporary ASS files are discarded.
    for (const name of outputNames) await copyFile(path.join(workDirectory, name), path.join(outputDirectory, name));
    console.log(JSON.stringify({ outputDirectory: path.relative(root, outputDirectory), ...info }, null, 2));
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`Falha na edição da demonstração: ${error.message}`);
  process.exitCode = 1;
});
