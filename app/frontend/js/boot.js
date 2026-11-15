// Runs before first paint so a stored manual dark preference does not flash light.
(function () {
  try {
    var prefs = JSON.parse(window.localStorage.getItem('hhd.prefs') || '{}') || {};
    var root = document.documentElement;
    if (prefs.mode === 'manual' && prefs.manual === 'dark') root.setAttribute('data-theme', 'dark');
    if (prefs.lang === 'nl' || prefs.lang === 'en') root.setAttribute('lang', prefs.lang);
  } catch (err) {
    // Storage is unavailable or corrupt; the defaults in the markup apply.
  }
})();
