const { createApp, ref, computed, onMounted } = Vue;

const paymentLabelMap = {
  credit: '信用卡',
  atm: 'ATM 轉帳',
  cvs: '超商付款',
};

createApp({
  setup() {
    if (!Auth.requireAuth()) return {};

    const el = document.getElementById('app');
    const orderId = el.dataset.orderId;

    const order = ref(null);
    const loading = ref(true);
    const paying = ref(false);

    const savedPaymentMethod = sessionStorage.getItem('petlife_payment_method') || 'credit';
    const paymentLabel = paymentLabelMap[savedPaymentMethod] || '信用卡';

    const subtotal = computed(function () {
      if (!order.value) return 0;
      return order.value.items.reduce(function (s, i) {
        return s + i.product_price * i.quantity;
      }, 0);
    });

    const shipping = computed(function () {
      return subtotal.value >= 500 ? 0 : 150;
    });

    const discount = computed(function () {
      if (!order.value) return 0;
      return Math.max(0, subtotal.value + shipping.value - order.value.total_amount);
    });

    const estimatedDelivery = computed(function () {
      if (!order.value) return '';
      var d = new Date(order.value.created_at);
      d.setDate(d.getDate() + 2);
      var y = d.getFullYear();
      var m = String(d.getMonth() + 1).padStart(2, '0');
      var day = String(d.getDate()).padStart(2, '0');
      return y + '/' + m + '/' + day;
    });

    function submitEcpayForm(action, fields) {
      var form = document.createElement('form');
      form.method = 'POST';
      form.action = action;
      form.style.display = 'none';
      Object.keys(fields).forEach(function (key) {
        var input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = fields[key];
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
    }

    async function startEcpayCheckout() {
      if (!order.value || paying.value) return;
      paying.value = true;
      try {
        const res = await apiFetch('/api/orders/' + order.value.id + '/payment/ecpay/checkout', {
          method: 'POST'
        });
        submitEcpayForm(res.data.action, res.data.fields);
      } catch (err) {
        Notification.show(err?.data?.message || '建立綠界付款失敗', 'error');
      } finally {
        paying.value = false;
      }
    }

    onMounted(async function () {
      try {
        const res = await apiFetch('/api/orders/' + orderId);
        order.value = res.data;
      } catch (e) {
        Notification.show('載入訂單失敗', 'error');
        window.location.href = '/cart';
      } finally {
        loading.value = false;
      }
    });

    return {
      order, loading, paying,
      paymentLabel, subtotal, shipping, discount, estimatedDelivery,
      startEcpayCheckout,
    };
  }
}).mount('#app');
