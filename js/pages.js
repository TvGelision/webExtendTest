/*
 * pages.js - page behaviour. Each HTML page sets <body data-page="..."> and this
 * file runs the matching function. Every page ends by calling track(), which is
 * the single place that decides which Web Extend commands go out.
 */
(function () {
  'use strict';

  var $ = function (sel) { return document.querySelector(sel); };

  /** Recommendation slots rendered on the current page; track() sends one `recommend` per slot. */
  var slotsUsed = [];

  /** Cart in the shape the Web Extend `cart` / `purchase` commands expect (sale price included). */
  function cartPayload(lines) {
    return lines.map(function (l) {
      return { item: l.product.id, price: Shop.price(l.product), quantity: l.qty };
    });
  }

  /**
   * Standard Web Extend call sequence for one page view:
   *   testMode -> businessAreaId -> setCustomerId -> page-specific commands -> recommend -> cart -> tag -> go
   * `extra` is a function that issues the page-specific commands (category, view, purchase ...).
   * go() always comes last because it flushes everything queued before it.
   */
  function track(tag, lines, extra) {
    var we = window.WebExtend;
    var session = Shop.getSession();

    if (we.config.testMode) we.testMode();
    if (we.config.businessAreaId) we.businessAreaId(we.config.businessAreaId);
    if (session) we.setCustomerId(session.customerId);   // only when "logged in"
    if (extra) extra();
    slotsUsed.forEach(function (s) { we.recommend(s); });
    we.cart(cartPayload(lines));      // sent on every page; [] clears the cart on the SAP side
    we.tag(tag);
    we.go();
  }

  /** Re-sends the cart after the shopper changes it without a page load (add to cart, qty change). */
  function resendCart(products) {
    window.WebExtend.cart(cartPayload(Shop.cartLines(products)));
    window.WebExtend.go();
  }

  /* ------------------------------ rendering helpers ------------------------------ */

  /** Price with strike-through original when the product is on sale. */
  function priceHtml(p) {
    if (p.salePrice == null) return '<span class="price">' + Shop.money(p.price) + '</span>';
    return '<span class="price sale">' + Shop.money(p.salePrice) + '</span> <s class="was">' + Shop.money(p.price) + '</s>';
  }

  function badgesHtml(p) {
    var b = '';
    if (p.salePrice != null) b += '<span class="tag sale">−' + Shop.discountPct(p) + '%</span>';
    if (p.isNew) b += '<span class="tag new">New</span>';
    if (p.stock === 0) b += '<span class="tag out">Sold out</span>';
    return b ? '<span class="tags">' + b + '</span>' : '';
  }

  function productCard(p) {
    var href = 'product.html?id=' + encodeURIComponent(p.id);
    return '<article class="card">' +
      '<a href="' + href + '" class="thumb" style="background:' + p.color + '" aria-hidden="true" tabindex="-1">' + p.emoji + badgesHtml(p) + '</a>' +
      '<div class="body">' +
        '<span class="cat">' + Shop.esc(p.category) + '</span>' +
        '<a class="title" href="' + href + '">' + Shop.esc(p.name) + '</a>' +
        '<span>' + priceHtml(p) + '</span>' +
      '</div></article>';
  }

  /**
   * Horizontal carousel of product cards = one recommendation slot.
   * `logic` names the Web Extend / Predict recommendation logic this slot stands in for
   * (RELATED, ALSO_BOUGHT, POPULAR ...). The products come from simple local rules for now;
   * swap them for SAP's response later without changing the page layout.
   */
  function carousel(title, logic, containerId, items, limit) {
    items = items.slice(0, limit || 8);
    if (!items.length) return '';
    slotsUsed.push({ logic: logic, containerId: containerId, limit: limit || 8 });
    return '<section class="carousel" id="' + containerId + '" data-logic="' + logic + '">' +
      '<div class="carousel-head">' +
        '<h2>' + Shop.esc(title) + '</h2>' +
        '<span class="slot-tag" title="Recommendation slot that Web Extend would fill">slot · ' + logic + '</span>' +
        '<span class="carousel-nav">' +
          '<button type="button" data-dir="-1" aria-label="Previous">‹</button>' +
          '<button type="button" data-dir="1" aria-label="Next">›</button>' +
        '</span>' +
      '</div>' +
      '<div class="track">' + items.map(productCard).join('') + '</div>' +
    '</section>';
  }

  /* ------------------------------ local "recommendation" rules ------------------------------ */
  function byPopularity(a, b) { return b.popularity - a.popularity; }
  function topCat(p) { return p.category.split(' > ')[0]; }

  /** Alternatives: same sub-category first, then rest of the same top category. */
  function alternatives(p, all) {
    var others = all.filter(function (x) { return x.id !== p.id && topCat(x) === topCat(p); });
    var sub = others.filter(function (x) { return x.category === p.category; }).sort(byPopularity);
    var rest = others.filter(function (x) { return x.category !== p.category; }).sort(byPopularity);
    return sub.concat(rest);
  }
  /** Complementary: popular products from the other top categories. */
  function complementary(p, all) {
    return all.filter(function (x) { return topCat(x) !== topCat(p); }).sort(byPopularity);
  }
  function recentlyViewed(all, excludeId) {
    return Shop.getRecent().filter(function (id) { return id !== excludeId; }).map(function (id) {
      return all.filter(function (x) { return x.id === id; })[0];
    }).filter(Boolean);
  }
  /** "Picked for you": popularity order rotated by customer, so each test customer sees a different list. */
  function personal(all, session) {
    var idx = Shop.CUSTOMERS.map(function (c) { return c.customerId; }).indexOf(session.customerId);
    var sorted = all.slice().sort(byPopularity);
    var shift = (idx + 1) * 3 % sorted.length;
    return sorted.slice(shift).concat(sorted.slice(0, shift));
  }

  /** One delegated click handler makes every carousel's prev/next buttons work. */
  document.addEventListener('click', function (ev) {
    var dir = ev.target.getAttribute && ev.target.getAttribute('data-dir');
    if (!dir || !ev.target.closest('.carousel')) return;
    var track = ev.target.closest('.carousel').querySelector('.track');
    track.scrollBy({ left: Number(dir) * track.clientWidth * 0.8, behavior: 'smooth' });
  });

  /* ------------------------------------------------------------------ */
  var pages = {

    home: function (products, lines) {
      var session = Shop.getSession();
      var html = '';
      if (session) html += carousel('Picked for ' + session.name, 'PERSONAL', 'home-personal', personal(products, session));
      html += carousel('Trending now', 'POPULAR', 'home-popular', products.slice().sort(byPopularity));
      html += carousel('On sale', 'DEALS', 'home-deals', products.filter(function (p) { return p.salePrice != null; }).sort(byPopularity));
      html += carousel('New arrivals', 'NEW', 'home-new', products.filter(function (p) { return p.isNew; }));
      html += carousel('Recently viewed', 'VIEWED', 'home-viewed', recentlyViewed(products, null));
      $('#slots').innerHTML = html;
      track('page:home', lines);
    },

    category: function (products, lines) {
      var params = new URLSearchParams(location.search);
      var cat = params.get('cat') || '';
      var q = (params.get('q') || '').trim();
      var tops = ['Apparel', 'Footwear', 'Accessories', 'Sale'];

      // Filter: search term, "Sale" pseudo-category, or category path prefix.
      var shown = products.filter(function (p) {
        if (q) return (p.name + ' ' + p.category + ' ' + p.description).toLowerCase().indexOf(q.toLowerCase()) !== -1;
        if (cat === 'Sale') return p.salePrice != null;
        return !cat || p.category.indexOf(cat) === 0;
      });

      $('#cat-title').textContent = q ? 'Search: “' + q + '”' : (cat || 'All products');
      $('#cat-pills').innerHTML =
        '<a class="pill' + (!cat && !q ? ' active' : '') + '" href="category.html">All</a>' +
        tops.map(function (t) {
          return '<a class="pill' + (cat === t ? ' active' : '') + '" href="category.html?cat=' + encodeURIComponent(t) + '">' + t + '</a>';
        }).join('');

      function renderList() {
        var sort = $('#sort').value;
        var list = shown.slice();
        if (sort === 'price-asc') list.sort(function (a, b) { return Shop.price(a) - Shop.price(b); });
        else if (sort === 'price-desc') list.sort(function (a, b) { return Shop.price(b) - Shop.price(a); });
        else list.sort(byPopularity);
        $('#count').textContent = shown.length + (shown.length === 1 ? ' product' : ' products');
        $('#list').innerHTML = list.length ? list.map(productCard).join('') : '<p>No products found.</p>';
      }
      $('#sort').addEventListener('change', renderList);
      renderList();

      // Search pages send searchTerm; everything else sends category.
      track('page:category', lines, function () {
        if (q) window.WebExtend.searchTerm(q);
        else window.WebExtend.category(cat || 'All products');
      });
    },

    product: function (products, lines) {
      var id = new URLSearchParams(location.search).get('id');
      var p = products.filter(function (x) { return x.id === id; })[0];
      if (!p) { $('#detail').innerHTML = '<p>Product not found. <a href="category.html">Back to products</a></p>'; track('page:product-not-found', lines); return; }

      document.title = p.name + ' - Web Extend Test Shop';
      var stockNote = p.stock === 0 ? '<p class="stock out">Sold out</p>'
        : p.stock <= 5 ? '<p class="stock low">Only ' + p.stock + ' left</p>'
        : '<p class="stock ok">In stock</p>';
      $('#detail').innerHTML =
        '<div class="thumb" style="background:' + p.color + '" aria-hidden="true">' + p.emoji + badgesHtml(p) + '</div>' +
        '<div>' +
          '<p class="cat muted">' + Shop.esc(p.category.replace(/ > /g, ' / ')) + ' · ' + Shop.esc(p.id) + '</p>' +
          '<h1>' + Shop.esc(p.name) + '</h1>' +
          '<p class="big-price">' + priceHtml(p) + '</p>' +
          '<p>' + Shop.esc(p.description) + '</p>' + stockNote +
          '<p><button class="btn" id="add"' + (p.stock === 0 ? ' disabled' : '') + '>Add to cart</button></p>' +
          '<p class="msg" id="msg" role="status"></p>' +
        '</div>';

      $('#add').addEventListener('click', function () {
        Shop.addToCart(p.id, 1);
        Shop.renderHeader();
        $('#msg').textContent = 'Added to cart.';
        resendCart(products);
      });

      // Three recommendation slots below the product.
      $('#slots').innerHTML =
        carousel('Alternatives', 'RELATED', 'pdp-alternatives', alternatives(p, products)) +
        carousel('Customers also bought', 'ALSO_BOUGHT', 'pdp-also-bought', complementary(p, products)) +
        carousel('Recently viewed', 'VIEWED', 'pdp-viewed', recentlyViewed(products, p.id));

      // The view command takes the product's item ID. Record it for "recently viewed" AFTER the slots rendered.
      track('page:product', lines, function () { window.WebExtend.view(p.id); });
      Shop.addRecent(p.id);
    },

    cart: function (products, lines) {
      function render() {
        var ls = Shop.cartLines(products);
        if (!ls.length) {
          $('#cart').innerHTML = '<p>Your cart is empty. <a href="category.html">Browse products</a></p>';
          return;
        }
        var total = ls.reduce(function (s, l) { return s + l.total; }, 0);
        $('#cart').innerHTML =
          '<table><thead><tr><th>Product</th><th class="num">Price</th><th class="num">Qty</th><th class="num">Total</th><th></th></tr></thead><tbody>' +
          ls.map(function (l) {
            return '<tr><td><a href="product.html?id=' + encodeURIComponent(l.product.id) + '">' + Shop.esc(l.product.name) + '</a></td>' +
              '<td class="num">' + priceHtml(l.product) + '</td>' +
              '<td class="num"><button class="btn secondary small" data-id="' + l.product.id + '" data-d="-1" aria-label="Decrease quantity">−</button> ' +
                l.qty + ' <button class="btn secondary small" data-id="' + l.product.id + '" data-d="1" aria-label="Increase quantity">+</button></td>' +
              '<td class="num">' + Shop.money(l.total) + '</td>' +
              '<td><button class="btn secondary small" data-id="' + l.product.id + '" data-d="remove">Remove</button></td></tr>';
          }).join('') +
          '</tbody></table>' +
          '<p class="totals">Total: <strong>' + Shop.money(total) + '</strong></p>' +
          '<p><a class="btn" href="checkout.html">Go to checkout</a></p>';
      }

      // One delegated listener handles all +/-/remove buttons, including re-rendered ones.
      $('#cart').addEventListener('click', function (ev) {
        var id = ev.target.getAttribute('data-id');
        var d = ev.target.getAttribute('data-d');
        if (!id) return;
        var line = Shop.getCart().filter(function (l) { return l.id === id; })[0];
        if (!line) return;
        Shop.setQty(id, d === 'remove' ? 0 : line.qty + Number(d));
        render();
        Shop.renderHeader();
        resendCart(products);
      });

      render();
      // Cart-page slot: add-ons based on what is in the cart.
      var first = lines[0] && lines[0].product;
      if (first) {
        var inCart = lines.map(function (l) { return l.product.id; });
        $('#slots').innerHTML = carousel('You might also like', 'CART', 'cart-recs',
          complementary(first, products).filter(function (x) { return inCart.indexOf(x.id) === -1; }));
      }
      track('page:cart', lines);
    },

    checkout: function (products, lines) {
      if (!lines.length) {
        $('#checkout').innerHTML = '<p>Your cart is empty. <a href="category.html">Browse products</a></p>';
        track('page:checkout', lines);
        return;
      }
      var total = lines.reduce(function (s, l) { return s + l.total; }, 0);
      $('#summary').innerHTML = lines.map(function (l) {
        return '<li>' + l.qty + ' × ' + Shop.esc(l.product.name) + ' – ' + Shop.money(l.total) + '</li>';
      }).join('') + '<li><strong>Total: ' + Shop.money(total) + '</strong></li>';

      $('#checkout-form').addEventListener('submit', function (ev) {
        ev.preventDefault();
        var f = new FormData(ev.target);
        // Order ID is generated locally; the "TEST-" prefix makes synthetic orders obvious in SAP.
        var order = {
          orderId: 'TEST-' + Date.now(),
          customer: { name: f.get('name'), email: f.get('email'), address: f.get('address'), city: f.get('city') },
          items: cartPayload(lines),
          total: total,
          tracked: false           // flipped to true once the purchase command was sent
        };
        Shop.saveLastOrder(order);
        Shop.clearCart();
        location.href = 'confirmation.html';
      });

      track('page:checkout', lines);
    },

    confirmation: function (products, lines) {
      var order = Shop.getLastOrder();
      if (!order) {
        $('#order').innerHTML = '<p>No recent order found. <a href="index.html">Back to the shop</a></p>';
        track('page:confirmation', lines);
        return;
      }
      $('#order').innerHTML =
        '<p>Order <strong>' + Shop.esc(order.orderId) + '</strong> (synthetic – nothing was paid or shipped).</p>' +
        '<ul>' + order.items.map(function (i) {
          var p = products.filter(function (x) { return x.id === i.item; })[0];
          return '<li>' + i.quantity + ' × ' + Shop.esc(p ? p.name : i.item) + '</li>';
        }).join('') + '</ul>' +
        '<p>Total: <strong>' + Shop.money(order.total) + '</strong></p>';

      track('page:confirmation', lines, function () {
        // Send `purchase` only once per order, otherwise a page reload would double-count it.
        if (order.tracked) {
          window.WebExtendDebug.log('purchase skipped (already sent for ' + order.orderId + ')', undefined, 'note');
          return;
        }
        window.WebExtend.purchase({ orderId: order.orderId, items: order.items });
        order.tracked = true;
        Shop.saveLastOrder(order);
      });
    },

    login: function (products, lines) {
      var s = Shop.getSession();
      $('#current').textContent = s ? 'Logged in as ' + s.name + ' (' + s.customerId + ').' : 'Not logged in.';
      $('#customer').innerHTML = Shop.CUSTOMERS.map(function (c) {
        return '<option value="' + Shop.esc(c.customerId) + '">' + Shop.esc(c.name) + ' – ' + Shop.esc(c.customerId) + '</option>';
      }).join('');

      $('#login-form').addEventListener('submit', function (ev) {
        ev.preventDefault();
        var chosen = Shop.CUSTOMERS.filter(function (c) { return c.customerId === $('#customer').value; })[0];
        Shop.login(chosen);
        location.href = 'index.html';       // setCustomerId is sent by track() on the next page
      });
      $('#logout').addEventListener('click', function () {
        Shop.logout();
        location.reload();
      });

      track('page:login', lines);
    }
  };

  /* ------------------------------------------------------------------ */
  document.addEventListener('DOMContentLoaded', function () {
    Shop.renderHeader();
    var page = document.body.getAttribute('data-page');
    Shop.loadProducts().then(function (products) {
      var lines = Shop.cartLines(products);
      if (pages[page]) pages[page](products, lines);
    }).catch(function (err) {
      window.WebExtendDebug.log('ERROR ' + err.message + ' - serve the folder over http://, not file://', undefined, 'note');
      var main = document.querySelector('main');
      if (main) main.insertAdjacentHTML('afterbegin', '<p class="notice warn">Could not load products. Start a local web server (see README).</p>');
    });
  });
})();
