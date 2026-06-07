document.addEventListener('DOMContentLoaded', function () {
  const authNav         = document.getElementById('auth-nav');
  const cartBadge       = document.getElementById('cart-badge');
  const ordersLink      = document.getElementById('orders-link');
  const mobileAdminBadge = document.getElementById('mobile-admin-badge');
  const mobileUserBtn   = document.getElementById('mobile-user-btn');
  const mobileAuthSection = document.getElementById('mobile-auth-section');

  if (Auth.isLoggedIn()) {
    const user = Auth.getUser();

    // ── Desktop auth nav ──
    if (authNav) {
      var html = '';
      if (Auth.isAdmin()) {
        html += '<a href="/admin/products" class="text-sm text-rose-primary hover:text-rose-dark transition-colors">後台管理</a>';
      }
      html += '<span class="text-sm text-text-secondary">' + (user?.name || '') + '</span>';
      html += '<button onclick="Auth.logout()" class="text-sm text-text-muted hover:text-rose-primary transition-colors">登出</button>';
      authNav.innerHTML = html;
    }

    // ── Desktop orders link (class "hidden lg:flex" handles responsive, clear inline style) ──
    if (ordersLink) ordersLink.style.display = '';

    // ── Mobile: hide user icon ──
    if (mobileUserBtn) mobileUserBtn.style.display = 'none';

    // ── Mobile: show Admin badge for admin users ──
    if (mobileAdminBadge && Auth.isAdmin()) {
      mobileAdminBadge.classList.remove('hidden');
    }

    // ── Mobile dropdown: 我的訂單 / 後台管理 / 登出 ──
    if (mobileAuthSection) {
      var mobileHtml = '<div class="border-t border-rose-bg pt-4 flex flex-col gap-5">';
      mobileHtml += '<a href="/orders" class="nav-link text-nav-link text-[15px] font-normal">我的訂單</a>';
      if (Auth.isAdmin()) {
        mobileHtml += '<a href="/admin/products" class="nav-link text-rose-primary text-[15px] font-medium">後台管理</a>';
      }
      mobileHtml += '<button onclick="Auth.logout()" class="text-left text-nav-link text-[15px] hover:text-rose-primary transition-colors">登出</button>';
      mobileHtml += '</div>';
      mobileAuthSection.innerHTML = mobileHtml;
    }

  } else {
    // ── Not logged in ──

    // Desktop: login button pill
    if (authNav) {
      authNav.innerHTML = '<a href="/login" class="text-sm bg-rose-primary text-white px-4 py-1.5 rounded-full hover:bg-rose-dark transition-colors">登入</a>';
    }

    // Mobile: keep user icon visible (default); add login link to dropdown
    if (mobileAuthSection) {
      mobileAuthSection.innerHTML = '<div class="border-t border-rose-bg pt-4"><a href="/login" class="nav-link text-nav-link text-[15px] font-normal">登入</a></div>';
    }
  }

  // ── Cart badge ──
  if (cartBadge) {
    apiFetch('/api/cart').then(function (res) {
      if (res && res.data && res.data.items && res.data.items.length > 0) {
        cartBadge.textContent = res.data.items.length;
        cartBadge.style.display = 'flex';
      }
    }).catch(function () {});
  }
});
