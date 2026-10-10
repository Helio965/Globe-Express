import assert from "node:assert/strict";

const base = process.env.WORLD_EXPLORER_URL || "http://127.0.0.1:3000";
async function post(path, body, expectedStatus = 200) {
  const response = await fetch(new URL(path, base), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(40_000) });
  const data = await response.json();
  assert.equal(response.status, expectedStatus, `${path}: ${data.error || response.status}`);
  return data;
}

// Acceptance inputs only. Destinations are never registered in application code.
const cases = [
  ["Brasília", /bras[ií]lia/i],
  ["Pirâmides de Gizé", /giz[eé]|giza|pyramid/i],
  ["Monte Everest", /everest/i],
  ["Yosemite National Park", /yosemite/i],
  ["Praia de Copacabana", /copacabana/i],
  ["Tóquio", /^(t[oó]quio|tokyo)$/i],
];

for (const [query, name] of cases) {
  const search = await post("/api/search", { query, sessionToken: crypto.randomUUID() });
  const selected = search.suggestions.find(item => name.test(item.label));
  assert.ok(selected, `Nenhum resultado geográfico correspondente a ${query}`);
  const destination = await post("/api/destination", { ref: selected.ref });
  const { place, photos, nearby, sources, warnings } = destination;
  assert.ok(Number.isFinite(place.coordinates.lat) && Math.abs(place.coordinates.lat) <= 90);
  assert.ok(Number.isFinite(place.coordinates.lng) && Math.abs(place.coordinates.lng) <= 180);
  assert.ok(name.test(place.name));
  assert.ok(Array.isArray(photos) && Array.isArray(nearby) && Array.isArray(sources));
  for (const photo of photos) {
    assert.ok(photo.author && photo.license && photo.sourceUrl, "Créditos incompletos");
    assert.ok(photo.url.startsWith("https://") || photo.url.startsWith("/api/photo?"));
  }
  console.log(`${place.name}: ${photos.length} fotografias, ${nearby.length} lugares próximos, ${warnings.length} avisos (${search.provider}).`);
}

const ocean = { lat: 0, lng: -140 };
const reverse = await post("/api/reverse", ocean);
assert.deepEqual(reverse.coordinates, ocean);
const remote = await post("/api/destination", { ref: { provider: "coordinates", ...ocean } });
assert.deepEqual(remote.place.coordinates, ocean);
assert.equal(remote.photos.length, 0, "Ponto oceânico não deve receber fotografias de outro lugar");
const missing = await post("/api/search", { query: "zzzznonexistentplacexq99001" });
assert.equal(missing.suggestions.length, 0);
await post("/api/reverse", { lat: 91, lng: 0 }, 400);
console.log("Oceano, pesquisa inexistente e coordenadas inválidas: verificados.");
