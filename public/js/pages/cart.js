const { createApp, ref, computed, onMounted } = Vue;

createApp({
  setup() {
    const items = ref([]);
    const loading = ref(true);
    const confirmVisible = ref(false);
    const deleteItemId = ref('');
    const couponCode = ref('');
    const discount = ref(0);
    const couponApplied = ref(false);
    const couponError = ref('');

    const total = computed(function () {
      return items.value.reduce(function (sum, item) {
        return sum + item.product.price * item.quantity;
      }, 0);
    });

    const shipping = computed(function () {
      return total.value >= 500 ? 0 : 150;
    });

    const grandTotal = computed(function () {
      return Math.max(0, total.value - discount.value) + shipping.value;
    });

    function getCategoryLabel(product) {
      var url = (product.image_url || '').toLowerCase();
      var name = (product.name || '').toLowerCase();
      if (url.includes('cat-food')) return '貓咪零食';
      if (url.includes('cat')) return '貓咪商品';
      if (url.includes('dog-food')) return '狗狗糧食';
      if (url.includes('dog')) return '狗狗商品';
      if (url.includes('pet-toy') || name.includes('玩具') || name.includes('逗貓')) return '寵物玩具';
      if (url.includes('pet-food') || name.includes('零食')) return '寵物零食';
      return '寵物商品';
    }

    function applyCoupon() {
      var code = couponCode.value.trim().toUpperCase();
      if (!code) {
        couponError.value = '請輸入折扣碼';
        return;
      }
      if (code === 'PETLIFE') {
        discount.value = Math.round(total.value * 0.05);
        couponApplied.value = true;
        couponError.value = '';
      } else {
        discount.value = 0;
        couponApplied.value = false;
        couponError.value = '折扣碼無效或已過期';
      }
    }

    async function loadCart() {
      loading.value = true;
      try {
        const res = await apiFetch('/api/cart');
        items.value = res.data.items;
      } catch (e) {
        Notification.show('載入購物車失敗', 'error');
      } finally {
        loading.value = false;
      }
    }

    async function updateQuantity(itemId, qty) {
      if (qty < 1) return;
      try {
        await apiFetch('/api/cart/' + itemId, {
          method: 'PATCH',
          body: JSON.stringify({ quantity: qty })
        });
        var item = items.value.find(function (i) { return i.id === itemId; });
        if (item) item.quantity = qty;
      } catch (e) {
        Notification.show('更新數量失敗', 'error');
      }
    }

    function confirmDelete(itemId) {
      deleteItemId.value = itemId;
      confirmVisible.value = true;
    }

    async function handleDelete() {
      confirmVisible.value = false;
      try {
        await apiFetch('/api/cart/' + deleteItemId.value, { method: 'DELETE' });
        items.value = items.value.filter(function (i) { return i.id !== deleteItemId.value; });
        Notification.show('已從購物車移除', 'success');
      } catch (e) {
        Notification.show('移除失敗', 'error');
      }
    }

    function goCheckout() {
      if (!Auth.isLoggedIn()) {
        window.location.href = '/login?redirect=/checkout';
        return;
      }
      window.location.href = '/checkout';
    }

    onMounted(function () {
      loadCart();
    });

    return {
      items, loading, total, shipping, grandTotal,
      confirmVisible, couponCode, discount, couponApplied, couponError,
      getCategoryLabel, applyCoupon,
      updateQuantity, confirmDelete, handleDelete, goCheckout
    };
  }
}).mount('#app');
