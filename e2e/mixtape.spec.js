import { expect, test } from '@playwright/test';

test('opens from the cabinet, rides solo, pauses, rescues and restarts in local co-op', async ({ page, hasTouch }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', {name:'Got it'}).click();
  await page.getByRole('link', { name: 'Mixtape Run' }).click();
  await expect(page.getByRole('heading', { name: 'Mixtape Run' })).toBeVisible();
  await page.clock.install();
  await page.getByRole('button', { name: 'Solo' }).click();
  await expect(page.locator('#hop-two')).toBeHidden();
  await page.getByRole('button', { name: 'Pause ride' }).click();
  const start = await page.locator('#progress').getAttribute('style');
  await page.clock.runFor(2000);
  expect(await page.locator('#progress').getAttribute('style')).toBe(start);
  await page.getByRole('button', { name: 'Resume ride' }).click();
  await page.clock.runFor(5400);
  await expect(page.locator('#hop-one')).toContainText('Amber');
  // The second hurdle reaches Amber about 7.35 s after the ride started.
  await page.clock.runFor(1500);
  if (hasTouch) await page.locator('#hop-one').tap();
  else await page.keyboard.press('Space');
  await page.clock.runFor(750);
  await expect(page.locator('#message')).toContainText('Back together');
  await page.clock.runFor(20000);
  await expect(page.getByRole('button', { name: 'Ride again' })).toBeVisible();
  await page.getByRole('button', { name: 'Change players' }).click();
  await page.getByRole('button', { name: 'Two players' }).click();
  await expect(page.locator('#hop-two')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
