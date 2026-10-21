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
   * Everything below is a PLACEHOLDER. No real IDs or keys belong in this
   * repository. Fill in your own values locally when you move beyond the
   * debug-console-only stage.
   */
  var SAP_CONFIG = {
    // Merchant ID of your Web Extend / Predict tenant. Used by the real loader script.
    merchantId: 'REPLACE_WITH_MERCHANT_ID',

    // Business area ID sent via the businessAreaId command ('' = do not send).
    businessAreaId: 'REPLACE_WITH_BUSINESS_AREA_ID',

    // When true, pages call testMode() before go(), so SAP treats the traffic as test data.
    testMode: true,

    // Stage 1 (current): commands are only written to the debug console.
    // Stage 2: set to true to also push every command onto window.ScarabQueue
    // (the queue the real SAP script drains). The SAP script itself is NOT
    // loaded by this project - add it yourself, in the HTML, when ready.
    forwardToScarabQueue: false
  };
  /* ===================== END OF SAP TRACKING CONFIGURATION ============= */

  /**
   * Single exit point for every command. Today it logs; later it can also forward.
   * @param {string} command  Web Extend command name, e.g. 'view'
   * @param {*}      payload  Command argument(s); undefined for commands without one
   */
  function dispatch(command, payload) {
    if (window.WebExtendDebug) window.WebExtendDebug.log(command, payload);
    else if (window.console) console.log('[WebExtend]', command, payload);

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
