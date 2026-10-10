import { z } from 'zod';
import { ApiError } from '@/lib/errors';
import { upstreamJson } from '@/lib/upstream';
import type { Fact, ServiceWarning, Source } from '@/types/explorer';
import { plainText } from './wikipedia';

const claimSchema = z.object({ id: z.string().optional(), rank: z.enum(['preferred', 'normal', 'deprecated']).optional(), mainsnak: z.object({ snaktype: z.string().optional(), datavalue: z.object({ value: z.unknown() }).optional() }), qualifiers: z.record(z.string(), z.array(z.object({ datavalue: z.object({ value: z.unknown() }).optional() }))).optional(), references: z.array(z.object({ snaks: z.record(z.string(), z.array(z.object({ datavalue: z.object({ value: z.unknown() }).optional() }))) })).optional() });
const entitySchema = z.object({ id: z.string(), labels: z.record(z.string(), z.object({ value: z.string() })).optional(), descriptions: z.record(z.string(), z.object({ value: z.string() })).optional(), claims: z.record(z.string(), z.array(claimSchema)).optional(), sitelinks: z.record(z.string(), z.object({ title: z.string() })).optional() });
const entitiesSchema = z.object({ entities: z.record(z.string(), entitySchema) });
const quantitySchema = z.object({ amount: z.string().regex(/^[+-]?\d+(?:\.\d+)?$/), unit: z.string() });
const entityValueSchema = z.object({ id: z.string().regex(/^Q\d+$/) });
const timeValueSchema = z.object({ time: z.string(), precision: z.number().optional() });
type Claim = z.infer<typeof claimSchema>;
type Entity = z.infer<typeof entitySchema>;
export interface WikidataContent { facts: Fact[]; sources: Source[]; images: string[]; warnings?: ServiceWarning[]; commonsCategory?: string; country?: string; region?: string; description?: string }

async function entities(ids: string[], signal?: AbortSignal): Promise<Record<string, Entity>> {
  if (!ids.length) return {};
  const url = new URL('https://www.wikidata.org/w/api.php');
  url.search = new URLSearchParams({ action: 'wbgetentities', ids: ids.join('|'), props: 'claims|labels|descriptions|sitelinks', languages: 'pt|en', languagefallback: '1', format: 'json', origin: '*' }).toString();
  const parsed = entitiesSchema.safeParse(await upstreamJson(url, { signal }));
  if (!parsed.success) throw new ApiError('UPSTREAM_INVALID', 'O Wikidata retornou uma resposta incompleta.', 502);
  return parsed.data.entities;
}

function preferred(claims: Claim[] | undefined): Claim[] {
  const usable = (claims ?? []).filter((claim) => claim.rank !== 'deprecated' && claim.mainsnak.datavalue && claim.mainsnak.snaktype !== 'novalue');
  const ranked = usable.filter((claim) => claim.rank === 'preferred');
  return ranked.length ? ranked : usable;
}

function sourceFor(id: string, claim: Claim): string {
  for (const reference of claim.references ?? []) for (const snak of reference.snaks.P854 ?? []) {
    const raw = snak.datavalue?.value;
    if (typeof raw === 'string') try { const url = new URL(raw); if (url.protocol === 'https:' && !url.username && !url.password) return url.toString(); } catch { /* Use the verifiable statement permalink. */ }
  }
  return `https://www.wikidata.org/wiki/${id}${claim.id ? `#${encodeURIComponent(claim.id.replace('$', '-'))}` : ''}`;
}

function dateFromClaim(claim: Claim): string | undefined {
  const time = timeValueSchema.safeParse(claim.qualifiers?.P585?.[0]?.datavalue?.value);
  if (!time.success) return undefined;
  return formatDate(time.data.time, time.data.precision);
}

function timeOrder(claim: Claim): string {
  const time = timeValueSchema.safeParse(claim.qualifiers?.P585?.[0]?.datavalue?.value);
  return time.success ? time.data.time : '';
}

function formatDate(time: string, precision = 9): string | undefined {
  const match = /^\+?(\d{4,})-(\d\d)-(\d\d)T/.exec(time);
  if (!match) return undefined;
  if (precision >= 11 && match[2] !== '00' && match[3] !== '00') return `${match[3]}/${match[2]}/${match[1]}`;
  if (precision >= 10 && match[2] !== '00') return `${match[2]}/${match[1]}`;
  return match[1];
}

