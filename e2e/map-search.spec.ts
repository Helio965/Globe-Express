import { expect, test } from '@playwright/test';
import { alpha, fulfillDestination, installTestApi, openReadyApp, suggestions } from './fixtures';

test('search retry retains its session and selection starts a fresh interaction', async ({ page }) => {
  await installTestApi(page);
  const tokens: string[] = [];
  let calls = 0;
  let selectedToken: string | undefined;
  await page.route('**/api/search?*', route => {
    const parameters = new URL(route.request().url()).searchParams;
    tokens.push(parameters.get('sessionToken') || '');
    calls++;
    return calls === 1
      ? route.fulfill({ status: 502, json: { error: { code: 'UPSTREAM_FAILED', message: 'Busca de teste temporariamente indisponível.' } } })
      : route.fulfill({ json: { data: suggestions(parameters.get('q') || '') } });
  });
  await page.route('**/api/destination', route => {
    selectedToken = route.request().postDataJSON().sessionToken;
    return fulfillDestination(route, alpha);
  });
  await openReadyApp(page);
  const input = page.getByRole('combobox');
  await input.fill('Alpha');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Busca de teste temporariamente indisponível.');
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await page.mouse.move(0, 0);
  await expect(page.getByRole('option')).toHaveCount(2);
  expect(tokens).toHaveLength(2);
  expect(tokens[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  expect(tokens[1]).toBe(tokens[0]);
  await input.press('ArrowUp');
  await expect(page.getByRole('option').last()).toHaveAttribute('aria-selected', 'true');
  await input.press('ArrowDown');
  await expect(page.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
  await input.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: alpha.location.name })).toBeVisible();
  expect(selectedToken).toBe(tokens[0]);
  await input.fill('Beta');
  await expect(page.getByRole('option')).toHaveCount(1);
  expect(tokens).toHaveLength(3);
  expect(tokens[2]).not.toBe(tokens[0]);
});

test('quota cooldown unlocks manual retry without sending automatic requests', async ({ page }) => {
  await installTestApi(page);
  let calls = 0;
  await page.route('**/api/search?*', route => {
    calls++;
    return calls === 1
      ? route.fulfill({ status: 429, json: { error: { code: 'UPSTREAM_QUOTA', message: 'Aguarde para consultar a fonte de teste.', retryAfter: 1 } } })
      : route.fulfill({ json: { data: suggestions('Alpha') } });
  });
  await openReadyApp(page);
  await page.getByRole('combobox').fill('Alpha');
  const retry = page.locator('.search-retry');
  await expect(retry).toBeDisabled();
  await expect(retry).toBeEnabled();
  expect(calls).toBe(1);
  await retry.click();
  await expect(page.getByRole('option')).toHaveCount(2);
  expect(calls).toBe(2);
});

test('a stalled search ends with an honest timeout and can be retried', async ({ page }) => {
  await installTestApi(page);
  let calls = 0;
  await page.route('**/api/search?*', route => {
    calls++;
    if (calls === 1) return;
    return route.fulfill({ json: { data: suggestions('Alpha') } });
  });
  await openReadyApp(page);
  await page.getByRole('combobox').fill('Alpha');
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('A busca demorou para responder. Tente novamente.', { timeout: 20_000 });
  await expect(page.locator('.search-spinner')).toHaveCount(0);
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByRole('option')).toHaveCount(2);
  expect(calls).toBe(2);
});
