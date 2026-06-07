const crypto = require('crypto');

function getEcpayConfig() {
  const env = process.env.ECPAY_ENV === 'production' ? 'production' : 'staging';

  return {
    merchantId: process.env.ECPAY_MERCHANT_ID || '3002607',
    hashKey: process.env.ECPAY_HASH_KEY || 'pwFHCqoQZGmho4w6',
    hashIv: process.env.ECPAY_HASH_IV || 'EkRm7iFT261dpevs',
    env
  };
}

function getPaymentBaseUrl(config = getEcpayConfig()) {
  return config.env === 'production'
    ? 'https://payment.ecpay.com.tw'
    : 'https://payment-stage.ecpay.com.tw';
}

function getAioCheckoutUrl(config = getEcpayConfig()) {
  return `${getPaymentBaseUrl(config)}/Cashier/AioCheckOut/V5`;
}

function getQueryTradeInfoUrl(config = getEcpayConfig()) {
  return `${getPaymentBaseUrl(config)}/Cashier/QueryTradeInfo/V5`;
}

function getAppBaseUrl() {
  return process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
}

function ecpayUrlEncode(source) {
  let encoded = encodeURIComponent(source)
    .replace(/%20/g, '+')
    .replace(/~/g, '%7e')
    .replace(/'/g, '%27');

  encoded = encoded.toLowerCase();

  const replacements = {
    '%2d': '-',
    '%5f': '_',
    '%2e': '.',
    '%21': '!',
    '%2a': '*',
    '%28': '(',
    '%29': ')'
  };

  for (const [search, replace] of Object.entries(replacements)) {
    encoded = encoded.split(search).join(replace);
  }

  return encoded;
}

function generateCheckMacValue(params, hashKey, hashIv, method = 'sha256') {
  const filtered = Object.fromEntries(
    Object.entries(params).filter(([key]) => key !== 'CheckMacValue')
  );
  const sortedKeys = Object.keys(filtered).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const paramString = sortedKeys.map((key) => `${key}=${filtered[key]}`).join('&');
  const raw = `HashKey=${hashKey}&${paramString}&HashIV=${hashIv}`;
  const encoded = ecpayUrlEncode(raw);
  return crypto.createHash(method).update(encoded, 'utf8').digest('hex').toUpperCase();
}

function verifyCheckMacValue(params, hashKey, hashIv, method = 'sha256') {
  const received = params.CheckMacValue || '';
  const calculated = generateCheckMacValue(params, hashKey, hashIv, method);
  const receivedBuffer = Buffer.from(received);
  const calculatedBuffer = Buffer.from(calculated);

  if (receivedBuffer.length !== calculatedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(receivedBuffer, calculatedBuffer);
}

function getMerchantTradeDate() {
  return new Date().toLocaleString('sv-SE', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).replace(/-/g, '/');
}

function buildMerchantTradeNo() {
  const timestamp = Date.now().toString().slice(-10);
  const random = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 8);
  return `FL${timestamp}${random}`;
}

function sanitizeEcpayText(text) {
  return String(text || '')
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/[<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateByChars(text, maxChars) {
  const chars = Array.from(text);
  return chars.length <= maxChars ? text : chars.slice(0, maxChars).join('');
}

function buildItemName(items) {
  const value = items.map((item) => `${item.product_name} x ${item.quantity}`).join('#');
  return truncateByChars(sanitizeEcpayText(value) || 'Flower Life Order', 200);
}

function buildTradeDescription(orderNo) {
  return truncateByChars(sanitizeEcpayText(`FlowerLife-${orderNo}`) || 'FlowerLifeOrder', 50);
}

function buildAioCheckoutParams({ order, items, merchantTradeNo }) {
  const config = getEcpayConfig();
  const appBaseUrl = getAppBaseUrl();

  const params = {
    MerchantID: config.merchantId,
    MerchantTradeNo: merchantTradeNo,
    MerchantTradeDate: getMerchantTradeDate(),
    PaymentType: 'aio',
    TotalAmount: String(order.total_amount),
    TradeDesc: buildTradeDescription(order.order_no),
    ItemName: buildItemName(items),
    ReturnURL: `${appBaseUrl}/api/orders/payment/ecpay/callback`,
    ClientBackURL: `${appBaseUrl}/payment-success/${order.id}`,
    ChoosePayment: 'ALL',
    NeedExtraPaidInfo: 'Y',
    EncryptType: '1'
  };

  params.CheckMacValue = generateCheckMacValue(params, config.hashKey, config.hashIv, 'sha256');
  return params;
}

async function queryTradeInfo(merchantTradeNo) {
  const config = getEcpayConfig();
  const params = {
    MerchantID: config.merchantId,
    MerchantTradeNo: merchantTradeNo,
    TimeStamp: String(Math.floor(Date.now() / 1000))
  };

  params.CheckMacValue = generateCheckMacValue(params, config.hashKey, config.hashIv, 'sha256');

  const response = await fetch(getQueryTradeInfoUrl(config), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams(params).toString()
  });

  if (!response.ok) {
    throw new Error(`ECPay query failed with status ${response.status}`);
  }

  const text = await response.text();
  const parsed = Object.fromEntries(new URLSearchParams(text).entries());

  if (!parsed.CheckMacValue) {
    throw new Error('ECPay query response missing CheckMacValue');
  }

  if (!verifyCheckMacValue(parsed, config.hashKey, config.hashIv, 'sha256')) {
    throw new Error('ECPay query response CheckMacValue verification failed');
  }

  return parsed;
}

module.exports = {
  buildAioCheckoutParams,
  buildMerchantTradeNo,
  ecpayUrlEncode,
  generateCheckMacValue,
  getAioCheckoutUrl,
  getAppBaseUrl,
  getEcpayConfig,
  getMerchantTradeDate,
  queryTradeInfo,
  verifyCheckMacValue
};
