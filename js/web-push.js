/*
 * web-push.js - SAP Emarsys Web Push (web SDK v4) for the test shop.
 *
 * What it does:
 *  1. Loads the web SDK and initialises it with the domain code and public VAPID key
 *     (settings live in WebExtend.config.webPush, in js/web-extend.js).
 *  2. Links the browser to the logged-in test customer via the CD ID (SDK login()).
 *  3. Shows an opt-in bar; the permission prompt only appears after a click, because
 *     Safari and Firefox block prompts that are not triggered by a user action.
 *
 * Needs: the service worker at https://tvgelision.github.io/service-worker.js (domain root).
 * Every SDK step is written to the debug console as "webpush: ...".
 */
(function () {
  'use strict';

  var cfg = window.WebExtend && window.WebExtend.config.webPush;
  if (!cfg || !cfg.enabled) return;

  function note(msg, payload) {
    if (window.WebExtendDebug) window.WebExtendDebug.log('webpush: ' + msg, payload, 'note');
  }

  // The domain code only works on the registered domain; skip localhost and previews.
  if (cfg.allowedHosts.indexOf(location.hostname) === -1) {
    note('off on ' + location.hostname + ' (only runs on ' + cfg.allowedHosts.join(', ') + ')');
    return;
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    note('this browser has no Web Push support');
    return;
  }

  /* ---------- SDK setup (queue first, script async, same pattern as SAP's sample) ---------- */
  window.WebEmarsysSdk = window.WebEmarsysSdk || [];

  window.WebEmarsysSdk.push(['init', {
    applicationCode: cfg.domainCode,
    enableMacSafariVapid: true,        // use VAPID instead of APNS on Mac Safari
    defaultNotificationTitle: cfg.defaultTitle,
    defaultNotificationIcon: cfg.iconUrl,
    autoSubscribe: false,              // SAP: browsers block automatic prompts
    enableLogging: true,               // SDK prints its init steps and errors to the browser console
    serviceWorker: {
      url: cfg.serviceWorkerUrl,
      applicationServerPublicKey: cfg.publicKey
    }
  }]);

  // The SDK's async init() fails silently when a step is rejected (browser support check, domain
  // code check, service worker registration). Surface those rejections in the debug console.
  window.addEventListener('unhandledrejection', function (ev) {
    var r = ev.reason;
    note('unhandled rejection: ' + (r && r.message ? r.message : String(r)));
  });

  // Event callbacks, all just logged for debugging.
  ['onSubscribe', 'onUnsubscribe', 'onSWInitError', 'onPermissionPrompt', 'onPermissionDenied', 'onPermissionGranted']
    .forEach(function (name) {
      window.WebEmarsysSdk.push([name, function (p) {
        note(name, p);
        // login() only works once the SDK has a client record, and the SDK re-links the browser
        // ANONYMOUSLY during its own registration. So link after it is done: onSubscribe and onReady.
        // (onPermissionGranted fires in the middle of that registration, too early.)
        if (name === 'onSubscribe') syncContact();
        refreshBar();
      }]);
    });

  // onReady: the SDK is initialised; only now may login/subscribe be called.
  window.WebEmarsysSdk.push(function () {
    note('SDK ready');
    syncContact();      // onReady is emitted after the SDK's own registration is complete
    refreshBar();
  });

  var script = document.createElement('script');
  script.async = true;
  script.src = cfg.sdkUrl;
  script.onerror = function () { note('SDK script could not be loaded (blocked or offline)'); };
  document.head.appendChild(script);

  /* ---------- link / unlink the browser to the logged-in contact ---------- */
  function currentSession() { return window.Shop ? window.Shop.getSession() : null; }

  var linking = false;   // re-entrancy guard: login() must not trigger itself through the events

  function syncContact() {
    var s = currentSession();
    var sdk = window.WebEmarsysSdk;
    if (s && cfg.loginFieldId) {
      // The SDK has no client record until the browser has subscribed ("No client state set!").
      if (Notification.permission !== 'granted') {
        note('contact not linked yet: waiting for the browser to subscribe');
        return Promise.resolve();
      }
      if (linking) return Promise.resolve();
      linking = true;
      // fieldValue is the CD ID: non-PII, unique and immutable, as SAP requires (no email!).
      return sdk.login({ fieldId: cfg.loginFieldId, fieldValue: s.cdId })
        .then(function (ok) { note('login ' + s.cdId, ok); })
        .catch(function (e) { note('login failed', String(e)); })
        .then(function () { setTimeout(function () { linking = false; }, 2000); });
    }
    if (s) { note('logged in as ' + s.cdId + ' but loginFieldId is not set: browser stays anonymous'); return Promise.resolve(); }
    // Logged out in the shop: unlink a previously linked contact.
    return sdk.getLoggedInContact().then(function (c) {
      if (c && c.fieldValue) return sdk.logout().then(function (ok) { note('logout', ok); });
    }).catch(function () { /* no contact linked */ });
  }

  /* ---------- opt-in bar ---------- */
  var DISMISS_KEY = 'we_push_dismissed';
  function dismissed() { try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch (e) { return false; } }

  var bar;
  function buildBar() {
    bar = document.createElement('div');
    bar.className = 'push-bar';
    bar.hidden = true;
    bar.innerHTML =
      '<span id="push-text"></span>' +
      '<button type="button" class="btn small" id="push-enable">Enable notifications</button>' +
      '<button type="button" class="btn secondary small" id="push-dismiss">Not now</button>';
    var header = document.getElementById('site-header');
    header.parentNode.insertBefore(bar, header.nextSibling);

    bar.querySelector('#push-enable').addEventListener('click', function () {
      // Subscribe first (this click triggers the permission prompt), then link the contact.
      window.WebEmarsysSdk.subscribe()
        .then(function () { note('subscribe finished'); return syncContact(); })
        .then(function () { refreshBar(); })
        .catch(function (e) { note('subscribe failed', String(e)); });
    });
    bar.querySelector('#push-dismiss').addEventListener('click', function () {
      try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch (e) { /* ignore */ }
      bar.hidden = true;
    });
  }

  /**
   * The bar is always explained, never silently hidden:
   *  - permission 'default'  -> "Enable notifications" (prompt appears after the click)
   *  - permission 'granted'  -> if the SDK says not subscribed yet, "Finish setup" (links + subscribes);
   *                             if already subscribed, the bar is hidden
   *  - permission 'denied'   -> tells the visitor how to unblock (the browser never asks twice)
   */
  function refreshBar() {
    if (!bar) return;
    var perm = Notification.permission;                  // 'default' | 'granted' | 'denied'
    var s = currentSession();
    var text = bar.querySelector('#push-text');
    var enable = bar.querySelector('#push-enable');
    if (dismissed()) { bar.hidden = true; return; }

    if (perm === 'denied') {
      text.textContent = 'Notifications are blocked for this site. Allow them via the lock icon next to the address bar, then reload.';
      enable.hidden = true;
      bar.hidden = false;
      return;
    }
    enable.hidden = false;
    if (perm === 'granted') {
      // Permission exists; show the bar only while the SDK does not consider the browser subscribed.
      var sdk = window.WebEmarsysSdk;
      if (!sdk || typeof sdk.isSubscribed !== 'function') { bar.hidden = true; return; }
      sdk.isSubscribed().then(function (sub) {
        text.textContent = 'Notifications are allowed but not linked yet' + (s ? ' for ' + s.name : ' (log in first)') + '.';
        enable.textContent = 'Finish setup';
        bar.hidden = !!sub;
      }).catch(function () { bar.hidden = true; });
      return;
    }
    text.textContent = s
      ? 'Get deal alerts as browser notifications, linked to ' + s.name + '.'
      : 'Get deal alerts as browser notifications. Log in first so they reach your account.';
    enable.textContent = 'Enable notifications';
    bar.hidden = false;
  }

  document.addEventListener('DOMContentLoaded', function () {
    // pages.js renders the header on DOMContentLoaded too; wait one tick so #site-header is filled.
    setTimeout(function () { buildBar(); refreshBar(); }, 0);
  });
})();
