import type { Page } from "@playwright/test";
import type { Destination, Photo, Place, PlaceRef, SearchSuggestion } from "../src/types/explorer";

// Synthetic fixtures are used only by browser tests. The application never imports this file.
function image(label: string, color: string) {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><rect width="1600" height="1000" fill="${color}"/><text x="100" y="500" fill="white" font-size="70">Fixture: ${label}</text></svg>`)}`;
}

function photo(index: number): Photo {
  const url = image(`Brasília ${index}`, index === 1 ? "#355451" : "#766140");
  return {
    id: `fixture-photo-${index}`, url, thumbnailUrl: url, width: 1600, height: 1000,
    alt: `Vista de teste ${index} de Brasília`, source: "Wikimedia Commons", author: "Autoria de teste",
    license: "CC0 (fixture)", sourceUrl: `https://commons.wikimedia.org/wiki/File:Fixture_${index}.svg`,
  };
}

const brasilia: Place = {
  ref: { provider: "google", id: "test-brasilia-place-id" }, id: "test-brasilia-place-id",
  name: "Brasília", address: "Brasília, Distrito Federal, Brasil", country: "Brasil", region: "Distrito Federal",
  coordinates: { lat: -15.7939, lng: -47.8828 }, source: "Google Maps",
};
const tokyo: Place = {
  ref: { provider: "wikipedia", id: "12345", language: "pt" }, id: "wikipedia:pt:12345",
  name: "Tóquio", address: "Tóquio, Japão", country: "Japão", coordinates: { lat: 35.6762, lng: 139.6503 }, source: "Wikipedia",
};
const everest: Place = {
  ref: { provider: "wikipedia", id: "67890", language: "pt" }, id: "wikipedia:pt:67890",
  name: "Monte Everest", address: "Himalaia", coordinates: { lat: 27.9881, lng: 86.925 }, source: "Wikipedia",
};

function destination(place: Place): Destination {
  return {
    place, summary: `Resumo de teste sobre ${place.name}.`, description: `Descrição enciclopédica de teste sobre ${place.name}.`,
    photos: [], nearby: [], facts: [], warnings: [],
    sources: [{ title: "Wikipédia", url: `https://pt.wikipedia.org/wiki/${encodeURIComponent(place.name)}` }],
  };
}

export const destinations = {
  brasilia: {
    ...destination(brasilia), photos: [photo(1), photo(2)],
    facts: [{ label: "País", value: "Brasil", sourceUrl: "https://www.wikidata.org/wiki/Q2844" }],
    nearby: [{ place: tokyo }, { place: everest }],
  },
  tokyo: destination(tokyo),
  everest: { ...destination(everest), summary: "", description: "", warnings: ["Informações limitadas nesta resposta de teste."] },
} satisfies Record<string, Destination>;

export function byRef(ref: PlaceRef): Destination | undefined {
  return Object.values(destinations).find(item => JSON.stringify(item.place.ref) === JSON.stringify(ref));
}

export async function mockApi(page: Page) {
  // Avoid a network dependency for the external attribution logo during fixture tests.
  await page.route("https://maps.gstatic.com/**", route => route.fulfill({
    contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="144" height="18"><text y="14">Google (test)</text></svg>',
  }));
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().postDataJSON() as { query?: string; ref?: PlaceRef };
    if (path === "/api/search") {
      if (body.query === "FALHA") {
        await route.fulfill({ status: 503, json: { error: "Serviço indisponível nesta consulta de teste.", code: "TEST_UNAVAILABLE" } });
        return;
      }
      const query = (body.query ?? "").toLocaleLowerCase("pt-BR");
      const suggestions: SearchSuggestion[] = Object.values(destinations)
        .filter(item => item.place.name.toLocaleLowerCase("pt-BR").includes(query))
        .map(item => ({ ref: item.place.ref, label: item.place.name, description: item.place.address }));
      await route.fulfill({ json: { suggestions, provider: "wikipedia", warnings: [] } });
      return;
    }
    const result = body.ref && byRef(body.ref);
    if (result && (path === "/api/destination" || path === "/api/resolve")) {
      await route.fulfill({ json: path === "/api/resolve" ? result.place : result });
      return;
    }
    await route.fulfill({ status: 404, json: { error: "Fixture não encontrada.", code: "TEST_NOT_FOUND" } });
  });
}
