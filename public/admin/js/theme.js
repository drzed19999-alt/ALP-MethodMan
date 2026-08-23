/**
 * ALP Theme Manager
 * Handles dark/light mode toggle with smooth transitions and localStorage persistence.
 */
const ALPTheme = (() => {
  const STORAGE_KEY = 'alp_theme';
  const TRANSITION_DURATION = 200;

  /**
   * Get the current theme ('dark' or 'light'). Prefers what the FOUC guard
   * already set on <html> over localStorage, so a system-preference-only user
   * doesn't get persisted as "chose dark/light".
   */
  function get() {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'dark' || attr === 'light') return attr;
    return localStorage.getItem(STORAGE_KEY) || 'dark';
  }

  /**
   * Apply a theme. `persist` controls whether the choice is written to
   * localStorage — user toggles persist; auto-detection does not.
   */
  function apply(theme, persist) {
    document.documentElement.setAttribute('data-theme', theme);
    if (persist !== false) localStorage.setItem(STORAGE_KEY, theme);
    _updateToggleIcons(theme);
  }

  /**
   * Toggle between dark and light with a smooth transition.
   */
  function toggle() {
    const current = get();
    const next = current === 'dark' ? 'light' : 'dark';

    // Add transition class for smooth color change
    document.documentElement.classList.add('theme-transitioning');

    apply(next);

    // Remove transition class after animation completes
    setTimeout(() => {
      document.documentElement.classList.remove('theme-transitioning');
    }, TRANSITION_DURATION);

    return next;
  }

  /**
   * Initialize: the FOUC guard in index.html already stamped data-theme.
   * We just sync toggle icons and listen for system changes.
   */
  function init() {
    _updateToggleIcons(get());

    // Listen for system theme changes — only auto-switch if the user hasn't
    // explicitly chosen a theme (nothing in localStorage).
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem(STORAGE_KEY)) {
        apply(e.matches ? 'dark' : 'light', false);
      }
    });

    _injectTransitionStyle();
  }

  /**
   * Update all theme toggle button icons on the page.
   */
  function _updateToggleIcons(theme) {
    const toggleBtns = document.querySelectorAll('.theme-toggle-btn');
    toggleBtns.forEach(btn => {
      const sunIcon = btn.querySelector('.icon-sun');
      const moonIcon = btn.querySelector('.icon-moon');
      if (sunIcon && moonIcon) {
        if (theme === 'dark') {
          sunIcon.style.display = 'block';
          moonIcon.style.display = 'none';
        } else {
          sunIcon.style.display = 'none';
          moonIcon.style.display = 'block';
        }
      }
    });
  }

  /**
   * Inject a <style> block for smooth theme transitions.
   */
  function _injectTransitionStyle() {
    if (document.getElementById('alp-theme-transition')) return;
    const style = document.createElement('style');
    style.id = 'alp-theme-transition';
    style.textContent = `
      .theme-transitioning,
      .theme-transitioning *,
      .theme-transitioning *::before,
      .theme-transitioning *::after {
        transition: background-color ${TRANSITION_DURATION}ms ease,
                    color ${TRANSITION_DURATION}ms ease,
                    border-color ${TRANSITION_DURATION}ms ease,
                    box-shadow ${TRANSITION_DURATION}ms ease !important;
      }
    `;
    document.head.appendChild(style);
  }

  return { get, apply, toggle, init };
})();

// Export globally
window.ALPTheme = ALPTheme;

// Auto-initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ALPTheme.init());
} else {
  ALPTheme.init();
}
