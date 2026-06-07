const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const authMiddleware = require('../middleware/authMiddleware');
const {
  buildAioCheckoutParams,
  buildMerchantTradeNo,
  getAioCheckoutUrl,
  getEcpayConfig,
  queryTradeInfo,
  verifyCheckMacValue
} = require('../services/ecpay');

const router = express.Router();

function generateOrderNo() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const random = uuidv4().slice(0, 5).toUpperCase();
  return `ORD-${dateStr}-${random}`;
}

function updateOrderPaymentState(orderId, paymentData) {
  const tradeStatus = String(paymentData.TradeStatus || '');
  const currentOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);

  if (!currentOrder) return null;

  let nextStatus = currentOrder.status;
  if (tradeStatus === '1') {
    nextStatus = 'paid';
  } else if (tradeStatus === '10200095') {
    nextStatus = 'failed';
  }

  db.prepare(
    `UPDATE orders
     SET status = ?,
         ecpay_trade_no = COALESCE(?, ecpay_trade_no),
         payment_type = COALESCE(?, payment_type),
         payment_date = COALESCE(?, payment_date),
         payment_checked_at = datetime('now')
     WHERE id = ?`
  ).run(
    nextStatus,
    paymentData.TradeNo || null,
    paymentData.PaymentType || null,
    paymentData.PaymentDate || null,
    orderId
  );

  return db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
}

/**
 * @openapi
 * /api/orders/payment/ecpay/callback:
 *   post:
 *     summary: ECPay Server Notify callback
 *     tags: [Orders]
 *     description: 接收綠界伺服器端通知並在 CheckMacValue 驗證成功後更新訂單付款欄位。本專案本機開發時不依賴此 callback 作為最終付款確認來源，實際狀態仍以 QueryTradeInfo 主動查詢為準。
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             required: [MerchantTradeNo, CheckMacValue]
 *             properties:
 *               MerchantTradeNo:
 *                 type: string
 *               TradeNo:
 *                 type: string
 *               PaymentType:
 *                 type: string
 *               PaymentDate:
 *                 type: string
 *               RtnCode:
 *                 type: string
 *               CheckMacValue:
 *                 type: string
 *     responses:
 *       200:
 *         description: 成功處理 callback
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: 1|OK
 *       400:
 *         description: 缺少必要欄位或 CheckMacValue 驗證失敗
 */
router.post('/payment/ecpay/callback', (req, res) => {
  const config = getEcpayConfig();
  const payload = { ...req.body };

  if (!payload.MerchantTradeNo || !payload.CheckMacValue) {
    return res.status(400).type('text/plain').send('Missing callback params');
  }

  if (!verifyCheckMacValue(payload, config.hashKey, config.hashIv, 'sha256')) {
    return res.status(400).type('text/plain').send('CheckMacValue Error');
  }

  const order = db.prepare('SELECT id FROM orders WHERE merchant_trade_no = ?').get(payload.MerchantTradeNo);
  if (order) {
    updateOrderPaymentState(order.id, {
      TradeStatus: payload.RtnCode === '1' ? '1' : '',
      TradeNo: payload.TradeNo || null,
      PaymentType: payload.PaymentType || null,
      PaymentDate: payload.PaymentDate || null
    });
  }

  return res.type('text/plain').send('1|OK');
});

router.use(authMiddleware);

/**
 * @openapi
 * /api/orders:
 *   post:
 *     summary: 建立訂單
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [recipientName, recipientEmail, recipientAddress]
 *             properties:
 *               recipientName:
 *                 type: string
 *               recipientEmail:
 *                 type: string
 *                 format: email
 *               recipientAddress:
 *                 type: string
 *     responses:
 *       201:
 *         description: 訂單建立成功
 *       400:
 *         description: 驗證失敗、購物車為空或庫存不足
 *       401:
 *         description: 未授權
 */
