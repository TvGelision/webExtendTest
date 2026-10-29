/*
 * store.js - shop data and state: products, cart, simulated customer session.
 *
 * All state lives in localStorage so it survives page loads. There is no backend.
 * Everything here is synthetic test data.
 */
(function () {
  'use strict';

  var CART_KEY = 'we_cart';         // [{ id, qty }]
  var SESSION_KEY = 'we_session';   // { key, name, cdId } or absent when logged out
  var ORDER_KEY = 'we_last_order';  // most recent synthetic order, read by the confirmation page
  var RECENT_KEY = 'we_recent';     // product IDs viewed, newest first

  // Synthetic customers for the simulated login. No passwords exist: "login" just picks one.
  // Three separate fields per customer:
  //   key  - internal handle used by the login form (never sent to SAP)
  //   name - display name only (never sent to SAP)
  //   cdId - the CD ID of the matching test contact in the SAP tenant; this is the value
  //          setCustomerId sends.
  // Test Customer One has a real CD ID. Two and Three use PLACEHOLDER CD IDs: replace them
  // with the CD IDs of real test contacts, or Web Extend creates stray contacts.
  var CUSTOMERS = [
    { key: 'customer-1', name: 'Test Customer One',   cdId: '123456789' },
    { key: 'customer-2', name: 'Test Customer Two',   cdId: 'test-customer-1002' },
    { key: 'customer-3', name: 'Test Customer Three', cdId: 'test-customer-1003' }
  ];

  // localStorage can throw (blocked storage); fall back to "empty" rather than crash.
  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }

  var productsPromise = null;

  var Shop = {
    CUSTOMERS: CUSTOMERS,

    /** Loads data/products.json once. Needs http:// (fetch is blocked on file://). */
    loadProducts: function () {
      if (!productsPromise) {
        productsPromise = fetch('data/products.json').then(function (r) {
          if (!r.ok) throw new Error('products.json: HTTP ' + r.status);
          return r.json();
        });
      }
      return productsPromise;
    },

    /** Escape text before putting it in innerHTML. */
    esc: function (s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    },

    money: function (n) {
      return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR' }).format(n);
    },

    /** Price the shopper actually pays: the sale price when there is one. This is also what Web Extend gets. */
    price: function (p) { return p.salePrice != null ? p.salePrice : p.price; },

    /** Discount percentage (rounded) for sale items, 0 otherwise. */
    discountPct: function (p) {
      return p.salePrice != null ? Math.round((1 - p.salePrice / p.price) * 100) : 0;
    },

    /* ---------------- recently viewed (feeds the "recently viewed" carousel) ---------------- */
    getRecent: function () { return read(RECENT_KEY, []); },
    addRecent: function (id) {
      var list = Shop.getRecent().filter(function (x) { return x !== id; });
      list.unshift(id);                       // newest first
      write(RECENT_KEY, list.slice(0, 10));
    },

    /* ---------------- cart ---------------- */
    getCart: function () { return read(CART_KEY, []); },

    addToCart: function (id, qty) {
      var cart = Shop.getCart();
      var line = cart.filter(function (l) { return l.id === id; })[0];
      if (line) line.qty += qty; else cart.push({ id: id, qty: qty });
      write(CART_KEY, cart);
    },

    setQty: function (id, qty) {
      var cart = Shop.getCart()
        .map(function (l) { return l.id === id ? { id: id, qty: qty } : l; })
        .filter(function (l) { return l.qty > 0; });   // qty 0 removes the line
      write(CART_KEY, cart);
    },

    clearCart: function () { write(CART_KEY, []); },

    cartCount: function () {
      return Shop.getCart().reduce(function (sum, l) { return sum + l.qty; }, 0);
    },

    /** Joins stored cart lines with product data. Unknown product IDs are dropped. */
    cartLines: function (products) {
      return Shop.getCart().map(function (l) {
        var p = products.filter(function (x) { return x.id === l.id; })[0];
        return p ? { product: p, qty: l.qty, total: Shop.price(p) * l.qty } : null;
      }).filter(Boolean);
    },

    /* ---------------- simulated customer session ---------------- */
    getSession: function () {
      var s = read(SESSION_KEY, null);
      if (s && !s.cdId && s.customerId) s.cdId = s.customerId;   // sessions saved before the rename
      return s;
    },
    login: function (customer) { write(SESSION_KEY, customer); },
    logout: function () { try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ } },

    /* ---------------- last order ---------------- */
    getLastOrder: function () { return read(ORDER_KEY, null); },
    saveLastOrder: function (order) { write(ORDER_KEY, order); },

    /* ---------------- shared header ---------------- */
    renderHeader: function () {
      var el = document.getElementById('site-header');
      if (!el) return;
      var s = Shop.getSession();
      el.className = 'site-header';
      el.innerHTML =
        '<a class="brand" href="index.html">Web Extend Test Shop</a>' +
        '<nav>' +
          '<a href="category.html?cat=Apparel">Apparel</a>' +
          '<a href="category.html?cat=Footwear">Footwear</a>' +
          '<a href="category.html?cat=Accessories">Accessories</a>' +
          '<a href="category.html?cat=Sale" class="sale-link">Sale</a>' +
        '</nav>' +
        // Plain GET form: category.html?q=... filters the products and sends the searchTerm command.
        '<form class="search" action="category.html" method="get" role="search">' +
          '<input type="search" name="q" placeholder="Search products" aria-label="Search products">' +
        '</form>' +
        '<span class="session">' +
          (s ? Shop.esc(s.name) + ' (' + Shop.esc(s.cdId) + ') · <a href="login.html">Switch / log out</a>'
             : '<a href="login.html">Log in</a>') +
        '</span>' +
        '<a href="cart.html">Cart <span class="badge">' + Shop.cartCount() + '</span></a>';
    }
  };

  window.Shop = Shop;
})();
