// ═══════════════════════════════════════════════════════════════════════
//  a11y.js — makes onclick-only nav links keyboard accessible
//  The dashboards use <a class="nav-link" onclick="…"> with no href, so
//  they are not focusable or Enter/Space-activatable by default. This
//  upgrades them to role=button + tabindex and wires keyboard activation.
//  (WCAG 2.1.1 Keyboard, 4.1.2 Name/Role/Value)
// ═══════════════════════════════════════════════════════════════════════
(function () {
  function upgrade() {
    document.querySelectorAll('a.nav-link[onclick]').forEach(function (el) {
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
      if (!el.hasAttribute('role'))     el.setAttribute('role', 'button');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', upgrade);
  } else {
    upgrade();
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    var el = document.activeElement;
    if (el && el.matches && el.matches('a.nav-link[onclick]')) {
      e.preventDefault();
      el.click();
    }
  });
})();
