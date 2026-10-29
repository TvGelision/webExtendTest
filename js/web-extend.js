/*
 * web-extend.js - adapter between this shop and SAP Engagement Cloud
 * Enterprise Edition Web Extend.
 *
 * The shop code only ever calls WebExtend.category(), WebExtend.view(), ...
 * It never touches SAP directly. That keeps all SAP-specific behaviour in this
 * one file, so swapping the "write to debug console" stub for the real SAP
 * snippet later is a change in one place.
 *
 * Command names and payload shapes follow the Web Extend command queue
 * (ScarabQueue.push([command, payload])).
 * Verify against your tenant's documentation before going live.
 */
(function () {
  'use strict';

  /* =====================================================================
   * SAP TRACKING CONFIGURATION  (the only place to edit SAP settings)
   * =====================================================================
   * Merchant ID and business area ID are tenant identifiers (visible in page source anyway).
   * No API keys or secrets belong in this repository.
   */
  var SAP_CONFIG = {
    // Merchant ID of your Web Extend / Predict tenant. Used by the real loader script.
    merchantId: '178E013E4645AED4',

    // Business area ID sent via the businessAreaId command ('' = do not send).
    businessAreaId: 'NL01',

    // When true, pages call testMode() before go(), so SAP treats the traffic as test data.
    testMode: true,

    // Stage 1 (current): commands are only written to the debug console.
    // Stage 2: set to true to also push every command onto window.ScarabQueue
    // (the queue the real SAP script drains). The SAP script itself is NOT
    // loaded by this project - add it yourself, in the HTML, when ready.
    forwardToScarabQueue: false,

    // Google Tag Manager route (option B). When enabled, this file loads the GTM container
    // and pushes every command onto window.dataLayer. A GTM tag then loads Web Extend and
    // passes the commands on (see README, "Connecting via GTM").
    // GTM is a Google container ID, not a secret; it is visible in page source anyway.
    gtm: {
      enabled: true,
      containerId: 'GTM-PDRBRRPX'
    }
  };
  /* ===================== END OF SAP TRACKING CONFIGURATION ============= */

  /* ---------- GTM loader + dataLayer (only when SAP_CONFIG.gtm.enabled) ---------- */
  window.dataLayer = window.dataLayer || [];

  if (SAP_CONFIG.gtm.enabled) {
    // Tell GTM which tenant/mode we are in BEFORE it loads, so tags can use these as variables.
    window.dataLayer.push({
      event: 'webextend_init',
      we_merchantId: SAP_CONFIG.merchantId,
      we_businessAreaId: SAP_CONFIG.businessAreaId,
      we_testMode: SAP_CONFIG.testMode
    });
    // Standard GTM loader, injected from JS so the container ID lives only in the config above.
    window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
    var gtmScript = document.createElement('script');
    gtmScript.async = true;
    gtmScript.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(SAP_CONFIG.gtm.containerId);
    document.head.appendChild(gtmScript);
    if (window.WebExtendDebug) window.WebExtendDebug.log('GTM container loading: ' + SAP_CONFIG.gtm.containerId + ' (commands also go to dataLayer)', undefined, 'note');
  }

  /**
   * Single exit point for every command. It logs to the debug console and, depending on the
   * configuration, also pushes to the dataLayer (GTM) and/or the ScarabQueue (direct).
   * @param {string} command  Web Extend command name, e.g. 'view'
   * @param {*}      payload  Command argument(s); undefined for commands without one
   */
  function dispatch(command, payload) {
    if (window.WebExtendDebug) window.WebExtendDebug.log(command, payload);
    else if (window.console) console.log('[WebExtend]', command, payload);

    if (SAP_CONFIG.gtm.enabled) {
      // One event per command. we_payload_json is a string on purpose: GTM merges nested
      // objects between pushes, so a JSON string avoids stale fields from earlier commands.
      window.dataLayer.push({
        event: 'webextend_command',
        we_command: command,
        we_payload_json: payload === undefined ? '' : JSON.stringify(payload)
      });
    }

    if (SAP_CONFIG.forwardToScarabQueue) {
      window.ScarabQueue = window.ScarabQueue || [];
      window.ScarabQueue.push(payload === undefined ? [command] : [command, payload]);
    }
  }

  window.WebExtend = {
    config: SAP_CONFIG,

    /** Category page. path is a ' > ' separated string, e.g. 'Apparel > Jackets'. */
    category: function (path) { dispatch('category', path); },

    /** Product detail page. itemId must match the item ID in your product catalog feed. */
    view: function (itemId) { dispatch('view', itemId); },

    /**
     * Current cart contents. Send it on every page; an empty array tells SAP the cart is empty.
     * @param {Array<{item:string, price:number, quantity:number}>} items
     */
    cart: function (items) { dispatch('cart', items); },

    /**
     * Completed order.
     * @param {{orderId:string, items:Array<{item:string, price:number, quantity:number}>}} order
     */
    purchase: function (order) { dispatch('purchase', order); },

    /** Identify a logged-in customer. Use a pseudonymous ID, never an email or name. */
    setCustomerId: function (id) { dispatch('setCustomerId', id); },

    /** Business area (e.g. brand or country site) this traffic belongs to. */
    businessAreaId: function (id) { dispatch('businessAreaId', id); },

    /** On-site search. Send the term the shopper typed. */
    searchTerm: function (term) { dispatch('searchTerm', term); },

    /**
     * Recommendation slot request (modelled on the Predict `recommend` command; verify the exact
     * name and options for Web Extend in your tenant). For now the shop fills each slot with
     * local logic and only logs the request, so you can see where SAP content would be placed.
     * @param {{logic:string, containerId:string, limit:number}} slot
     */
    recommend: function (slot) { dispatch('recommend', slot); },

    /** Free-form tag, e.g. 'page:home'. */
    tag: function (name) { dispatch('tag', name); },

    /** Marks the session as test traffic. Must be queued before go(). */
    testMode: function () { dispatch('testMode'); },

    /** Flushes the queue to SAP. Call it exactly once, after all other commands on the page. */
    go: function () { dispatch('go'); }
  };
})();
