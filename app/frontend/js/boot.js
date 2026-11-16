// Runs before first paint and before the modules load. It stays ES5 on
// purpose: if the browser cannot parse the modules, this still runs.
(function () {
  // A tablet has no console, so a script error is shown on screen instead of
  // leaving a blank page. Only the message and the file name are shown.
  function show(text) {
    var el = document.getElementById('fatal');
    if (!el) return;
    el.textContent = text;
    el.className = 'fatal is-visible';
  }
  function name(url) {
    return String(url || '').split('?')[0].split('/').pop();
  }
  window.addEventListener('error', function (event) {
    var target = event.target;
    if (target && target !== window && (target.src || target.href)) {
      show('Could not load ' + name(target.src || target.href));
      return;
    }
    show((event.message || 'Script error') + (event.filename ? ' (' + name(event.filename) + ':' + event.lineno + ')' : ''));
  }, true);
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    show('Unhandled: ' + (reason && reason.message ? reason.message : reason));
  });

  // A stored manual dark preference must not flash light.
  try {
    var prefs = JSON.parse(window.localStorage.getItem('hhd.prefs') || '{}') || {};
    var root = document.documentElement;
    if (prefs.mode === 'manual' && prefs.manual === 'dark') root.setAttribute('data-theme', 'dark');
    if (prefs.lang === 'nl' || prefs.lang === 'en') root.setAttribute('lang', prefs.lang);
  } catch (err) {
    // Storage is unavailable or corrupt; the defaults in the markup apply.
  }
})();
