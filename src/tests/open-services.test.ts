import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Location } from '@/types/explorer';

const mocked = vi.hoisted(() => ({ upstream: vi.fn() }));
vi.mock('@/lib/upstream', () => ({ upstreamJson: mocked.upstream }));
import { enrichOpenLocation, openResolve, openReverse, openSearch } from '@/services/open-provider';
import { getCommonsCategoryFiles, getCommonsPhotos } from '@/services/media';
import { getWikidataContent } from '@/services/wikidata';
import { plainText } from '@/services/wikipedia';

const page = { pageid: 101, title: 'Cidade verificada', description: 'cidade no Brasil', coordinates: [{ lat: -15.7, lon: -47.9, globe: 'earth', primary: true }], pageprops: { wikibase_item: 'Q100' }, extract: 'Uma descrição factual.\n\n== História ==\nHistória documentada.' };
const coordinateLocation: Location = { reference: { provider: 'coordinates', lat: 0, lng: -140 }, name: 'Ponto no mapa', coordinates: { lat: 0, lng: -140 }, kind: 'Coordenadas selecionadas', attributions: [] };

beforeEach(() => { mocked.upstream.mockReset(); vi.useRealTimers(); });

describe('provedor público geográfico', () => {
  it('remove resultados não geográficos, desambiguação e coordenadas fora da Terra', async () => {
    mocked.upstream.mockResolvedValue({ query: { pages: [page, { pageid: 2, title: 'Uma pessoa' }, { ...page, pageid: 3, title: 'Desambiguação', pageprops: { disambiguation: '' } }, { ...page, pageid: 4, title: 'Lua', coordinates: [{ lat: 2, lon: 3, globe: 'moon' }] }] } });
    const results = await openSearch('cidade');
    expect(results).toHaveLength(1);
    expect(results[0].reference).toEqual({ provider: 'wikipedia', id: '101', language: 'pt' });
    expect((mocked.upstream.mock.calls[0][0] as URL).searchParams.get('colimit')).toBe('max');
  });

  it('pesquisa em inglês quando o português não possui resultado verificável', async () => {
    mocked.upstream.mockImplementation((url: URL) => Promise.resolve({ query: { pages: url.hostname === 'en.wikipedia.org' ? [page] : [] } }));
    const results = await openSearch('some remote national park');
    expect(results[0].reference).toEqual({ provider: 'wikipedia', id: '101', language: 'en' });
    expect(mocked.upstream).toHaveBeenCalledTimes(2);
  });

  it('usa P625 terrestre quando a edição Wikipedia usa coordenadas só na infobox Wikidata', async () => {
    mocked.upstream.mockImplementation((url: URL) => {
      if (url.hostname === 'www.wikidata.org') return Promise.resolve({ entities: { Q625: { claims: { P625: [{ rank: 'preferred', mainsnak: { datavalue: { value: { latitude: 35.68, longitude: 139.69, globe: 'http://www.wikidata.org/entity/Q2' } } } }] } } } });
      return Promise.resolve({ query: { pages: [{ pageid: 625, title: 'Cidade com infobox Wikidata', index: 1, pageprops: { wikibase_item: 'Q625' } }] } });
    });
    const results = await openSearch('cidade com infobox');
    expect(results[0].title).toBe('Cidade com infobox Wikidata');
    const location = await openResolve(results[0].reference);
    expect(location.coordinates).toEqual({ lat: 35.68, lng: 139.69 });
    expect(location.attributions).toContain('Wikidata · coordenadas sob licença CC0');
  });

  it('não transforma pessoa com P625 ou coordenadas extraterrestres em destino', async () => {
    mocked.upstream.mockImplementation((url: URL) => {
      if (url.hostname === 'www.wikidata.org') return Promise.resolve({ entities: { Q700: { claims: { P31: [{ mainsnak: { datavalue: { value: { id: 'Q5' } } } }], P625: [{ mainsnak: { datavalue: { value: { latitude: 0, longitude: 0, globe: 'http://www.wikidata.org/entity/Q2' } } } }] } }, Q701: { claims: { P625: [{ mainsnak: { datavalue: { value: { latitude: 0, longitude: 0, globe: 'http://www.wikidata.org/entity/Q405' } } } }] } } } });
      return Promise.resolve({ query: { pages: [{ pageid: 700, title: 'Pessoa', pageprops: { wikibase_item: 'Q700' } }, { pageid: 701, title: 'Lugar lunar', pageprops: { wikibase_item: 'Q701' } }] } });
    });
    expect(await openSearch('pessoa ou lua')).toEqual([]);
  });

  it('reutiliza somente artigos bem sucedidos por até 60 segundos', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T12:00:00Z'));
    mocked.upstream.mockResolvedValue({ query: { pages: [{ ...page, pageid: 99009, title: 'Local para cache', pageprops: {} }] } });
    const reference = { provider: 'wikipedia' as const, id: '99009', language: 'pt' as const };
    await openResolve(reference);
    await openResolve(reference);
    expect(mocked.upstream).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date('2026-10-10T12:01:01Z'));
    await openResolve(reference);
    expect(mocked.upstream).toHaveBeenCalledTimes(2);
  });

  it('rejeita artigo sem coordenadas e uma resposta externa malformada', async () => {
    await expect(openResolve({ provider: 'wikipedia', id: 'valid|injected', language: 'pt' })).rejects.toMatchObject({ code: 'INVALID_REFERENCE' });
    expect(mocked.upstream).not.toHaveBeenCalled();
    mocked.upstream.mockResolvedValueOnce({ query: { pages: [{ title: 'Sem posição', pageid: 4 }] } });
    await expect(openResolve({ provider: 'wikipedia', id: '4', language: 'pt' })).rejects.toMatchObject({ code: 'LOCATION_NOT_FOUND' });
    mocked.upstream.mockResolvedValueOnce({ query: { pages: [{ title: 'Inválido', coordinates: [{ lat: 120, lon: 0 }] }] } });
    await expect(openResolve({ provider: 'wikipedia', id: '4', language: 'pt' })).rejects.toMatchObject({ code: 'UPSTREAM_INVALID' });
  });

  it('preserva coordenadas oceânicas e não cria uma atração distante', async () => {
    mocked.upstream.mockResolvedValue({ query: { geosearch: [{ pageid: 7, title: 'Ilha distante', lat: 3, lon: -130, dist: 999000 }] } });
    const result = await openReverse({ lat: 0, lng: -140 });
    expect(result.coordinates).toEqual({ lat: 0, lng: -140 });
    expect(result.name).toBe('Ponto no mapa');
    for (const [url] of mocked.upstream.mock.calls as [URL][]) expect(url.searchParams.get('gsradius')).toBe('1000');
  });

  it('identifica o artigo próximo sem mover o ponto escolhido ou usá-lo como o destino', async () => {
    mocked.upstream.mockResolvedValue({ query: { geosearch: [{ pageid: 7, title: 'Praça próxima', lat: -15.701, lon: -47.9, dist: 120 }] } });
    const result = await openReverse({ lat: -15.7, lng: -47.9 });
    expect(result.name).toBe('Ponto próximo a Praça próxima');
    expect(result.reference).toEqual({ provider: 'coordinates', lat: -15.7, lng: -47.9 });
    expect(result.coordinates).toEqual({ lat: -15.7, lng: -47.9 });
  });

  it('continua com o ponto selecionado quando a fonte está indisponível', async () => {
    mocked.upstream.mockRejectedValue(new Error('network blocked'));
    expect((await openReverse({ lat: 0, lng: -140 })).name).toBe('Ponto no mapa');
    const content = await enrichOpenLocation(coordinateLocation);
    expect(content.photos).toEqual([]);
    expect(content.nearby).toEqual([]);
    expect(content.summary).toContain('Não há uma identidade enciclopédica confirmada');
    expect(content.warnings.some((item) => item.service === 'Wikipedia')).toBe(true);
    expect(content.facts).toHaveLength(2);
  });

  it('não consulta conteúdo de artigo para atribuí-lo a coordenadas avulsas', async () => {
    mocked.upstream.mockResolvedValue({ query: { geosearch: [] } });
    const content = await enrichOpenLocation(coordinateLocation);
    expect(content.summary).toContain('0.00000°, -140.00000°');
    expect(content.photos).toEqual([]);
    for (const [url] of mocked.upstream.mock.calls as [URL][]) expect(url.searchParams.get('list')).toBe('geosearch');
  });

  it('mantém texto factual quando Wikidata e fotos falham', async () => {
    mocked.upstream.mockImplementation((url: URL) => {
      if (url.searchParams.get('list') === 'geosearch') return Promise.resolve({ query: { geosearch: [] } });
      if (url.hostname.includes('wikipedia')) return Promise.resolve({ query: { pages: [{ ...page, pageimage: 'Fotografia.jpg' }] } });
      return Promise.reject(new Error('service unavailable'));
    });
    const content = await enrichOpenLocation({ ...coordinateLocation, reference: { provider: 'wikipedia', id: '101', language: 'pt' } });
    expect(content.summary).toBe('Uma descrição factual.');
    expect(content.sections).toEqual([{ title: 'História', text: 'História documentada.' }]);
    expect(content.warnings.map((item) => item.service)).toContain('Wikidata');
    expect(content.sources[0].url).toContain('pt.wikipedia.org/wiki/Cidade_verificada');
  });

  it('respeita cancelamento em vez de devolver resultados de uma consulta antiga', async () => {
    const controller = new AbortController();
    controller.abort();
    mocked.upstream.mockRejectedValue(controller.signal.reason);
    await expect(openSearch('cidade', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    await expect(openReverse({ lat: 0, lng: 0 }, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocked.upstream).toHaveBeenCalledTimes(2);
  });

  it('rejeita coordenadas inválidas antes de consultar serviços', async () => {
    await expect(openReverse({ lat: Number.NaN, lng: 0 })).rejects.toMatchObject({ code: 'INVALID_COORDINATES' });
    await expect(openReverse({ lat: 0, lng: 181 })).rejects.toMatchObject({ code: 'INVALID_COORDINATES' });
    expect(mocked.upstream).not.toHaveBeenCalled();
  });
});

describe('fotografias ligadas à identidade enciclopédica', () => {
  const image = (title: string, width = 2400, height = 1200, license = 'CC BY-SA 4.0') => ({ title, imageinfo: [{ url: `https://upload.wikimedia.org/wikipedia/commons/a/aa/${title.replace('File:', '')}`, thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/${title.replace('File:', '')}/1920px-photo.jpg`, width, height, mime: 'image/jpeg', extmetadata: { LicenseShortName: { value: license }, Artist: { value: '<a href="https://example.com">Fotógrafa &amp; co.</a><script>unsafe()</script>' }, ImageDescription: { value: '<p>Vista documentada &lt;script&gt;bad&lt;/script&gt;</p>' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/' } } }] });

  it('consulta somente arquivos associados, sanitiza atribuições e prioriza paisagem', async () => {
    mocked.upstream.mockResolvedValue({ query: { pages: [image('File:Retrato.jpg', 1200, 1600), image('File:Paisagem.jpg'), image('File:Pequena.jpg', 300, 200), image('File:Sem licença.jpg', 2400, 1200, 'All rights reserved')] } });
    const photos = await getCommonsPhotos(['File:Retrato.jpg', 'Paisagem.jpg', 'Paisagem.jpg', 'Flag.svg', 'Locator map.png'], 'Local verificado');
    expect(photos.map((photo) => photo.id)).toEqual(['File:Paisagem.jpg', 'File:Retrato.jpg']);
    expect(photos[0].author).toBe('Fotógrafa & co.');
    expect(photos[0].alt).toBe('Vista documentada');
    expect(photos[0].sourceUrl).toContain('commons.wikimedia.org/wiki/File%3APaisagem.jpg');
    const requested = mocked.upstream.mock.calls[0][0] as URL;
    expect(requested.searchParams.get('titles')).toBe('File:Retrato.jpg|File:Paisagem.jpg');
    expect(requested.searchParams.has('gsrsearch')).toBe(false);
  });

  it('rejeita URLs inesperadas e imagens sintéticas declaradas', async () => {
    const unsafe = image('File:Unsafe.jpg');
    unsafe.imageinfo[0].url = 'https://evil.example/photo.jpg';
    unsafe.imageinfo[0].thumburl = 'javascript:alert(1)';
    const artificial = { ...image('File:Generated.jpg'), categories: [{ title: 'Category:AI-generated images' }] };
    mocked.upstream.mockResolvedValue({ query: { pages: [unsafe, artificial] } });
    expect(await getCommonsPhotos(['Unsafe.jpg', 'Generated.jpg'], 'Local')).toEqual([]);
  });

  it('usa o tamanho de miniatura retornado pela API em vez de inventar uma URL', async () => {
    mocked.upstream.mockImplementation((url: URL) => {
      if (url.searchParams.get('iiurlwidth') === '480') return Promise.resolve({ query: { pages: [{ title: 'File:Paisagem.jpg', imageinfo: [{ thumburl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/aa/Paisagem.jpg/500px-Paisagem.jpg?utm_source=commons.wikimedia.org' }] }] } });
      const photograph = image('File:Paisagem.jpg');
      return Promise.resolve({ query: { pages: [photograph] } });
    });
    const photos = await getCommonsPhotos(['Paisagem.jpg'], 'Local');
    expect(photos[0].thumbnailUrl).toBe('https://thumb.wikimedia.org/wikipedia/commons/thumb/a/aa/Paisagem.jpg/500px-Paisagem.jpg');
    expect(photos[0].url).toContain('1920px');
    expect(mocked.upstream).toHaveBeenCalledTimes(2);
  });

  it('não consulta arquivos vagos quando não existe identidade de imagem', async () => {
    expect(await getCommonsPhotos([], 'Somewhere')).toEqual([]);
    expect(mocked.upstream).not.toHaveBeenCalled();
    expect(plainText('&lt;img src=x onerror=evil&gt; texto <b>seguro</b>')).toBe('texto seguro');
  });

  it('consulta somente a categoria vinculada ao destino e exige arquivos de mídia', async () => {
    mocked.upstream.mockResolvedValue({ query: { categorymembers: [{ title: 'File:Destino.jpg', ns: 6 }, { title: 'Category:Outro lugar', ns: 14 }] } });
    expect(await getCommonsCategoryFiles('Verified destination')).toEqual(['File:Destino.jpg']);
    const requested = mocked.upstream.mock.calls[0][0] as URL;
    expect(requested.searchParams.get('cmtitle')).toBe('Category:Verified destination');
    expect(await getCommonsCategoryFiles('bad|injected')).toEqual([]);
    expect(mocked.upstream).toHaveBeenCalledTimes(1);
  });
});

describe('fatos estruturados do Wikidata', () => {
  it('seleciona claims preferidos com unidades verificadas e fontes', async () => {
    const claim = (value: unknown, rank = 'normal', year?: string) => ({ id: 'Q100$guid', rank, mainsnak: { snaktype: 'value', datavalue: { value } }, ...(year ? { qualifiers: { P585: [{ datavalue: { value: { time: `+${year}-01-01T00:00:00Z`, precision: 9 } } }] } } : {}) });
    mocked.upstream.mockResolvedValue({ entities: { Q100: { id: 'Q100', claims: { P18: [claim('Real place.jpg')], P2044: [claim({ amount: '+9000', unit: 'http://www.wikidata.org/entity/Q11573' }, 'deprecated'), claim({ amount: '+8848.86', unit: 'http://www.wikidata.org/entity/Q11573' }, 'preferred')], P1082: [claim({ amount: '+2000', unit: '1' }, 'normal', '2010'), claim({ amount: '+3000', unit: '1' }, 'normal', '2022')], P2046: [claim({ amount: '+1', unit: 'http://example.com/unknown-unit' })] } } } });
    const data = await getWikidataContent('Q100');
    expect(data.images).toEqual(['Real place.jpg']);
    expect(data.facts.map((fact) => fact.value)).toEqual(['8.848,86 m', '3.000 habitantes (2022)']);
    expect(data.facts.every((fact) => fact.sourceUrl.startsWith('https://www.wikidata.org/wiki/Q100'))).toBe(true);
    expect(data.sources[0].name).toContain('CC0');
  });

  it('não inventa fatos para uma entidade ausente', async () => {
    expect(await getWikidataContent(undefined)).toEqual({ facts: [], sources: [], images: [] });
    expect(mocked.upstream).not.toHaveBeenCalled();
  });

  it('preserva imagem e medições verificadas quando a consulta dos rótulos falha', async () => {
    const claim = (value: unknown) => ({ mainsnak: { datavalue: { value } } });
    mocked.upstream.mockResolvedValueOnce({ entities: { Q100: { id: 'Q100', claims: { P18: [claim('Verified.jpg')], P17: [claim({ id: 'Q200' })], P2044: [claim({ amount: '+2000', unit: 'http://www.wikidata.org/entity/Q11573' })] } } } }).mockRejectedValueOnce(new Error('related labels unavailable'));
    const data = await getWikidataContent('Q100');
    expect(data.images).toEqual(['Verified.jpg']);
    expect(data.facts[0].value).toBe('2.000 m');
    expect(data.warnings?.[0].service).toBe('Wikidata');
  });
});
