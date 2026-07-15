// ═══════════════════════════════════════════════════════════════════════════════
//  ui.js — adds a Show/Hide toggle to every password field (login + modal forms).
//  Loaded by all staff dashboards. Uses a MutationObserver so it also enhances
//  password inputs added dynamically (e.g. the Create/Edit Staff modals).
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  function enhance(input) {
    if (!input || input.type !== 'password' || input.dataset.pwToggle) return;
    input.dataset.pwToggle = '1';

    var holder = document.createElement('div');
    holder.style.position = 'relative';
    input.parentNode.insertBefore(holder, input);
    holder.appendChild(input);
    input.style.paddingRight = '64px';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Show';
    btn.setAttribute('aria-label', 'Show password');
    btn.style.cssText = 'position:absolute;right:8px;top:50%;transform:translateY(-50%);' +
      'background:none;border:none;cursor:pointer;padding:6px;' +
      "font:700 .75rem/1 Inter,system-ui,sans-serif;color:#5B45E8;";
    btn.addEventListener('click', function () {
      var reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      btn.textContent = reveal ? 'Hide' : 'Show';
      btn.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
      input.focus();
    });
    holder.appendChild(btn);
  }

  function scan(root) {
    if (root && root.querySelectorAll) root.querySelectorAll('input[type=password]').forEach(enhance);
  }

  function init() {
    scan(document);
    if (window.MutationObserver) {
      new MutationObserver(function (muts) {
        muts.forEach(function (m) {
          (m.addedNodes || []).forEach(function (n) {
            if (n.nodeType !== 1) return;
            if (n.matches && n.matches('input[type=password]')) enhance(n);
            scan(n);
          });
        });
      }).observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

// ═══════════════════════════════════════════════════════════════════════════════
//  Mobile shell — turns the permanent sidebar into an off-canvas drawer below
//  1024px. Injects a hamburger button into the page header and a scrim that
//  closes the drawer. Pure enhancement: desktop layout is untouched, and pages
//  without an aside.hk-sidebar are skipped. Styles live in theme.css.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  function init() {
    var aside = document.querySelector('aside.hk-sidebar');
    if (!aside || document.querySelector('.hk-mobile-toggle')) return;
    var header = document.querySelector('header');
    if (!header) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hk-mobile-toggle';
    btn.innerHTML = '&#9776;'; // ☰
    btn.setAttribute('aria-label', 'Open navigation menu');
    btn.setAttribute('aria-expanded', 'false');
    header.insertBefore(btn, header.firstChild);

    var scrim = null;
    function close() {
      aside.classList.remove('hk-open');
      btn.setAttribute('aria-expanded', 'false');
      if (scrim) { scrim.remove(); scrim = null; }
    }
    function open() {
      aside.classList.add('hk-open');
      btn.setAttribute('aria-expanded', 'true');
      scrim = document.createElement('button');
      scrim.type = 'button';
      scrim.className = 'hk-scrim';
      scrim.setAttribute('aria-label', 'Close navigation menu');
      scrim.addEventListener('click', close);
      document.body.appendChild(scrim);
    }
    btn.addEventListener('click', function () {
      aside.classList.contains('hk-open') ? close() : open();
    });
    // Navigating from the drawer should close it.
    aside.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.nav-link')) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
