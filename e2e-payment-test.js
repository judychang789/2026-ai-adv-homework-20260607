/**
 * E2E 金流完整測試腳本 — 暮寵日和 PawPaw Shop
 * 執行方式: node e2e-payment-test.js
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:3001';
const VIDEO_DIR = path.join(__dirname, 'test-videos');
const ADMIN_EMAIL = 'admin@hexschool.com';
const ADMIN_PASSWORD = '12345678';

// Test credit card (ECPay sandbox)
const CARD_NO = '4311952222222222';
const CARD_EXPIRY = '1226';
const CARD_CVV = '222';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function main() {
  ensureDir(VIDEO_DIR);

  const runId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const screenshotDir = path.join(VIDEO_DIR, `run-${runId}`);
  ensureDir(screenshotDir);

  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const ctx = await browser.newContext({
    recordVideo: {
      dir: screenshotDir,
      size: { width: 1280, height: 720 }
    },
    viewport: { width: 1280, height: 720 }
  });

  const page = await ctx.newPage();
  const results = [];
  let idx = 0;

  const snap = async (label) => {
    const fname = path.join(screenshotDir, `${String(++idx).padStart(2, '0')}-${label}.png`);
    await page.screenshot({ path: fname });
    console.log(`  📸 ${path.basename(fname)}`);
    return fname;
  };

  const log = (msg) => console.log(`\n${msg}`);

  try {
    // ────────────────────────────────────────────────────────────────
    // Step 1: Homepage
    // ────────────────────────────────────────────────────────────────
    log('【Step 1】首頁');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await snap('homepage');
    results.push({ step: 1, name: '首頁', status: '✅', title: await page.title() });
    console.log(`  標題: ${await page.title()}`);

    // ────────────────────────────────────────────────────────────────
    // Step 2: Products → Add to cart
    // ────────────────────────────────────────────────────────────────
    log('【Step 2】商品列表 → 加入購物車');
    await page.goto(`${BASE_URL}/products`, { waitUntil: 'networkidle', timeout: 20000 });
    await snap('products');

    let added = false;
    try {
      await page.click('button[title="加入購物車"]', { timeout: 5000 });
      added = true;
    } catch (e) {
      const btns = await page.$$('button');
      for (const btn of btns) {
        const t = await btn.getAttribute('title').catch(() => '');
        if (t && t.includes('加入')) { await btn.click(); added = true; break; }
      }
    }
    await page.waitForTimeout(1200);
    await snap('added-to-cart');
    results.push({ step: 2, name: '加入購物車', status: added ? '✅' : '⚠️ 未找到按鈕' });
    console.log(`  加入購物車: ${added ? '成功' : '未找到按鈕'}`);

    // ────────────────────────────────────────────────────────────────
    // Step 3: Cart
    // ────────────────────────────────────────────────────────────────
    log('【Step 3】購物車確認');
    await page.goto(`${BASE_URL}/cart`, { waitUntil: 'networkidle', timeout: 20000 });
    await snap('cart');
    const cartText = await page.textContent('body');
    const hasItems = cartText.includes('NT$');
    results.push({ step: 3, name: '購物車', status: hasItems ? '✅' : '⚠️', hasItems });
    console.log(`  購物車有商品: ${hasItems}`);

    // ────────────────────────────────────────────────────────────────
    // Step 4: Login
    // ────────────────────────────────────────────────────────────────
    log('【Step 4】登入會員');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForSelector('input[placeholder="請輸入 Email"]', { timeout: 8000 });
    await snap('login-page');

    await page.fill('input[placeholder="請輸入 Email"]', ADMIN_EMAIL);
    await page.fill('input[placeholder="請輸入密碼"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    // Login uses window.location.href redirect — waitForURL is more reliable than waitForNavigation
    await page.waitForURL(url => !url.href.includes('/login'), { timeout: 15000 });
    await page.waitForTimeout(800);
    await snap('after-login');
    results.push({ step: 4, name: '登入', status: '✅', url: page.url() });
    console.log(`  登入後 URL: ${page.url()}`);

    // ────────────────────────────────────────────────────────────────
    // Step 5: Cart → Checkout
    // ────────────────────────────────────────────────────────────────
    log('【Step 5】前往結帳');
    await page.goto(`${BASE_URL}/cart`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(600);
    await snap('cart-loggedin');

    let checkoutOk = false;
    try {
      await page.click('button:has-text("前往結帳")', { timeout: 5000 });
      await page.waitForURL(url => url.href.includes('/checkout'), { timeout: 12000 });
      checkoutOk = true;
    } catch (e) {
      console.log(`  ⚠️ 前往結帳按鈕: ${e.message}`);
    }
    await snap('checkout-page');
    results.push({ step: 5, name: '前往結帳', status: checkoutOk ? '✅' : '⚠️', url: page.url() });
    console.log(`  結帳頁 URL: ${page.url()}`);

    // ────────────────────────────────────────────────────────────────
    // Step 6: Fill checkout form + Submit
    // ────────────────────────────────────────────────────────────────
    log('【Step 6】填寫收件資訊並送出訂單');
    await page.waitForTimeout(800);

    await page.fill('input[placeholder="王小明"]', '測試收件人').catch(() => {});
    await page.fill('input[placeholder="0912-345-678"]', '0912345678').catch(() => {});
    await page.fill('input[placeholder="wangxiaoming@email.com"]', 'test@example.com').catch(() => {});
    await page.fill('input[placeholder="台北市"]', '台北市').catch(() => {});
    await page.fill('input[placeholder="大安區"]', '信義區').catch(() => {});
    await page.fill('input[placeholder="羅斯福路四段 1 號"]', '信義路五段7號').catch(() => {});
    await snap('form-filled');

    await page.click('button:has-text("確認下單")');
    await page.waitForURL(url => url.href.includes('/order-confirm/'), { timeout: 20000 });
    await page.waitForTimeout(600);
    const orderConfirmUrl = page.url();
    await snap('order-confirm');
    results.push({ step: 6, name: '送出訂單', status: '✅', url: orderConfirmUrl });
    console.log(`  訂單確認 URL: ${orderConfirmUrl}`);

    // ────────────────────────────────────────────────────────────────
    // Step 7: Order confirm → ECPay
    // ────────────────────────────────────────────────────────────────
    log('【Step 7】跳轉綠界付款頁');
    await page.waitForTimeout(1500);
    await page.waitForSelector('button:has-text("確認付款")', { timeout: 10000 }).catch(() => {});
    await snap('order-confirm-loaded');

    await page.click('button:has-text("確認付款")');
    await page.waitForURL(url => url.href.includes('ecpay.com.tw'), { timeout: 30000 });
    await page.waitForTimeout(2000);
    const ecpayUrl = page.url();
    await snap('ecpay-page');
    const isEcpay = ecpayUrl.includes('ecpay.com.tw');
    results.push({ step: 7, name: '跳轉綠界', status: isEcpay ? '✅' : '⚠️', url: ecpayUrl });
    console.log(`  ECPay URL: ${ecpayUrl}`);

    // ────────────────────────────────────────────────────────────────
    // Step 8: ECPay credit card payment
    // ────────────────────────────────────────────────────────────────
    log('【Step 8】綠界信用卡付款');
    if (isEcpay) {
      // Try to select credit card tab
      for (const sel of ['#liCreditCard a', 'a[data-value="Credit"]', '#CreditPayment']) {
        try { await page.click(sel, { timeout: 3000 }); break; } catch (e) {}
      }
      await page.waitForTimeout(1000);

      // Fill card details
      for (const sel of ['#CardNo', 'input[name="CardNo"]']) {
        try { await page.fill(sel, CARD_NO, { timeout: 3000 }); break; } catch (e) {}
      }
      for (const sel of ['#ExpireDate', 'input[name="ExpireDate"]']) {
        try { await page.fill(sel, CARD_EXPIRY, { timeout: 3000 }); break; } catch (e) {}
      }
      for (const sel of ['#CVV2', 'input[name="CVV2"]']) {
        try { await page.fill(sel, CARD_CVV, { timeout: 3000 }); break; } catch (e) {}
      }
      await snap('ecpay-card-filled');

      // Submit
      let paidOk = false;
      for (const sel of ['#SubmitButton', 'input[type="submit"]', 'button:has-text("確認付款")']) {
        try {
          await page.click(sel, { timeout: 5000 });
          paidOk = true;
          // Wait for redirect back to our site (payment-success or any non-ecpay URL)
          await page.waitForURL(url => !url.href.includes('ecpay.com.tw'), { timeout: 60000 }).catch(() => {});
          break;
        } catch (e) {}
      }
      await page.waitForTimeout(3000);
      await snap('after-ecpay-submit');
      results.push({ step: 8, name: 'ECPay付款', status: paidOk ? '✅' : '⚠️', url: page.url() });
      console.log(`  付款後 URL: ${page.url()}`);
    } else {
      results.push({ step: 8, name: 'ECPay付款', status: '⚠️ 未導向ECPay', url: ecpayUrl });
    }

    // ────────────────────────────────────────────────────────────────
    // Step 9: Payment success
    // ────────────────────────────────────────────────────────────────
    log('【Step 9】付款完成頁確認');
    await snap('payment-result');
    const txt9 = await page.textContent('body').catch(() => '');
    const isPaidOk = txt9.includes('付款成功') || txt9.includes('成功') || page.url().includes('payment-success');
    results.push({ step: 9, name: '付款完成頁', status: isPaidOk ? '✅' : '⚠️', url: page.url() });
    console.log(`  付款成功: ${isPaidOk}, URL: ${page.url()}`);

    // ────────────────────────────────────────────────────────────────
    // Step 10: Orders list
    // ────────────────────────────────────────────────────────────────
    log('【Step 10】訂單列表驗證');
    await page.goto(`${BASE_URL}/orders`, { waitUntil: 'networkidle', timeout: 20000 });
    await snap('orders-list');
    results.push({ step: 10, name: '訂單列表', status: '✅', url: page.url() });

    // ────────────────────────────────────────────────────────────────
    // Exception A: Empty form validation
    // ────────────────────────────────────────────────────────────────
    log('【異常A】表單空白驗證');
    await page.goto(`${BASE_URL}/checkout`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(800);
    await page.click('button:has-text("確認下單")', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);
    await snap('exception-a-validation');
    const txtA = await page.textContent('body').catch(() => '');
    const hasErrors = txtA.includes('請輸入');
    results.push({ scenario: 'A', name: '欄位驗證', status: hasErrors ? '✅' : '⚠️' });
    console.log(`  顯示驗證錯誤: ${hasErrors}`);

  } catch (err) {
    console.error(`\n❌ 測試中止: ${err.message}`);
    await snap('error-state').catch(() => {});
    results.push({ error: true, message: err.message });
  }

  // Close context → finalizes video
  const videoObj = page.video();
  await ctx.close();
  await browser.close();

  const videoPath = videoObj ? await videoObj.path().catch(() => null) : null;

  // ── Print summary ─────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════');
  console.log('  E2E 金流測試結果');
  console.log('════════════════════════════════════════════════');

  const mainSteps = results.filter(r => r.step);
  const exceptions = results.filter(r => r.scenario);
  const errors = results.filter(r => r.error);

  console.log('\n### 正常流程');
  console.log('步驟                 | 結果 | 備註');
  console.log('---------------------|------|------------------');
  for (const r of mainSteps) {
    const note = r.url ? r.url.substring(0, 50) : (r.title || '');
    console.log(`Step ${r.step} ${r.name.padEnd(12)} | ${r.status} | ${note}`);
  }

  if (exceptions.length) {
    console.log('\n### 異常情境');
    for (const r of exceptions) {
      console.log(`${r.scenario} ${r.name} | ${r.status}`);
    }
  }

  if (errors.length) {
    console.log('\n### 錯誤');
    for (const r of errors) console.log(`  ❌ ${r.message}`);
  }

  const allOk = mainSteps.length >= 9 && mainSteps.every(r => r.status === '✅') && !errors.length;
  console.log(`\n整體結果: ${allOk ? '✅ PASS' : '⚠️ FAIL / PARTIAL'}`);

  if (videoPath) {
    console.log(`\n🎬 錄影存檔: ${videoPath}`);
  }
  console.log(`📸 截圖目錄: ${screenshotDir}`);
  console.log('════════════════════════════════════════════════\n');

  return { videoPath, screenshotDir, results };
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
