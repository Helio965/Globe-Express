import { afterEach, describe, expect, it, vi } from "vitest";
import type { Place } from "@/types/explorer";
import { enrichWikipedia, nearbyWikipedia, resolveWikipedia, reverseWikipedia, searchWikipedia } from "./wikimedia";

const place: Place = {
  id: "wikipedia:pt:123", name: "Monte Teste", address: "Montanha", coordinates: { lat: -22, lng: -43 },
  source: "Wikipedia", ref: { provider: "wikipedia", language: "pt", id: "123" },
};
const article = {
  pageid: 123, title: "Monte Teste", coordinates: [{ lat: -22, lon: -43 }],
  extract: "Monte Teste é uma montanha.\n\nPossui uma descrição geográfica.", description: "Montanha",
  pageprops: { wikibase_item: "Q123" }, pageimage: "Monte Teste.jpg",
};
const imageInfo = {
  title: "File:Monte Teste.jpg", pageid: 50,
  imageinfo: [{
    url: "https://upload.wikimedia.org/wikipedia/commons/a/a1/Monte_Teste.jpg",
    thumburl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Monte_Teste.jpg/1600px-Monte_Teste.jpg",
    descriptionurl: "https://commons.wikimedia.org/wiki/File:Monte_Teste.jpg", width: 3000, height: 2000, mime: "image/jpeg",
    extmetadata: { Artist: { value: '<a href="javascript:alert(1)">Autora</a>' }, LicenseShortName: { value: "CC BY-SA 4.0" }, ImageDescription: { value: "Monte Teste ao amanhecer" } },
  }],
};
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
function mockFetch(handler: (url: URL) => Response | Promise<Response>) {
  return vi.stubGlobal("fetch", vi.fn((input: string | URL | Request) => handler(new URL(String(input)))));
}
function metadataFetch(options: {
  page?: unknown; entity?: unknown; photos?: unknown[]; commonsStatus?: number; wikidataStatus?: number; labelsStatus?: number;
} = {}) {
  mockFetch(url => {
    if (url.hostname.endsWith("wikipedia.org")) return response({ query: { pages: [options.page ?? article] } });
    if (url.hostname === "www.wikidata.org") {
      if (url.searchParams.get("ids") !== "Q123") return response({ entities: { Q456: { labels: { pt: { value: "País Teste" } } } } }, options.labelsStatus);
      return response({ entities: { Q123: options.entity ?? { claims: { P18: [{ mainsnak: { datavalue: { value: "Monte Teste.jpg" } } }] } } } }, options.wikidataStatus);
    }
    if (url.hostname === "commons.wikimedia.org") return response({ query: { pages: options.photos ?? [imageInfo] } }, options.commonsStatus);
    throw new Error(`Unexpected endpoint: ${url.hostname}`);
  });
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("geographical Wikipedia search", () => {
  it("resolves a Wikidata map coordinate when the geographic article has no MediaWiki coordinates", async () => {
    mockFetch(url => url.hostname.endsWith("wikipedia.org")
      ? response({ query: { pages: [{ pageid: 1865, title: "Tóquio", pageprops: { wikibase_item: "Q1490" } }] } })
      : response({ entities: { Q1490: { claims: { P625: [{ mainsnak: { datavalue: { value: { latitude: 35.68, longitude: 139.69, globe: "http://www.wikidata.org/entity/Q2" } } } }] } } } }));
    expect((await searchWikipedia("Tóquio"))[0]).toMatchObject({ label: "Tóquio", ref: { id: "1865", language: "pt" } });
    expect((await resolveWikipedia({ provider: "wikipedia", id: "1865", language: "pt" })).coordinates).toEqual({ lat: 35.68, lng: 139.69 });
  });

  it("does not use a non-Earth structured coordinate to identify a location", async () => {
    mockFetch(url => url.hostname.endsWith("wikipedia.org")
      ? response({ query: { pages: [{ pageid: 1, title: "Cratera", pageprops: { wikibase_item: "Q1" } }] } })
      : response({ entities: { Q1: { claims: { P625: [{ mainsnak: { datavalue: { value: { latitude: 1, longitude: 2, globe: "http://www.wikidata.org/entity/Q111" } } } }] } } } }));
    expect(await searchWikipedia("Cratera")).toEqual([]);
  });

  it("only suggests geotagged Earth articles and excludes disambiguation pages", async () => {
    mockFetch(() => response({ query: { pages: [
      { ...article, index: 2 },
      { ...article, pageid: 2, pageprops: { disambiguation: "" }, index: 1 },
      { pageid: 3, title: "A pessoa", description: "Biografia" },
      { ...article, pageid: 4, coordinates: [{ lat: 2, lon: 3, globe: "mars" }] },
      { ...article, pageid: 5, coordinates: [{ lat: 200, lon: 2 }] },
    ] } }));
    const suggestions = await searchWikipedia("monte");
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].ref).toEqual({ provider: "wikipedia", language: "pt", id: "123" });
  });

  it("uses an English geographic result when Portuguese has none", async () => {
    const hosts: string[] = [];
    mockFetch(url => { hosts.push(url.hostname); return response({ query: { pages: url.hostname.startsWith("pt") ? [] : [article] } }); });
    expect((await searchWikipedia("monte"))[0].ref).toEqual({ provider: "wikipedia", language: "en", id: "123" });
    expect(hosts).toEqual(["pt.wikipedia.org", "en.wikipedia.org"]);
  });

  it("does not let a tangential Portuguese place hide the exact English destination", async () => {
    mockFetch(url => response({ query: { pages: url.hostname.startsWith("pt")
      ? [{ ...article, pageid: 10, title: "General Sherman (árvore)", pageprops: { wikibase_item: "Q10" }, index: 9 }]
      : [{ ...article, pageid: 20, title: "Yosemite National Park", pageprops: { wikibase_item: "Q20" }, index: 1 }],
    } }));
    const suggestions = await searchWikipedia("Yosemite National Park");
    expect(suggestions[0]).toMatchObject({ label: "Yosemite National Park", ref: { provider: "wikipedia", language: "en", id: "20" } });
  });

  it("deduplicates translations by Wikidata identity and keeps the Portuguese article", async () => {
    mockFetch(url => response({ query: { pages: [{ ...article, title: url.hostname.startsWith("pt") ? "Parque Nacional de Yosemite" : "Yosemite National Park", pageid: url.hostname.startsWith("pt") ? 10 : 20, index: 1 }] } }));
    const suggestions = await searchWikipedia("Yosemite National Park");
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({ label: "Parque Nacional de Yosemite", ref: { language: "pt", id: "10" } });
  });

  it("avoids an extra language request when Portuguese already has the exact destination", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(response({ query: { pages: [article] } })));
    vi.stubGlobal("fetch", fetchMock);
    expect((await searchWikipedia("Monte Teste"))[0].ref).toMatchObject({ language: "pt" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("accepts MediaWiki's real empty-generator envelope without a query field", async () => {
    mockFetch(() => response({ batchcomplete: true, limits: { coordinates: 500 } }));
    expect(await searchWikipedia("sem correspondência")).toEqual([]);
    expect(await nearbyWikipedia(place)).toEqual([]);
  });

  it("reports upstream errors instead of converting unavailable search to no results", async () => {
    mockFetch(url => url.hostname.startsWith("pt") ? response({ query: { pages: [] } }) : response({}, 503));
    await expect(searchWikipedia("monte")).rejects.toThrow("HTTP 503");
  });

  it("resolves the requested geographic article and rejects non-geographic pages", async () => {
    mockFetch(() => response({ query: { pages: [article] } }));
    expect((await resolveWikipedia({ provider: "wikipedia", language: "pt", id: "123" })).coordinates).toEqual(place.coordinates);
    mockFetch(() => response({ query: { pages: [{ pageid: 123, title: "A pessoa" }] } }));
    await expect(resolveWikipedia({ provider: "wikipedia", language: "pt", id: "123" })).rejects.toThrow("Local não encontrado");
  });

  it("keeps remote ocean coordinates exact without replacing them with a nearby article", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const coordinates = { lat: -46.12345678, lng: -123.87654321 };
    const selected = await reverseWikipedia(coordinates);
    expect(selected.coordinates).toEqual(coordinates);
    expect(selected.ref).toEqual({ provider: "coordinates", ...coordinates });
    expect((await enrichWikipedia(selected)).sources).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps nearby recommendations separate and sorted by distance", async () => {
    mockFetch(() => response({ query: { pages: [article, { ...article, pageid: 456, title: "Serra Vizinha", coordinates: [{ lat: -22.01, lon: -43 }] }] } }));
    const nearby = await nearbyWikipedia(place);
    expect(nearby).toHaveLength(1);
    expect(nearby[0].place.name).toBe("Serra Vizinha");
    expect(nearby[0].distanceMeters).toBeGreaterThan(1_000);
    expect(place.coordinates).toEqual({ lat: -22, lng: -43 });
  });

  it("adds only independently credited lead photos to at most four nearby places", async () => {
    const neighbors = Array.from({ length: 6 }, (_item, index) => ({
      ...article, pageid: 456 + index, title: `Serra Vizinha ${index + 1}`, pageimage: `Serra_${index + 1}.jpg`,
      coordinates: [{ lat: -22 - (index + 1) * 0.005, lon: -43 }],
      images: [{ title: "File:Monte Teste.jpg" }],
    }));
    const requestedPhotos: string[] = [];
    mockFetch(url => {
      if (url.hostname.endsWith("wikipedia.org")) {
        expect(url.searchParams.get("prop")).toBe("coordinates|pageprops|description|pageimages");
        expect(url.searchParams.get("piprop")).toBe("name");
        return response({ query: { pages: [article, ...neighbors] } });
      }
      expect(url.hostname).toBe("commons.wikimedia.org");
      const title = url.searchParams.get("titles")!;
      const filename = title.replace(/^File:/, "");
      requestedPhotos.push(title);
      return response({ query: { pages: [{
        ...imageInfo, title,
        imageinfo: [{ ...imageInfo.imageinfo[0], url: `https://upload.wikimedia.org/wikipedia/commons/a/a1/${filename}`,
          thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/${filename}/1600px-${filename}`,
          descriptionurl: `https://commons.wikimedia.org/wiki/${title}`, extmetadata: {
          ...imageInfo.imageinfo[0].extmetadata, ImageDescription: { value: `Fotografia de ${title}` },
        } }],
      }] } });
    });
    const nearby = await nearbyWikipedia(place);
    expect(nearby).toHaveLength(6);
    expect(requestedPhotos).toEqual(["File:Serra_1.jpg", "File:Serra_2.jpg", "File:Serra_3.jpg", "File:Serra_4.jpg"]);
    for (const [index, candidate] of nearby.entries()) {
      expect(candidate.place.name).toBe(`Serra Vizinha ${index + 1}`);
      if (index < 4) {
        expect(candidate.photo).toMatchObject({
          author: "Autora", license: "CC BY-SA 4.0", source: "Wikimedia Commons",
          url: `https://upload.wikimedia.org/wikipedia/commons/a/a1/Serra_${index + 1}.jpg`,
          sourceUrl: `https://commons.wikimedia.org/wiki/File:Serra_${index + 1}.jpg`,
        });
      } else expect(candidate.photo).toBeUndefined();
    }
  });

  it("keeps nearby places when their photo request fails or credits are incomplete", async () => {
    const neighbors = [
      { ...article, pageid: 456, title: "Serra Vizinha", pageimage: "Serra.jpg", coordinates: [{ lat: -22.01, lon: -43 }] },
      { ...article, pageid: 789, title: "Praia Vizinha", pageimage: "Praia.jpg", coordinates: [{ lat: -22.02, lon: -43 }] },
    ];
    mockFetch(url => {
      if (url.hostname.endsWith("wikipedia.org")) return response({ query: { pages: neighbors } });
      if (url.searchParams.get("titles") === "File:Praia.jpg") return response({}, 503);
      return response({ query: { pages: [{
        ...imageInfo, title: "File:Serra.jpg", imageinfo: [{ ...imageInfo.imageinfo[0], extmetadata: { LicenseShortName: { value: "CC BY 4.0" } } }],
      }] } });
    });
    const nearby = await nearbyWikipedia(place);
    expect(nearby.map(candidate => candidate.place.name)).toEqual(["Serra Vizinha", "Praia Vizinha"]);
    expect(nearby.every(candidate => candidate.photo === undefined)).toBe(true);
  });

  it("retains nearby places when the shared five-second photo deadline expires", async () => {
    const photoTimeout = new AbortController();
    const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockImplementation(milliseconds => milliseconds === 5_000 ? photoTimeout.signal : nativeTimeout(milliseconds));
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      if (new URL(String(input)).hostname.endsWith("wikipedia.org")) return Promise.resolve(response({ query: { pages: [
        { ...article, pageid: 456, title: "Serra Vizinha", coordinates: [{ lat: -22.01, lon: -43 }] },
      ] } }));
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
        queueMicrotask(() => photoTimeout.abort(new DOMException("Photo deadline", "TimeoutError")));
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const nearby = await nearbyWikipedia(place);
    expect(nearby).toHaveLength(1);
    expect(nearby[0].place.name).toBe("Serra Vizinha");
    expect(nearby[0].photo).toBeUndefined();
    expect(timeoutSpy).toHaveBeenCalledWith(5_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("propagates caller cancellation during optional nearby photo retrieval", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      if (new URL(String(input)).hostname.endsWith("wikipedia.org")) return Promise.resolve(response({ query: { pages: [
        { ...article, pageid: 456, title: "Serra Vizinha", coordinates: [{ lat: -22.01, lon: -43 }] },
      ] } }));
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
        queueMicrotask(() => controller.abort());
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(nearbyWikipedia(place, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("honors caller cancellation before making requests", async () => {
    const controller = new AbortController(); controller.abort();
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(searchWikipedia("monte", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops an in-flight request on caller cancellation instead of starting English fallback", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn((_input: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);
    const pending = searchWikipedia("monte", controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(enrichWikipedia({ ...place, ref: { provider: "coordinates", ...place.coordinates } }, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("source attribution and independent enrichment", () => {
  it("enriches a geocoder-identified map point only through matching name and coordinates", async () => {
    metadataFetch();
    const coordinates = { lat: -22.001, lng: -43.001 };
    const selected: Place = { ...place, id: "coordinates:selected", source: "Google Maps", coordinates, ref: { provider: "coordinates", ...coordinates } };
    const result = await enrichWikipedia(selected);
    expect(result.summary).toBe("Monte Teste é uma montanha.");
    expect(result.photos).toHaveLength(1);
    expect(selected.coordinates).toEqual(coordinates);
    expect(selected.ref).toEqual({ provider: "coordinates", ...coordinates });
  });

  it("does not borrow article imagery for an anonymous map point even when its label matches", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const selected: Place = { ...place, source: "Coordinates", ref: { provider: "coordinates", ...place.coordinates } };
    const result = await enrichWikipedia(selected);
    expect(result.summary).toBe("");
    expect(result.photos).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { name: "Monte Teste", coordinates: { lat: 40, lng: 10 } },
    { name: "Outro Monte", coordinates: place.coordinates },
  ])("rejects a geocoded point whose name or location does not match the article: $name", async ({ name, coordinates }) => {
    metadataFetch();
    const selected: Place = { ...place, name, coordinates, source: "Google Maps", ref: { provider: "coordinates", ...coordinates } };
    const result = await enrichWikipedia(selected);
    expect(result.summary).toBe("");
    expect(result.photos).toEqual([]);
    expect(result.sources).toEqual([]);
  });

  it("returns licensed subject imagery, plain attribution and original source links", async () => {
    metadataFetch();
    const result = await enrichWikipedia(place);
    expect(result.summary).toBe("Monte Teste é uma montanha.");
    expect(result.description).toContain("descrição geográfica");
    expect(result.photos).toHaveLength(1);
    expect(result.photos[0]).toMatchObject({ author: "Autora", license: "CC BY-SA 4.0", source: "Wikimedia Commons", sourceUrl: imageInfo.imageinfo[0].descriptionurl });
    expect(result.sources[0].url).toBe("https://pt.wikipedia.org/wiki/Monte_Teste");
  });

  it("rejects non-Wikimedia image URLs, insecure links and incomplete attribution", async () => {
    for (const info of [
      { ...imageInfo.imageinfo[0], url: "https://upload.wikimedia.org.attacker.test/photo.jpg" },
      { ...imageInfo.imageinfo[0], thumburl: "http://upload.wikimedia.org/photo.jpg" },
      { ...imageInfo.imageinfo[0], descriptionurl: "javascript:alert(1)" },
      { ...imageInfo.imageinfo[0], thumburl: "https://upload.wikimedia.org:8080/photo.jpg" },
      { ...imageInfo.imageinfo[0], extmetadata: { LicenseShortName: { value: "CC BY 4.0" } } },
      { ...imageInfo.imageinfo[0], extmetadata: { Artist: { value: "Autora" }, LicenseShortName: { value: "All rights reserved" } } },
      { ...imageInfo.imageinfo[0], extmetadata: { Artist: { value: "Autora" }, LicenseShortName: { value: "CC BY-NC 4.0" } } },
      { ...imageInfo.imageinfo[0], extmetadata: { Artist: { value: "Autora" }, LicenseShortName: { value: "CC BY-ND 4.0" } } },
    ]) {
      metadataFetch({ photos: [{ ...imageInfo, imageinfo: [info] }] });
      const result = await enrichWikipedia(place);
      expect(result.photos).toEqual([]);
      expect(result.warnings.some(warning => warning.includes("Nenhuma fotografia"))).toBe(true);
    }
  });

  it("accepts Commons' current official thumbnail host", async () => {
    metadataFetch({ photos: [{ ...imageInfo, imageinfo: [{ ...imageInfo.imageinfo[0], thumburl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a1/Monte_Teste.jpg/1600px-Monte_Teste.jpg" }] }] });
    const result = await enrichWikipedia(place);
    expect(result.photos).toHaveLength(1);
    expect(result.photos[0].thumbnailUrl).toContain("https://thumb.wikimedia.org/");
  });

  it("removes scripts and leaves no markup after decoding numeric HTML entities", async () => {
    metadataFetch({ page: { ...article, extract: "Primeiro parágrafo.\nSegundo parágrafo." }, photos: [{
      ...imageInfo, imageinfo: [{ ...imageInfo.imageinfo[0], extmetadata: {
        ...imageInfo.imageinfo[0].extmetadata, Artist: { value: "<script>alert(1)</script><b>Autor</b> &#60;img src=x onerror=alert(1)&#62;" },
      } }],
    }] });
    const result = await enrichWikipedia(place);
    expect(result.summary).toBe("Primeiro parágrafo.");
    expect(result.description).toContain("Segundo parágrafo.");
    expect(result.photos[0].author).not.toContain("<");
    expect(result.photos[0].author).not.toContain("<script>");
  });

  it("excludes art and maps even when the subject occurs in the title and caption", async () => {
    for (const categories of ["1901 oil on canvas paintings|Paintings in museum", "Maps of Portugal", "Coats of arms"]) {
      metadataFetch({ photos: [{ ...imageInfo, imageinfo: [{ ...imageInfo.imageinfo[0], extmetadata: { ...imageInfo.imageinfo[0].extmetadata, Categories: { value: categories } } }] }] });
      expect((await enrichWikipedia(place)).photos).toEqual([]);
    }
  });

  it("requires photographic evidence for auxiliary article images", async () => {
    const extra = { ...imageInfo, title: "File:Monte Teste visto do sul.jpg", imageinfo: [{ ...imageInfo.imageinfo[0], extmetadata: { ...imageInfo.imageinfo[0].extmetadata, Categories: { value: "Taken with Canon EOS 5D|Photographs of mountains" } } }] };
    metadataFetch({ page: { ...article, pageimage: undefined, pageprops: {}, images: [{ title: extra.title }] }, photos: [extra] });
    expect((await enrichWikipedia(place)).photos).toHaveLength(1);
    metadataFetch({ page: { ...article, pageimage: undefined, pageprops: {}, images: [{ title: extra.title }] }, photos: [{ ...extra, imageinfo: [{ ...extra.imageinfo[0], extmetadata: imageInfo.imageinfo[0].extmetadata }] }] });
    expect((await enrichWikipedia(place)).photos).toEqual([]);
  });

  it("does not promote unrelated article illustrations to destination photos", async () => {
    const requestedTitles: string[] = [];
    mockFetch(url => {
      if (url.hostname.endsWith("wikipedia.org")) return response({ query: { pages: [{ ...article, pageimage: undefined, pageprops: {}, images: [{ title: "File:Other City.jpg" }, { title: "File:Monte Teste map.png" }, { title: "File:Monte Teste hotel.jpg" }] }] } });
      requestedTitles.push(url.searchParams.get("titles") ?? "");
      return response({ query: { pages: [{ ...imageInfo, title: "File:Monte Teste hotel.jpg", imageinfo: [{ ...imageInfo.imageinfo[0], extmetadata: { ...imageInfo.imageinfo[0].extmetadata, ImageDescription: { value: "Uma paisagem de outro país" } } }] }] } });
    });
    const result = await enrichWikipedia(place);
    expect(requestedTitles.join("|")).not.toContain("Other City");
    expect(requestedTitles.join("|")).not.toContain("map.png");
    expect(result.photos).toEqual([]);
  });

  it("retains article information and numeric facts when photo and label requests fail", async () => {
    metadataFetch({ commonsStatus: 503, labelsStatus: 503, entity: { claims: {
      P2044: [{ mainsnak: { datavalue: { value: { amount: "+2450", unit: "http://www.wikidata.org/entity/Q11573" } } } }],
      P17: [{ mainsnak: { datavalue: { value: { id: "Q456" } } } }],
    } } });
    const result = await enrichWikipedia(place);
    expect(result.summary).toBeTruthy();
    expect(result.facts).toContainEqual({ label: "Altitude", value: "2.450 m", sourceUrl: "https://www.wikidata.org/wiki/Q123" });
    expect(result.photos).toEqual([]);
    expect(result.warnings).toContain("Não foi possível carregar as fotografias do Wikimedia Commons.");
    expect(result.warnings.some(warning => warning.includes("nomes de regiões"))).toBe(true);
  });

  it("still retrieves the article's lead photo when Wikidata is unavailable", async () => {
    metadataFetch({ wikidataStatus: 503 });
    const result = await enrichWikipedia(place);
    expect(result.photos).toHaveLength(1);
    expect(result.warnings).toContain("Os dados complementares do Wikidata estão indisponíveis.");
  });

  it("uses the latest dated population and validates measurement units", async () => {
    const population = (amount: string, time: string) => ({ mainsnak: { datavalue: { value: { amount, unit: "1" } } }, qualifiers: { P585: [{ datavalue: { value: { time } } }] } });
    metadataFetch({ entity: { claims: {
      P1082: [population("+100", "+2010-01-01T00:00:00Z"), population("+200", "+2024-01-01T00:00:00Z")],
      P2044: [{ mainsnak: { datavalue: { value: { amount: "+500", unit: "http://www.wikidata.org/entity/Q3710" } } } }],
      P2046: [{ mainsnak: { datavalue: { value: { amount: "+2000000", unit: "http://www.wikidata.org/entity/Q25343" } } } }],
    } } });
    const result = await enrichWikipedia(place);
    expect(result.facts).toContainEqual(expect.objectContaining({ label: "População (2024)", value: "200" }));
    expect(result.facts).toContainEqual(expect.objectContaining({ label: "Área", value: "2 km²" }));
    expect(result.facts.some(fact => fact.label === "Altitude")).toBe(false);
  });

  it("does not attach a namesake article far from the selected Google place", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(response({ query: { pages: [article] } })));
    vi.stubGlobal("fetch", fetchMock);
    const selected: Place = { ...place, id: "google:place", ref: { provider: "google", id: "place" }, source: "Google Maps", coordinates: { lat: 40, lng: 10 } };
    const result = await enrichWikipedia(selected);
    expect(result.summary).toBe("");
    expect(result.photos).toEqual([]);
    expect(result.sources).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not attach a nearby but differently named article to a Google place", async () => {
    metadataFetch();
    const selected: Place = { ...place, name: "Outro Monte", id: "google:place", ref: { provider: "google", id: "place" }, source: "Google Maps" };
    expect((await enrichWikipedia(selected)).sources).toEqual([]);
  });
});
