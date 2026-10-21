/*
 * Visible Web Extend debug console.
 *
 * A small panel pinned to the bottom of every page. Entries are kept in
 * sessionStorage so the log survives page navigation (home -> product -> cart ...)
 * and you can follow a whole shopper journey. Closing the tab clears it.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'we_debug_log';
  var COLLAPSED_KEY = 'we_debug_collapsed';
  var MAX_ENTRIES = 300;

  // sessionStorage can throw (private mode, blocked storage) - never break the page for a log.
  function load() {
    try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || []; } catch (e) { return []; }
  }
  function save(entries) {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES))); } catch (e) { /* ignore */ }
  }

  var panel, logEl;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function rowHtml(e) {
    var payload = e.payload === undefined ? '' : ' ' + JSON.stringify(e.payload);
    return '<span class="t">' + escapeHtml(e.time) + '</span> ' +
      '<span class="page">[' + escapeHtml(e.page) + ']</span> ' +
      '<span class="cmd ' + (e.kind || '') + '">' + escapeHtml(e.command) + '</span>' +
      escapeHtml(payload);
  }

  function appendRow(e) {
    if (!logEl) return;
    var div = document.createElement('div');
    div.className = 'row';
    div.innerHTML = rowHtml(e);
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function build() {
    panel = document.createElement('div');
    panel.id = 'we-console';
    panel.innerHTML =
      '<div class="bar">' +
        '<strong>Web Extend debug console</strong>' +
        '<span class="spacer"></span>' +
        '<button type="button" data-act="clear">Clear</button>' +
        '<button type="button" data-act="toggle">Collapse</button>' +
      '</div><div class="log" aria-live="polite"></div>';
    document.body.appendChild(panel);
    logEl = panel.querySelector('.log');

    // Restore previous entries and collapsed state.
    load().forEach(appendRow);
    var collapsed = false;
    try { collapsed = sessionStorage.getItem(COLLAPSED_KEY) === '1'; } catch (e) { /* ignore */ }
    setCollapsed(collapsed);

    panel.addEventListener('click', function (ev) {
      var act = ev.target.getAttribute && ev.target.getAttribute('data-act');
      if (act === 'clear') { save([]); logEl.innerHTML = ''; }
      if (act === 'toggle') { setCollapsed(!panel.classList.contains('collapsed')); }
    });
  }

  function setCollapsed(c) {
    panel.classList.toggle('collapsed', c);
    document.body.classList.toggle('console-collapsed', c);
    panel.querySelector('[data-act="toggle"]').textContent = c ? 'Expand' : 'Collapse';
    try { sessionStorage.setItem(COLLAPSED_KEY, c ? '1' : '0'); } catch (e) { /* ignore */ }
  }

  /**
   * Public API.
   * log(command, payload, kind) - kind 'note' renders in amber (non-SAP info messages).
   */
  window.WebExtendDebug = {
    log: function (command, payload, kind) {
      var now = new Date();
      var entry = {
        time: now.toTimeString().slice(0, 8),
        page: location.pathname.split('/').pop() || 'index.html',
        command: command,
        payload: payload,
        kind: kind || ''
      };
      var entries = load();
      entries.push(entry);
      save(entries);
      appendRow(entry);               // no-op until the panel exists
      if (window.console) console.log('[WebExtend]', command, payload === undefined ? '' : payload);
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