router.post('/', (req, res) => {
  const { recipientName, recipientEmail, recipientAddress } = req.body;
  const userId = req.user.userId;

  if (!recipientName || !recipientEmail || !recipientAddress) {
    return res.status(400).json({
      data: null,
      error: 'VALIDATION_ERROR',
      message: '收件人姓名、Email 和地址為必填欄位'
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(recipientEmail)) {
    return res.status(400).json({
      data: null,
      error: 'VALIDATION_ERROR',
      message: 'Email 格式不正確'
    });
  }

  const cartItems = db.prepare(
    `SELECT ci.id, ci.product_id, ci.quantity,
            p.name as product_name, p.price as product_price, p.stock as product_stock
     FROM cart_items ci
     JOIN products p ON ci.product_id = p.id
     WHERE ci.user_id = ?`
  ).all(userId);

  if (cartItems.length === 0) {
    return res.status(400).json({
      data: null,
      error: 'CART_EMPTY',
      message: '購物車為空'
    });
  }

  const insufficientItems = cartItems.filter((item) => item.quantity > item.product_stock);
  if (insufficientItems.length > 0) {
    const names = insufficientItems.map((item) => item.product_name).join(', ');
    return res.status(400).json({
      data: null,
      error: 'STOCK_INSUFFICIENT',
      message: `以下商品庫存不足：${names}`
    });
  }

  const totalAmount = cartItems.reduce(
    (sum, item) => sum + item.product_price * item.quantity, 0
  );

  const orderId = uuidv4();
  const orderNo = generateOrderNo();

  const createOrder = db.transaction(() => {
    db.prepare(
      `INSERT INTO orders (id, order_no, user_id, recipient_name, recipient_email, recipient_address, total_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(orderId, orderNo, userId, recipientName, recipientEmail, recipientAddress, totalAmount);

    const insertItem = db.prepare(
      `INSERT INTO order_items (id, order_id, product_id, product_name, product_price, quantity)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    const updateStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');

    for (const item of cartItems) {
      insertItem.run(uuidv4(), orderId, item.product_id, item.product_name, item.product_price, item.quantity);
      updateStock.run(item.quantity, item.product_id);
    }

    db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(userId);
  });

  createOrder();

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  const orderItems = db.prepare(
    'SELECT product_name, product_price, quantity FROM order_items WHERE order_id = ?'
  ).all(orderId);

  res.status(201).json({
    data: {
      id: order.id,
      order_no: order.order_no,
      total_amount: order.total_amount,
      status: order.status,
      items: orderItems,
      created_at: order.created_at
    },
    error: null,
    message: '訂單建立成功'
  });
});

/**
 * @openapi
 * /api/orders:
 *   get:
 *     summary: 取得目前會員的訂單列表
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功
 *       401:
 *         description: 未授權
 */
router.get('/', (req, res) => {
  const orders = db.prepare(
    'SELECT id, order_no, total_amount, status, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.user.userId);

  res.json({
    data: { orders },
    error: null,
    message: '成功'
  });
});

/**
 * @openapi
 * /api/orders/{id}:
 *   get:
 *     summary: 取得訂單詳情
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 成功
 *       401:
 *         description: 未授權
 *       404:
 *         description: 訂單不存在
 */
router.get('/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId);

  if (!order) {
    return res.status(404).json({ data: null, error: 'NOT_FOUND', message: '訂單不存在' });
  }

  const items = db.prepare(`
    SELECT oi.*, p.image_url AS product_image
    FROM order_items oi
    LEFT JOIN products p ON oi.product_id = p.id
    WHERE oi.order_id = ?
  `).all(order.id);

  res.json({
    data: { ...order, items },
    error: null,
    message: '成功'
  });
});

/**
 * @openapi
 * /api/orders/{id}/payment/ecpay/checkout:
 *   post:
 *     summary: 建立 ECPay AIO 付款表單欄位
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 成功回傳綠界付款表單欄位
 *       400:
 *         description: 訂單狀態不允許付款
 *       401:
 *         description: 未授權
 *       404:
 *         description: 訂單不存在
 */
router.post('/:id/payment/ecpay/checkout', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId);

  if (!order) {
    return res.status(404).json({ data: null, error: 'NOT_FOUND', message: '訂單不存在' });
  }

  if (order.status === 'paid') {
    return res.status(400).json({
      data: null,
      error: 'INVALID_STATUS',
      message: '訂單已付款，無需再次建立付款單'
    });
  }

  const items = db.prepare(
    'SELECT product_name, product_price, quantity FROM order_items WHERE order_id = ? ORDER BY rowid ASC'
  ).all(order.id);

  const requiresNewTradeNo = !order.merchant_trade_no || order.status === 'failed';
  const merchantTradeNo = requiresNewTradeNo ? buildMerchantTradeNo() : order.merchant_trade_no;

  db.prepare(
    `UPDATE orders
     SET merchant_trade_no = ?,
         ecpay_trade_no = NULL,
         payment_type = NULL,
         payment_date = NULL,
         payment_checked_at = datetime('now'),
         status = 'pending'
     WHERE id = ?`
  ).run(merchantTradeNo, order.id);

  const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
  const fields = buildAioCheckoutParams({
    order: updatedOrder,
    items,
    merchantTradeNo
  });

  res.json({
    data: {
      action: getAioCheckoutUrl(),
      method: 'POST',
      merchant_trade_no: merchantTradeNo,
      fields
    },
    error: null,
    message: '綠界付款表單已建立'
  });
});

/**
 * @openapi
 * /api/orders/{id}/payment/ecpay/verify:
 *   post:
 *     summary: 主動查詢 ECPay 付款結果
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     description: 本機環境無法依賴 Server Notify 時，由前端回跳後主動呼叫此端點，後端再向綠界 QueryTradeInfo 查詢交易狀態並更新訂單。
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 成功取得最新付款狀態
 *       400:
 *         description: 尚未建立綠界付款單
 *       401:
 *         description: 未授權
 *       404:
 *         description: 訂單不存在
 *       502:
 *         description: 綠界查詢失敗或驗證失敗
 */
router.post('/:id/payment/ecpay/verify', async (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId);

  if (!order) {
    return res.status(404).json({ data: null, error: 'NOT_FOUND', message: '訂單不存在' });
  }

  if (!order.merchant_trade_no) {
    return res.status(400).json({
      data: null,
      error: 'PAYMENT_NOT_INITIALIZED',
      message: '此訂單尚未建立綠界付款單'
    });
  }

  try {
    const payment = await queryTradeInfo(order.merchant_trade_no);
    const updatedOrder = updateOrderPaymentState(order.id, payment);

    res.json({
      data: {
        order: updatedOrder,
        payment: {
          trade_status: String(payment.TradeStatus || ''),
          trade_no: payment.TradeNo || null,
          payment_type: payment.PaymentType || null,
          payment_date: payment.PaymentDate || null,
          is_paid: String(payment.TradeStatus || '') === '1',
          is_failed: String(payment.TradeStatus || '') === '10200095'
        }
      },
      error: null,
      message: '已向綠界查詢最新付款狀態'
    });
  } catch (err) {
    res.status(502).json({
      data: null,
      error: 'PAYMENT_QUERY_FAILED',
      message: err.message || '綠界付款狀態查詢失敗'
    });
  }
});

module.exports = router;
