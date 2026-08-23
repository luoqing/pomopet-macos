import { expect, test } from '@playwright/test';

test('control surface renders and completes browser fallback timer flow', async ({ page }) => {
  const errors = []; page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); }); page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/'); await expect(page.getByRole('heading', { name: '认真工作，也要好好生活。' })).toBeVisible();
  await page.getByPlaceholder('这颗番茄，想完成什么？').fill('验证 Pomopet 核心流程');
  await page.getByRole('button', { name: '开始专注' }).click(); await expect(page.getByRole('button', { name: '暂停' })).toBeVisible();
  await expect(page.locator('#clock')).toHaveText(/^24:5[89]$/);
  await page.getByRole('button', { name: '暂停' }).click(); await expect(page.getByRole('button', { name: '继续' })).toBeVisible();
  await page.getByRole('button', { name: '喂饼干' }).click();
  await expect(page.locator('#momoPreview')).toHaveAttribute('src', /momo-feed\.gif$/);
  await page.getByRole('button', { name: '闹钟', exact: true }).click(); await page.getByRole('button', { name: '＋ 新闹钟' }).click();
  await expect(page.getByPlaceholder('提醒标签')).toBeVisible(); await expect(page.locator('#alarmWhen')).toHaveAttribute('type', 'datetime-local');
  await page.locator('#alarmPose').selectOption('water'); await expect(page.locator('#alarmPose')).toHaveValue('water');
  expect(errors).toEqual([]); await page.screenshot({ path: 'artifacts/screenshots/control-window.png', fullPage: true });
});

test('pet surface renders the illustrated companion without console errors', async ({ page }) => {
  const errors = []; page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); }); page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 300, height: 280 });
  await page.goto('/pet.html'); await expect(page.getByAltText('桌面小狗末末')).toBeVisible();
  await expect(page.locator('#petStage')).toHaveAttribute('data-state', 'idle'); expect(errors).toEqual([]);
  await page.getByRole('button', { name: '打开 Pomopet 小屋' }).click();
  await page.getByRole('button', { name: '喂零食' }).click();
  await expect(page.locator('#petStage')).toHaveAttribute('data-state', 'interactionFeed');
  await expect(page.locator('#petStage')).toHaveAttribute('data-tool', 'feed');
  await expect(page.getByAltText('桌面小狗末末')).toHaveAttribute('src', /momo-feed\.gif$/);
  await page.screenshot({ path: 'artifacts/screenshots/pet-window.png', omitBackground: true });
});