export async function getWikidataContent(id: string | undefined, signal?: AbortSignal): Promise<WikidataContent> {
  if (!id || !/^Q\d+$/.test(id)) return { facts: [], sources: [], images: [] };
  const entity = (await entities([id], signal))[id];
  if (!entity) return { facts: [], sources: [], images: [] };
  const claims = entity.claims ?? {};
  const images = preferred(claims.P18).flatMap((claim) => typeof claim.mainsnak.datavalue?.value === 'string' ? [claim.mainsnak.datavalue.value] : []);
  const categoryValue = preferred(claims.P373)[0]?.mainsnak.datavalue?.value;
  const linkedCategory = entity.sitelinks?.commonswiki?.title;
  const commonsCategory = typeof categoryValue === 'string' ? plainText(categoryValue, 300) : linkedCategory?.startsWith('Category:') ? plainText(linkedCategory.slice(9), 300) : undefined;
  const relationProperties = ['P17', 'P131', 'P31', 'P149', 'P1435'];
  const related = [...new Set(relationProperties.flatMap((property) => preferred(claims[property]).flatMap((claim) => { const value = entityValueSchema.safeParse(claim.mainsnak.datavalue?.value); return value.success ? [value.data.id] : []; })))].slice(0, 30);
  let labels: Record<string, Entity> = {};
  const warnings: ServiceWarning[] = [];
  if (related.length) {
    try { labels = await entities(related, signal); } catch { signal?.throwIfAborted(); warnings.push({ service: 'Wikidata', message: 'Alguns nomes de países, regiões ou categorias não puderam ser recuperados.' }); }
  }
  const facts: Fact[] = [];
  const relationLabels: Record<string, string> = { P17: 'País', P131: 'Região administrativa', P31: 'Categoria', P149: 'Estilo arquitetônico', P1435: 'Patrimônio' };
  const values: Record<string, string[]> = {};
  for (const property of relationProperties) for (const claim of preferred(claims[property]).slice(0, property === 'P31' ? 2 : 3)) {
    const value = entityValueSchema.safeParse(claim.mainsnak.datavalue?.value);
    if (!value.success) continue;
    const relatedEntity = labels[value.data.id];
    const label = plainText(relatedEntity?.labels?.pt?.value ?? relatedEntity?.labels?.en?.value, 300);
    if (!label) continue;
    (values[property] ??= []).push(label);
    facts.push({ label: relationLabels[property], value: label, sourceUrl: sourceFor(id, claim) });
  }
  for (const [property, label] of [['P2044', 'Altitude'], ['P1082', 'População'], ['P2046', 'Área']] as const) {
    const candidates = preferred(claims[property]).sort((a, b) => timeOrder(b).localeCompare(timeOrder(a)));
    const claim = candidates[0];
    if (!claim) continue;
    const quantity = quantitySchema.safeParse(claim.mainsnak.datavalue?.value);
    if (!quantity.success) continue;
    let amount = Number(quantity.data.amount);
    if (!Number.isFinite(amount)) continue;
    let unit: string;
    const unitId = quantity.data.unit.split('/').pop();
    if (property === 'P1082' && quantity.data.unit === '1') unit = 'habitantes';
    else if (property === 'P2044' && unitId === 'Q11573') unit = 'm';
    else if (property === 'P2044' && unitId === 'Q3710') { amount *= 0.3048; unit = 'm'; }
    else if (property === 'P2046' && unitId === 'Q712226') unit = 'km²';
    else if (property === 'P2046' && unitId === 'Q25343') { amount /= 1e6; unit = 'km²'; }
    else continue; // An unknown measurement unit must not become a fabricated value.
    const date = dateFromClaim(claim);
    facts.push({ label, value: `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(amount)} ${unit}${date ? ` (${date})` : ''}`, sourceUrl: sourceFor(id, claim) });
  }
  const foundation = preferred(claims.P571)[0];
  if (foundation) {
    const time = timeValueSchema.safeParse(foundation.mainsnak.datavalue?.value);
    const date = time.success ? formatDate(time.data.time, time.data.precision) : undefined;
    if (date) facts.push({ label: 'Criação / fundação registrada', value: date, sourceUrl: sourceFor(id, foundation) });
  }
  return { facts, images, ...(warnings.length ? { warnings } : {}), commonsCategory, sources: [{ name: 'Wikidata · dados estruturados CC0', url: `https://www.wikidata.org/wiki/${id}` }], country: values.P17?.join(', '), region: values.P131?.join(', '), description: plainText(entity.descriptions?.pt?.value ?? entity.descriptions?.en?.value, 400) || undefined };
}
