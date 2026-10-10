#!/usr/bin/env node
/**
 * Render the genuine Playwright recording without changing the application.
 *
 * node scripts/render-documentation-video.mjs \
 *   --recording-directory /path/to/raw --offset-seconds 0
 *
 * Requires FFmpeg with libx264/libass and Open Sans installed. No music,
 * synthesized narration, screenshots posing as video, or generated imagery.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({ options: {
  'recording-directory': { type: 'string' },
  'output-directory': { type: 'string' },
  'offset-seconds': { type: 'string', default: '0' },
  'calibration-note': { type: 'string', default: 'No initial recorder lead trimmed; scene timings use the recording clock.' },
} });
const rawDirectory = path.resolve(values['recording-directory'] || process.env.WORLD_EXPLORER_RECORDING_DIRECTORY || path.join(os.tmpdir(), 'world-explorer-media', 'raw'));
const outputDirectory = path.resolve(values['output-directory'] || path.join(repository, 'docs/media/video'));
const rawFile = path.join(rawDirectory, 'world-explorer-browser.webm');
const timelineFile = path.join(rawDirectory, 'timeline.json');
const recordingManifest = JSON.parse(await readFile(path.join(rawDirectory, 'recording-manifest.json'), 'utf8'));
const scenes = JSON.parse(await readFile(timelineFile, 'utf8'));
const offsetSeconds = Number(values['offset-seconds']);
const targetBytes = 25_000_000;

assert(Number.isFinite(offsetSeconds) && offsetSeconds >= 0, 'Recorder offset must be a finite, nonnegative number of seconds.');
assert.equal(recordingManifest.mode, 'record');
assert.equal(recordingManifest.provider, 'open');
assert.equal(recordingManifest.mockedResponses, false);
assert.equal(recordingManifest.tlsVerification, true);
assert.deepEqual(recordingManifest.issues, [], 'Resolve capture problems before rendering.');
assert.equal(scenes.length, 8, 'The real recording must contain all eight requested scenes.');
for (const [index, scene] of scenes.entries()) {
  assert.equal(scene.id, index + 1);
  assert(Number.isFinite(scene.start) && Number.isFinite(scene.end) && scene.end > scene.start);
  assert(typeof scene.name === 'string' && typeof scene.text === 'string');
  assert(Array.isArray(scene.events) && scene.events.length > 0, 'Every scene needs an observed real interaction.');
  assert(index === 0 || Math.abs(scene.start - scenes[index - 1].end) < 0.15, 'The recording must be continuous.');
}
const duration = scenes.at(-1).end;
assert(duration >= 60 && duration <= 120, `The uncut scene timeline lasts ${duration}s; required range is 60–120s.`);

function run(executable, args, { encoding = 'utf8', maxBuffer = 32 * 1024 * 1024 } = {}) {
  const result = spawnSync(executable, args, { encoding, maxBuffer });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${executable} failed: ${result.stderr?.toString() || result.stdout?.toString()}`);
  return result.stdout;
}

function inspect(file) {
  return JSON.parse(run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]));
}

function font(style) {
  const file = process.env[style === 'Bold' ? 'WORLD_EXPLORER_FONT_BOLD' : 'WORLD_EXPLORER_FONT_REGULAR'] || run('fc-match', ['-f', '%{file}', `Open Sans:style=${style}`]).trim();
  assert(existsSync(file), `An installed ${style} font is required.`);
  return file;
}

function filterPath(file) {
  return file.replaceAll('\\', '\\\\').replaceAll(':', '\\:').replaceAll("'", "'\\''");
}

function timestamp(seconds, ass = false) {
  const scale = ass ? 100 : 1000;
  const units = Math.round(seconds * scale);
  const hours = Math.floor(units / (3600 * scale));
  const minutes = Math.floor(units / (60 * scale)) % 60;
  const wholeSeconds = Math.floor(units / scale) % 60;
  const fraction = units % scale;
  return `${ass ? hours : String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}${ass ? '.' : ','}${String(fraction).padStart(ass ? 2 : 3, '0')}`;
}

function wrap(text, width = 108) {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (normalized.length <= width) return [normalized];
  const candidates = [...normalized.matchAll(/ /g)].map(match => {
    const first = normalized.slice(0, match.index);
    const second = normalized.slice(match.index + 1);
    return { lines: [first, second], score: Math.abs(first.length - second.length) - (/[.!?]$/.test(first) ? 28 : 0) };
  }).filter(candidate => candidate.lines.every(line => line.length <= width));
  assert(candidates.length > 0, 'Editorial captions must fit the 120 px band without covering the application.');
  candidates.sort((left, right) => left.score - right.score);
  return candidates[0].lines;
}

function assText(text) {
  return text.replaceAll('\\', '\\\\').replaceAll('{', '\\{').replaceAll('}', '\\}').replaceAll('\n', '\\N');
}

const rawProbe = inspect(rawFile);
const rawVideo = rawProbe.streams.find(stream => stream.codec_type === 'video');
assert.equal(rawVideo?.width, 1920);
assert.equal(rawVideo?.height, 960, 'The original interface is preserved pixel for pixel, with no scaling or crop.');
assert(Number(rawProbe.format.duration) >= duration + offsetSeconds - 0.2, 'The source recording ends before the requested timeline.');
await mkdir(outputDirectory, { recursive: true });
const scratchDirectory = await mkdtemp(path.join(os.tmpdir(), 'world-explorer-video-'));
const subtitleFile = path.join(outputDirectory, 'subtitles-pt-br.srt');
const videoFile = path.join(outputDirectory, 'world-explorer-demo.mp4');
const thumbnailFile = path.join(outputDirectory, 'video-thumbnail.png');
const assFile = path.join(scratchDirectory, 'editorial-band.ass');
const regularFont = font('Regular');
const boldFont = font('Bold');
const ctaFont = process.env.WORLD_EXPLORER_FONT_CTA || run('fc-match', ['-f', '%{file}', 'DejaVu Sans:style=Bold']).trim();
assert(existsSync(ctaFont), 'A font containing the requested play symbol is required.');

const subtitleCues = scenes.map(scene => ({ id: scene.id, start: scene.start, end: scene.end, text: wrap(scene.text).join('\n') }));
await writeFile(subtitleFile, subtitleCues.map(cue => `${cue.id}\n${timestamp(cue.start)} --> ${timestamp(cue.end)}\n${cue.text}\n`).join('\n'), 'utf8');

const assHeader = `[Script Info]
Title: World Explorer — documentação real
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Open Sans,32,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,48,48,0,1
Style: Label,Open Sans,16,&H007FC5F0,&H007FC5F0,&H00000000,&H00000000,-1,0,0,0,100,100,1,0,1,0,0,7,48,48,0,1
Style: Attribution,Open Sans,16,&H00C6D0D3,&H00C6D0D3,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,9,48,48,0,1
Style: Brand,Open Sans,32,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,7,48,48,0,1
Style: End,Open Sans,26,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,48,48,0,1
Style: URL,Open Sans,24,&H007FC5F0,&H007FC5F0,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,9,48,48,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
const dialogue = [];
function add(scene, style, text, position) {
  dialogue.push(`Dialogue: 0,${timestamp(scene.start, true)},${timestamp(scene.end, true)},${style},,0,0,0,,{${position}}${assText(text)}`);
}
for (const scene of scenes) {
  if (scene.id === 8) {
    add(scene, 'Brand', 'WORLD EXPLORER', '\\an7\\pos(48,974)');
    add(scene, 'End', 'Explore o mundo de uma nova maneira.', '\\an7\\pos(48,1023)');
    add(scene, 'URL', 'github.com/Helio965/Globe-Express', '\\an9\\pos(1872,1009)');
    continue;
  }
  add(scene, 'Label', `${String(scene.id).padStart(2, '0')} / 08  ·  ${scene.name.toLocaleUpperCase('pt-BR')}`, '\\an7\\pos(48,968)');
  add(scene, 'Caption', wrap(scene.text).join('\n'), '\\an7\\pos(48,993)');
  if ([2, 3].includes(scene.id)) {
    add(scene, 'Attribution', '© OpenStreetMap contributors · https://www.openstreetmap.org/copyright', '\\an9\\pos(1872,968)');
  }
}
await writeFile(assFile, `${assHeader}${dialogue.join('\n')}\n`, 'utf8');

// The scale filter converts full-range browser pixels to standard video range;
// iw:ih explicitly preserves the original pixel dimensions without resizing.
const filter = `[0:v]trim=start=${offsetSeconds}:duration=${duration},setpts=PTS-STARTPTS,fps=30,pad=1920:1080:0:0:color=0x0c1317,drawbox=x=0:y=960:w=1920:h=2:color=0xf0c57f@0.3:t=fill[interface];[interface][1:v]overlay=x='-W+W*t/${duration}':y=1076:shortest=1:format=auto,ass=filename='${filterPath(assFile)}',scale=iw:ih:in_range=auto:out_range=tv,format=yuv420p[video]`;
const inputArgs = ['-hide_banner', '-loglevel', 'error', '-y', '-i', rawFile, '-f', 'lavfi', '-i', `color=c=0xf0c57f:s=1920x4:r=30:d=${duration}`, '-filter_complex_threads', '2', '-filter_complex', filter, '-map', '[video]', '-an', '-c:v', 'libx264', '-preset', 'medium', '-threads', '3', '-profile:v', 'high', '-level:v', '4.1', '-pix_fmt', 'yuv420p', '-r', '30', '-t', String(duration)];
const outputArgs = ['-color_range', 'tv', '-movflags', '+faststart', '-metadata', 'title=World Explorer — Demonstração do sistema', '-metadata', 'comment=Real browser recording with Brazilian Portuguese captions; no narration or music.'];
console.log(`Rendering ${duration.toFixed(3)}s of the genuine interface with an additional 120 px editorial band.`);
const bitrate = Math.floor(targetBytes * 8 * 0.9 / duration);
const passLog = path.join(scratchDirectory, 'h264-pass');
console.log(`Using two-pass H.264 to preserve readable text below 25 MB (${bitrate} bits/s).`);
run('ffmpeg', [...inputArgs, '-b:v', String(bitrate), '-pass', '1', '-passlogfile', passLog, '-f', 'null', '-']);
run('ffmpeg', [...inputArgs, '-b:v', String(bitrate), '-pass', '2', '-passlogfile', passLog, ...outputArgs, videoFile]);
const encoding = { codec: 'libx264', bitrate, passes: 2, preset: 'medium' };

const cineScene = scenes.find(scene => scene.id === 4);
const loadedEvent = cineScene.events.find(event => event.detail.includes('Fotografia principal real carregada'));
assert(loadedEvent, 'Choose a thumbnail only after the genuine cinematic photograph loaded.');
const thumbnailAt = Math.min(loadedEvent.time + 1, cineScene.end - 0.15);
for (const [filename, text] of [['brand.txt', 'WORLD EXPLORER'], ['subtitle.txt', 'DEMONSTRAÇÃO DO SISTEMA'], ['cta.txt', '▶ ASSISTIR']]) {
  await writeFile(path.join(scratchDirectory, filename), text, 'utf8');
}
const thumbnailFilter = [
  'drawbox=x=0:y=960:w=1920:h=120:color=0x0c1317:t=fill',
  'drawbox=x=0:y=960:w=1920:h=2:color=0xf0c57f@0.7:t=fill',
  `drawtext=fontfile='${filterPath(boldFont)}':textfile='${filterPath(path.join(scratchDirectory, 'brand.txt'))}':fontsize=56:fontcolor=white:x=48:y=969`,
  `drawtext=fontfile='${filterPath(regularFont)}':textfile='${filterPath(path.join(scratchDirectory, 'subtitle.txt'))}':fontsize=24:fontcolor=0xf0c57f:x=50:y=1040`,
  'drawbox=x=1440:y=980:w=432:h=76:color=0xf0c57f:t=2',
  `drawtext=fontfile='${filterPath(ctaFont)}':textfile='${filterPath(path.join(scratchDirectory, 'cta.txt'))}':fontsize=30:fontcolor=0xf0c57f:x=1440+(432-text_w)/2:y=980+(76-text_h)/2`,
].join(',');
console.log(`Extracting the thumbnail from the real cinematic frame at ${thumbnailAt.toFixed(3)}s.`);
run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(thumbnailAt), '-i', videoFile, '-vf', thumbnailFilter, '-frames:v', '1', '-update', '1', thumbnailFile]);

const outputProbe = inspect(videoFile);
const video = outputProbe.streams.find(stream => stream.codec_type === 'video');
assert.equal(video.codec_name, 'h264');
assert.equal(video.pix_fmt, 'yuv420p');
assert.equal(video.width, 1920);
assert.equal(video.height, 1080);
assert.equal(video.avg_frame_rate, '30/1');
assert.equal(outputProbe.streams.filter(stream => stream.codec_type === 'audio').length, 0);
assert(Math.abs(Number(outputProbe.format.duration) - duration) <= 0.1);
const videoBytes = (await stat(videoFile)).size;
assert(videoBytes < targetBytes, 'The published MP4 should be smaller than 25 MB.');
const mp4Data = await readFile(videoFile);
const mp4Atoms = [];
for (let position = 0; position + 8 <= mp4Data.length;) {
  const shortSize = mp4Data.readUInt32BE(position);
  const size = shortSize === 1 ? Number(mp4Data.readBigUInt64BE(position + 8)) : shortSize || mp4Data.length - position;
  assert(size >= 8 && position + size <= mp4Data.length, 'The MP4 contains an invalid container atom.');
  mp4Atoms.push(mp4Data.toString('ascii', position + 4, position + 8));
  position += size;
}
assert(mp4Atoms.includes('moov') && mp4Atoms.includes('mdat'));
assert(mp4Atoms.indexOf('moov') < mp4Atoms.indexOf('mdat'), 'MP4 metadata must precede video data for progressive playback.');
const thumbnailProbe = inspect(thumbnailFile);
assert.equal(thumbnailProbe.streams[0].width, 1920);
assert.equal(thumbnailProbe.streams[0].height, 1080);
console.log('Validating the complete H.264 decode.');
run('ffmpeg', ['-hide_banner', '-v', 'error', '-i', videoFile, '-f', 'null', '-']);

async function asset(file) {
  const data = await readFile(file);
  return { file: path.relative(repository, file).split(path.sep).join('/'), bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
}

const productionManifest = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  sourceRepository: recordingManifest.sourceRepository,
  sourceGitSHA: recordingManifest.sourceGitSHA,
  captureProvider: 'open',
  source: { ...(await asset(rawFile)), file: path.basename(rawFile), codec: rawVideo.codec_name, width: rawVideo.width, height: rawVideo.height, duration: Number(rawProbe.format.duration), timelineClock: recordingManifest.timelineClock, possibleRecorderLeadSeconds: recordingManifest.possibleRecorderLeadSeconds },
  editing: { originalInterface: 'Continuous, genuine browser recording; no resizing, crop, screenshots used as video, mocks, or generated imagery.', colorConversion: 'Full-range source normalized to limited-range yuv420p for compatible H.264 playback. Pixel dimensions are unchanged.', subtitleBand: { x: 0, y: 960, width: 1920, height: 120, fontFamily: 'Open Sans', captionSizePixels: 32 }, timelineOffsetSeconds: offsetSeconds, calibrationNote: values['calibration-note'], sceneOrderUnchanged: true, soundtrack: 'None: adequate Brazilian Portuguese narration unavailable. Portuguese captions and explanatory text are included, as authorized in the request.', openStreetMapAttribution: 'Scenes 2–3 preserve the native attribution and also display © OpenStreetMap contributors · https://www.openstreetmap.org/copyright in the editorial band.', encoding, faststart: true },
  video: { ...(await asset(videoFile)), codec: video.codec_name, pixelFormat: video.pix_fmt, colorRange: video.color_range, width: video.width, height: video.height, framesPerSecond: video.avg_frame_rate, duration: Number(outputProbe.format.duration), audioStreams: 0, fullyDecodedWithoutErrors: true, containerAtoms: mp4Atoms, progressivePlaybackMetadataFirst: true },
  thumbnail: { ...(await asset(thumbnailFile)), sourceScene: 4, sourceEvent: loadedEvent, frameAtSeconds: thumbnailAt, width: 1920, height: 1080, originalPhotographAndAttributionPreserved: true, captionBandOnly: true },
  subtitles: { ...(await asset(subtitleFile)), language: 'pt-BR', encoding: 'UTF-8', synchronizedTo: 'Observed continuous browser scene timeline', cues: subtitleCues },
  scenes,
  validation: { completeRawCaptureWithoutIssues: true, realApiResponses: true, verifiedTls: true, durationBetween60And120Seconds: true, mp4Below25MB: true, ffprobe: true, completeFfmpegDecode: true, browserPlayback: 'Pending separate browser verification before publication.' },
};
await writeFile(path.join(outputDirectory, 'production-manifest.json'), `${JSON.stringify(productionManifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ file: videoFile, duration: productionManifest.video.duration, bytes: videoBytes, codec: video.codec_name, frameRate: video.avg_frame_rate, thumbnailAtSeconds: thumbnailAt, subtitleCues: subtitleCues.length }, null, 2));
