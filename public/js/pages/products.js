const { createApp, ref, computed, onMounted } = Vue;

const categories = [
  { id: 'cat', name: '貓咪商品' },
  { id: 'dog', name: '狗狗商品' },
  { id: 'bird', name: '鳥禽商品' },
  { id: 'small', name: '小動物' },
  { id: 'snack', name: '寵物零食・點心' },
];
const priceRanges = [
  { id: '0-300',    label: 'NT$0 ～ 300',   min: 0,    max: 300 },
  { id: '301-600',  label: 'NT$301 ～ 600',  min: 301,  max: 600 },
  { id: '601-1000', label: 'NT$601 ～ 1000', min: 601,  max: 1000 },
  { id: '1001+',    label: 'NT$1001 以上',   min: 1001, max: Infinity },
];
const brands = ['暮寵日和', '其他品牌 1', '其他品牌 2'];
const sortOptions = [
  { value: 'newest',     label: '最新上架' },
  { value: 'popular',    label: '熱門商品' },
  { value: 'price-high', label: '售價高至低' },
  { value: 'price-low',  label: '售價低至高' },
];
const pageSize = 6;

createApp({
  setup() {
    const allProducts = ref([]);
    const loading = ref(true);
    const showFilter = ref(false);
    const sortBy = ref('newest');
    const selectedCategory = ref('');
    const selectedPriceRanges = ref([]);
    const selectedBrands = ref([]);
    const currentPage = ref(1);
    const jumpPage = ref(1);

    const activeFilterCount = computed(function () {
      return selectedPriceRanges.value.length + selectedBrands.value.length + (selectedCategory.value ? 1 : 0);
    });

    const displayProducts = computed(function () {
      var list = allProducts.value.slice();

      if (selectedPriceRanges.value.length > 0) {
        list = list.filter(function (p) {
          return selectedPriceRanges.value.some(function (rid) {
            var range = priceRanges.find(function (r) { return r.id === rid; });
            return range && p.price >= range.min && p.price <= range.max;
          });
        });
      }

      if (sortBy.value === 'price-high') {
        list = list.slice().sort(function (a, b) { return b.price - a.price; });
      } else if (sortBy.value === 'price-low') {
        list = list.slice().sort(function (a, b) { return a.price - b.price; });
      } else if (sortBy.value === 'popular') {
        list = list.slice().sort(function (a, b) { return (b.review_count || 0) - (a.review_count || 0); });
      }

      return list;
    });

    const totalPages = computed(function () {
      return Math.max(1, Math.ceil(displayProducts.value.length / pageSize));
    });

    const paginatedProducts = computed(function () {
      var start = (currentPage.value - 1) * pageSize;
      return displayProducts.value.slice(start, start + pageSize);
    });

    function setSort(val) {
      sortBy.value = val;
      currentPage.value = 1;
    }

    function setCategory(id) {
      selectedCategory.value = selectedCategory.value === id ? '' : id;
      currentPage.value = 1;
    }

    function togglePriceRange(id) {
      var idx = selectedPriceRanges.value.indexOf(id);
      if (idx === -1) {
        selectedPriceRanges.value = selectedPriceRanges.value.concat([id]);
      } else {
        selectedPriceRanges.value = selectedPriceRanges.value.filter(function (r) { return r !== id; });
      }
      currentPage.value = 1;
    }

    function toggleBrand(brand) {
      var idx = selectedBrands.value.indexOf(brand);
      if (idx === -1) {
        selectedBrands.value = selectedBrands.value.concat([brand]);
      } else {
        selectedBrands.value = selectedBrands.value.filter(function (b) { return b !== brand; });
      }
      currentPage.value = 1;
    }

    function clearFilters() {
      selectedCategory.value = '';
      selectedPriceRanges.value = [];
      selectedBrands.value = [];
      currentPage.value = 1;
    }

    function goPage(p) {
      if (p < 1 || p > totalPages.value) return;
      currentPage.value = p;
      jumpPage.value = p;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function goToProduct(id) {
      window.location.href = '/products/' + id;
    }

    async function addToCart(product) {
      if (product._adding) return;
      product._adding = true;
      try {
        await apiFetch('/api/cart', {
          method: 'POST',
          body: JSON.stringify({ productId: product.id, quantity: 1 })
        });
        Notification.show('已加入購物車', 'success');
        var badge = document.getElementById('cart-badge');
        if (badge) {
          var count = parseInt(badge.textContent || '0') + 1;
          badge.textContent = count;
          badge.style.display = 'flex';
        }
      } catch (e) {
        Notification.show('加入購物車失敗', 'error');
      } finally {
        product._adding = false;
      }
    }

    async function loadProducts() {
      loading.value = true;
      try {
        const res = await apiFetch('/api/products?limit=100');
        allProducts.value = res.data.products.map(function (p) {
          p._adding = false;
          return p;
        });
      } catch (e) {
        allProducts.value = [];
      } finally {
        loading.value = false;
      }
    }

    onMounted(function () {
      loadProducts();
    });

    return {
      allProducts, loading, showFilter, sortBy, selectedCategory,
      selectedPriceRanges, selectedBrands, currentPage, jumpPage,
      pageSize, categories, priceRanges, brands, sortOptions,
      activeFilterCount, displayProducts, totalPages, paginatedProducts,
      setSort, setCategory, togglePriceRange, toggleBrand, clearFilters,
      goPage, goToProduct, addToCart, loadProducts
    };
  }
}).mount('#app');
