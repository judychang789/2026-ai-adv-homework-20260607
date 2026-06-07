const { createApp, ref, computed, onMounted } = Vue;

const paymentOptions = [
  {
    value: 'credit',
    label: '信用卡',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>',
  },
  {
    value: 'atm',
    label: 'ATM轉帳',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/></svg>',
  },
  {
    value: 'cvs',
    label: '超商付款',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  },
];

createApp({
  setup() {
    if (!Auth.requireAuth()) return {};

    const loading = ref(true);
    const submitting = ref(false);
    const cartItems = ref([]);
    const form = ref({
      recipientName: '',
      phone: '',
      recipientEmail: '',
      city: '',
      district: '',
      address: '',
    });
    const errors = ref({});
    const paymentMethod = ref('credit');
    const cardNumber = ref('');
    const cardName = ref('');
    const cardExpiry = ref('');
    const cardCvv = ref('');
    const discount = ref(0);

    const cartTotal = computed(function () {
      return cartItems.value.reduce(function (sum, item) {
        return sum + item.product.price * item.quantity;
      }, 0);
    });

    const shipping = computed(function () {
      return cartTotal.value >= 500 ? 0 : 150;
    });

    const grandTotal = computed(function () {
      return Math.max(0, cartTotal.value - discount.value) + shipping.value;
    });

    function validate() {
      errors.value = {};
      if (!form.value.recipientName.trim()) errors.value.recipientName = '請輸入姓名';
      if (!form.value.phone.trim()) errors.value.phone = '請輸入電話';
      if (!form.value.recipientEmail.trim()) {
        errors.value.recipientEmail = '請輸入 Email';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.recipientEmail)) {
        errors.value.recipientEmail = 'Email 格式不正確';
      }
      if (!form.value.city.trim()) errors.value.city = '請輸入縣市';
      if (!form.value.district.trim()) errors.value.district = '請輸入行政區';
      if (!form.value.address.trim()) errors.value.address = '請輸入地址';
      return Object.keys(errors.value).length === 0;
    }

    async function submitOrder() {
      if (!validate() || submitting.value) return;
      submitting.value = true;
      try {
        const payload = {
          recipientName: form.value.recipientName,
          recipientEmail: form.value.recipientEmail,
          recipientAddress: form.value.city + form.value.district + form.value.address,
        };
        const res = await apiFetch('/api/orders', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        sessionStorage.setItem('petlife_checkout_form', JSON.stringify(form.value));
        sessionStorage.setItem('petlife_payment_method', paymentMethod.value);
        Notification.show('訂單已建立', 'success');
        window.location.href = '/order-confirm/' + res.data.id;
      } catch (err) {
        Notification.show(err?.data?.message || '訂單建立失敗', 'error');
      } finally {
        submitting.value = false;
      }
    }

    onMounted(async function () {
      try {
        const res = await apiFetch('/api/cart');
        cartItems.value = res.data.items;
        if (cartItems.value.length === 0) {
          window.location.href = '/cart';
          return;
        }
        var saved = sessionStorage.getItem('petlife_discount');
        if (saved) discount.value = parseInt(saved) || 0;
      } catch (e) {
        window.location.href = '/cart';
        return;
      }
      loading.value = false;
    });

    return {
      loading, submitting, cartItems, form, errors,
      paymentMethod, paymentOptions, cardNumber, cardName, cardExpiry, cardCvv,
      discount, cartTotal, shipping, grandTotal,
      submitOrder,
    };
  }
}).mount('#app');
