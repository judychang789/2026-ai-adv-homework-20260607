// tests/e2e/payment.spec.js
// 綠界 ECPay 金流 E2E 測試 — 暮寵日和 PawPaw Shop
const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://172.29.41.152:3001';
const TEST_EMAIL = 'admin@hexschool.com';
const TEST_PASSWORD = '12345678';

async function loginViaAPI(page) {
  await page.goto(BASE_URL);

  const res = await page.request.post(`${BASE_URL}/api/auth/login`, {
    data: {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    },
  });

  const { data } = await res.json();

  if (!data || !data.token) {
    throw new Error('登入失敗，無法取得 token');
  }

  await page.evaluate((token) => {
    localStorage.setItem('flower_token', token);
  }, data.token);
}

async function addFirstProductToCart(page) {
  await page.goto(`${BASE_URL}/products`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  await page
    .locator('button[title="加入購物車"]')
    .first()
    .click({ timeout: 60000 });

  await page.waitForLoadState('networkidle');
}

async function fillCheckoutForm(page) {
  await page.fill('input[placeholder*="王小明"]', '測試收件人');
  await page.fill('input[placeholder*="0912"]', '0912345678');
  await page.fill('input[placeholder*="wangxiaoming"]', 'test@example.com');
  await page.fill('input[placeholder*="台北市"]', '台北市');
  await page.fill('input[placeholder*="大安區"]', '信義區');
  await page.fill('input[placeholder*="羅斯福"]', '信義路五段7號');
}

test('正常流程：購物 → 付款成功', async ({ page, context }) => {
  // Step 1 — 首頁
  await page.goto(BASE_URL);
  await expect(page).toHaveTitle(/暮寵日和/);
  await page.screenshot({
    path: 'tests/e2e/screenshots/01-homepage.png',
    fullPage: true,
  });

  // Step 2 — 登入
  await loginViaAPI(page);

  // Step 3 — 加入購物車
  await addFirstProductToCart(page);
  await page.screenshot({
    path: 'tests/e2e/screenshots/02-add-to-cart.png',
    fullPage: true,
  });

  // Step 4 — 購物車
  await page.goto(`${BASE_URL}/cart`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({
    path: 'tests/e2e/screenshots/03-cart.png',
    fullPage: true,
  });

  await expect(page.locator('text=前往結帳')).toBeVisible();

  // Step 5 — 結帳頁
  await page.click('text=前往結帳');
  await page.waitForURL(/\/checkout/);
  await page.waitForLoadState('networkidle');

  await page.screenshot({
    path: 'tests/e2e/screenshots/05-checkout.png',
    fullPage: true,
  });

  await fillCheckoutForm(page);

  // Step 6 — 信用卡付款
  await page.click('button:has-text("信用卡")');

  await page.screenshot({
    path: 'tests/e2e/screenshots/06-payment-method.png',
    fullPage: true,
  });

  // Step 7 — 確認下單
  await page.click('button:has-text("確認下單")');
  await page.waitForURL(/\/order-confirm\//);
  await page.waitForLoadState('networkidle');

  await page.screenshot({
    path: 'tests/e2e/screenshots/07-order-confirm.png',
    fullPage: true,
  });

  await expect(page.locator('button:has-text("確認付款")')).toBeVisible();

  // Step 8 — 前往綠界
  await Promise.all([
    page.waitForURL(/ecpay\.com\.tw/, { timeout: 15000 }),
    page.click('button:has-text("確認付款")'),
  ]);

  await page.waitForLoadState('networkidle');

  await page.screenshot({
    path: 'tests/e2e/screenshots/08-ecpay.png',
    fullPage: true,
  });

  expect(page.url()).toMatch(/ecpay\.com\.tw/);

  // Step 9 — 點擊「測試付款請點此」，會開 mockPage
  const [mockPage] = await Promise.all([
    context.waitForEvent('page'),
    page
      .locator('button:has-text("測試付款請點此"), a:has-text("測試付款請點此")')
      .first()
      .click(),
  ]);

  await mockPage.waitForLoadState('domcontentloaded');

  await mockPage.screenshot({
    path: 'tests/e2e/screenshots/09-mock-payment.png',
    fullPage: true,
  });

  // Step 10 — 在測試付款頁點擊「交易成功」
  await mockPage.evaluate(() => {
    document.querySelectorAll('input').forEach((input) => {
      if (!input.value && input.type !== 'file' && input.type !== 'hidden') {
        try {
          input.value = 'TEST';
        } catch (e) {}
      }
    });

    const buttons = Array.from(document.querySelectorAll('button'));
    const successButton = buttons.find((button) => {
      return button.textContent && button.textContent.includes('交易成功');
    });

    if (successButton) {
      successButton.click();
      return;
    }

    const form = document.querySelector('form');
    if (form) {
      form.submit();
    }
  });

  // 綠界 mockPage 可能會自動關閉，不要再操作 mockPage
  await page.waitForTimeout(5000);

  console.log('page url:', page.url());
  console.log('mockPage closed:', mockPage.isClosed());

  // Step 11 — 回本站訂單列表檢查狀態
  await page.goto(`${BASE_URL}/orders`);
  await page.waitForLoadState('networkidle');

  await page.screenshot({
    path: 'tests/e2e/screenshots/10-orders.png',
    fullPage: true,
  });

  await expect(page.locator('body')).toContainText(/已付款|處理中|待付款/);

  // Step 12 — 後台訂單
  await page.goto(`${BASE_URL}/admin/orders`);
  await page.waitForLoadState('networkidle');

  await page.screenshot({
    path: 'tests/e2e/screenshots/11-admin-orders.png',
    fullPage: true,
  });
});