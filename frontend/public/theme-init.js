// Ticket 16: apply the stored theme before first paint (stored choice wins,
// otherwise the OS preference on first visit, otherwise light). Kept as an
// external file so the production CSP can stay `script-src 'self'`.
;(function () {
  try {
    var saved = localStorage.getItem('mj_theme')
    var dark =
      saved === 'dark'
        ? true
        : saved === 'light'
          ? false
          : window.matchMedia &&
            window.matchMedia('(prefers-color-scheme: dark)').matches
    if (dark) document.documentElement.classList.add('dark')
  } catch (e) {
    /* light default */
  }
  // Account language pilot: the choice is scoped to the account page, so the
  // document direction never changes — it stays Arabic RTL for the whole app.
  // Nothing to apply before the first paint, and so no way to flash the
  // wrong direction.
})()
