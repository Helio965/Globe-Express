import { expect, test, type Page } from "@playwright/test";
import { destinations, mockApi } from "./fixtures";
import type { PlaceRef } from "../src/types/explorer";

async function selectDestination(page: Page, name = "Brasília") {
  await page.getByRole("combobox", { name: "Pesquisar qualquer lugar do mundo" }).fill(name);
  await page.getByRole("option", { name: new RegExp(name) }).click();
}

async function openPresentation(page: Page) {
  await selectDestination(page);
  await page.getByRole("button", { name: "Explorar este local", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Brasília", exact: true })).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
});

test("boas-vindas e mapa sem chave explicam a disponibilidade real", async ({ page }) => {
  await expect(page.getByRole("heading", { level: 1 })).toContainText("O mundo tem");
  await page.getByRole("button", { name: "Explorar o mapa", exact: true }).click();
  await expect(page.getByText("Mapa disponível após configurar o Google Maps.", { exact: false })).toBeVisible();
  await expect(page.getByText("Ilustração geográfica · mapa interativo indisponível")).toBeVisible();
  const controls = page.getByRole("group", { name: "Tipo de mapa" }).getByRole("button");
  await expect(controls).toHaveCount(3);
  for (const control of await controls.all()) await expect(control).toBeDisabled();
  await expect(page.locator('script[src*="maps.googleapis.com/maps/api/js"]')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("busca, apresentação, galeria, detalhes, créditos e retorno ao mapa", async ({ page }) => {
  await openPresentation(page);
  const gallery = page.getByRole("group", { name: "Fotografias de Brasília. Use as setas para navegar." });
  await expect(gallery.getByRole("button", { name: /^Ver fotografia 1/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Próxima fotografia", exact: true }).click();
  await expect(gallery.getByRole("button", { name: /^Ver fotografia 2/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".cinematic-gallery-count")).toContainText("Fotografia 2 de 2");
  await page.getByRole("button", { name: "Fotografia anterior", exact: true }).click();
  await expect(page.locator(".cinematic-gallery-count")).toContainText("Fotografia 1 de 2");
  await page.getByRole("button", { name: "Saiba mais", exact: true }).click();
  const details = page.getByRole("dialog", { name: "Brasília", exact: true });
  await expect(details).toBeVisible();
  await expect(details.getByText(destinations.brasilia.description, { exact: true })).toBeVisible();
  await expect(details.getByRole("link", { name: "CC BY-SA 4.0" })).toHaveAttribute("href", "https://creativecommons.org/licenses/by-sa/4.0/");
  await expect(details.getByRole("link", { name: "Consultar fonte" })).toHaveAttribute("href", "https://www.wikidata.org/wiki/Q2844");
  await details.getByRole("button", { name: "Explorar no mapa", exact: true }).click();
  await expect(details).not.toBeVisible();
  await expect(page.getByRole("region", { name: "Exploração pelo mapa" })).toBeVisible();
  await page.getByRole("button", { name: "Cinemático", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Brasília", exact: true })).toBeVisible();
});

test("favoritos persistem somente referências e podem ser removidos após recarregar", async ({ page }) => {
  await openPresentation(page);
  await page.getByRole("button", { name: "Salvar Brasília nos favoritos", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remover Brasília dos favoritos", exact: true })).toHaveAttribute("aria-pressed", "true");
  const expected = [destinations.brasilia.place.ref];
  const records = await page.evaluate(() => ({
    favorites: JSON.parse(localStorage.getItem("world-explorer:favorites:v1") || "[]") as unknown,
    history: JSON.parse(localStorage.getItem("world-explorer:history:v1") || "[]") as unknown,
  }));
  expect(records).toEqual({ favorites: expected, history: expected });
  await page.reload();
  await page.getByRole("button", { name: /Meus lugares/ }).click();
  const saved = page.getByRole("dialog", { name: "Meus lugares.", exact: true });
  await expect(saved.getByRole("button", { name: /Brasília Google Maps/ })).toBeVisible();
  await saved.getByRole("button", { name: /Brasília Google Maps/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Brasília", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remover Brasília dos favoritos", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /Meus lugares/ }).click();
  await saved.getByRole("button", { name: "Remover Brasília dos favoritos", exact: true }).click();
  await expect(saved.getByText("A próxima descoberta é sua.")).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("world-explorer:favorites:v1") || "[]") as unknown)).toEqual([]);
  await saved.getByRole("button", { name: "Histórico", exact: true }).click();
  await page.getByRole("button", { name: "Limpar histórico", exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("world-explorer:history:v1") || "[]") as unknown)).toEqual([]);
});

test("resultados vazios e falha de pesquisa permitem uma nova consulta", async ({ page }) => {
  const search = page.getByRole("combobox");
  await search.fill("Lugar que não existe na fixture");
  await expect(page.getByRole("status")).toHaveText("Nenhum lugar encontrado. Tente outro nome ou região.");
  await expect(page.getByRole("option")).toHaveCount(0);
  await search.fill("FALHA");
  await expect(page.getByRole("status")).toHaveText("Serviço indisponível nesta consulta de teste.");
  await expect(page.getByRole("button", { name: "Tentar novamente", exact: true })).toBeVisible();
  await search.fill("Brasília");
  await expect(page.getByRole("option", { name: /Brasília/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tentar novamente", exact: true })).toHaveCount(0);
});

test("lugares próximos sem fotografias mantêm o destino e explicam as lacunas", async ({ page }) => {
  await openPresentation(page);
  await page.getByRole("button", { name: "Explorar Monte Everest", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Monte Everest", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Monte Everest", level: 1 })).toBeInViewport();
  await expect(page.getByText("Nenhuma fotografia verificada disponível para este lugar.")).toBeVisible();
  await expect(page.getByText("Ainda não há uma descrição disponível para este lugar. Explore sua localização no mapa.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Próxima fotografia", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Saiba mais", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Monte Everest" }).getByText("Informações limitadas nesta resposta de teste.")).toBeVisible();
});

test("uma resposta antiga não substitui o destino selecionado depois", async ({ page }) => {
  await openPresentation(page);
  let releaseOld!: () => void;
  let oldFinished!: () => void;
  const oldRelease = new Promise<void>(resolve => { releaseOld = resolve; });
  const oldCompletion = new Promise<void>(resolve => { oldFinished = resolve; });
  await page.route("**/api/destination", async route => {
    const { ref } = route.request().postDataJSON() as { ref: PlaceRef };
    if (JSON.stringify(ref) !== JSON.stringify(destinations.tokyo.place.ref)) return route.fallback();
    await oldRelease;
    try { await route.fulfill({ json: destinations.tokyo }); }
    finally { oldFinished(); }
  });
  const oldRequest = page.waitForRequest(request => request.url().endsWith("/api/destination")
    && JSON.stringify((request.postDataJSON() as { ref: PlaceRef }).ref) === JSON.stringify(destinations.tokyo.place.ref));
  await page.getByRole("button", { name: "Explorar Tóquio", exact: true }).click();
  await oldRequest;
  await page.getByRole("button", { name: "Explorar Monte Everest", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Monte Everest", level: 1 })).toBeVisible();
  releaseOld();
  await oldCompletion;
  // Cross a browser rendering boundary after the held response is released; no timing sleeps.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.getByRole("heading", { name: "Monte Everest", level: 1 })).toBeVisible();
  const history = await page.evaluate(() => JSON.parse(localStorage.getItem("world-explorer:history:v1") || "[]") as unknown);
  expect(history).toEqual([destinations.everest.place.ref, destinations.brasilia.place.ref]);
});

test("voltar ao início cancela o destino pendente e preserva a navegação", async ({ page }) => {
  await openPresentation(page);
  let releaseOld!: () => void;
  let oldFinished!: () => void;
  const oldRelease = new Promise<void>(resolve => { releaseOld = resolve; });
  const oldCompletion = new Promise<void>(resolve => { oldFinished = resolve; });
  await page.route("**/api/destination", async route => {
    const { ref } = route.request().postDataJSON() as { ref: PlaceRef };
    if (JSON.stringify(ref) !== JSON.stringify(destinations.tokyo.place.ref)) return route.fallback();
    await oldRelease;
    try { await route.fulfill({ json: destinations.tokyo }); }
    finally { oldFinished(); }
  });
  const oldRequest = page.waitForRequest(request => request.url().endsWith("/api/destination")
    && JSON.stringify((request.postDataJSON() as { ref: PlaceRef }).ref) === JSON.stringify(destinations.tokyo.place.ref));
  await page.getByRole("button", { name: "Explorar Tóquio", exact: true }).click();
  await oldRequest;
  await page.getByRole("button", { name: "World Explorer — início", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("O mundo tem");
  await expect(page.getByText("Consultando localização, informações e fotografias…")).toHaveCount(0);
  releaseOld();
  await oldCompletion;
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.getByRole("heading", { level: 1 })).toContainText("O mundo tem");
  await expect(page.getByRole("heading", { level: 1, name: "Tóquio", exact: true })).toHaveCount(0);
  const history = await page.evaluate(() => JSON.parse(localStorage.getItem("world-explorer:history:v1") || "[]") as unknown);
  expect(history).toEqual([destinations.brasilia.place.ref]);
});

test("a busca só referencia opções visíveis ao fechar ou não encontrar resultados", async ({ page }) => {
  const search = page.getByRole("combobox");
  await search.fill("Brasília");
  const option = page.getByRole("option", { name: /Brasília/ });
  await expect(option).toBeVisible();
  await search.press("ArrowDown");
  await expect(search).toHaveAttribute("aria-activedescendant", (await option.getAttribute("id"))!);
  await search.press("Escape");
  await expect(search).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(search).not.toHaveAttribute("aria-activedescendant");
  await expect(search).not.toHaveAttribute("aria-controls");
  await search.fill("Lugar que não existe na fixture");
  await expect(page.getByRole("status")).toHaveText("Nenhum lugar encontrado. Tente outro nome ou região.");
  await search.press("ArrowUp");
  await expect(page.getByRole("option")).toHaveCount(0);
  await expect(search).not.toHaveAttribute("aria-activedescendant");
});

test("teclado, movimento reduzido e telas estreitas preservam a navegação", async ({ page }) => {
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  await expectNoHorizontalOverflow(page);
  const search = page.getByRole("combobox");
  await search.focus();
  await search.fill("Brasília");
  await expect(page.getByRole("option", { name: /Brasília/ })).toBeVisible();
  await search.press("ArrowDown");
  await expect(page.getByRole("option", { name: /Brasília/ })).toHaveAttribute("aria-selected", "true");
  await expect(search).toHaveAttribute("aria-activedescendant", /.+-option-0/);
  await search.press("Enter");
  const explore = page.getByRole("button", { name: "Explorar este local", exact: true });
  await explore.focus();
  await explore.press("Enter");
  const gallery = page.getByRole("group", { name: "Fotografias de Brasília. Use as setas para navegar." });
  await gallery.focus();
  await gallery.press("ArrowRight");
  await expect(page.locator(".cinematic-gallery-count")).toContainText("Fotografia 2 de 2");
  const more = page.getByRole("button", { name: "Saiba mais", exact: true });
  await more.focus();
  await more.press("Enter");
  await expect(page.getByRole("button", { name: "Fechar detalhes", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Brasília", exact: true })).not.toBeVisible();
  await expect(more).toBeFocused();
  await expectNoHorizontalOverflow(page);
  await page.setViewportSize({ width: 740, height: 390 });
  await expectNoHorizontalOverflow(page);
  await page.getByRole("button", { name: "Ver Brasília no mapa", exact: true }).click();
  await expect(page.getByRole("region", { name: "Exploração pelo mapa" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("páginas de privacidade e termos têm conteúdo e navegação de retorno", async ({ page }) => {
  await page.getByRole("link", { name: "Privacidade", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sua exploração, seus dados." })).toBeVisible();
  await expect(page.getByText("O que fica no seu navegador", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "termos de uso e atribuição" }).click();
  await expect(page.getByRole("heading", { name: "Explore com contexto." })).toBeVisible();
  await page.getByRole("link", { name: /Voltar ao World Explorer/ }).click();
  await expect(page.getByRole("combobox")).toBeVisible();
});
