// ===== THEME DE L'INTERFACE (clair / sombre / systeme) =====
// Préférence personnelle à l'appareil : volontairement séparée de la
// configuration d'entreprise (elle ne doit pas se synchroniser via le cloud).
const THEME_KEY = 'pos-theme-preference';
const darkMediaQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function getStoredPreference() {
  const stored = localStorage.getItem(THEME_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

function resolveTheme(preference) {
  if (preference === 'system') {
    return darkMediaQuery && darkMediaQuery.matches ? 'dark' : 'light';
  }
  return preference;
}

function applyResolvedTheme(preference) {
  document.documentElement.setAttribute('data-theme', resolveTheme(preference));
}

function updateActiveButton(preference) {
  document.querySelectorAll('.theme-option[data-theme-choice]').forEach((button) => {
    button.classList.toggle('active', button.dataset.themeChoice === preference);
  });
}

export function setThemePreference(preference) {
  localStorage.setItem(THEME_KEY, preference);
  applyResolvedTheme(preference);
  updateActiveButton(preference);
}

export function initTheme() {
  const preference = getStoredPreference();
  applyResolvedTheme(preference);
  updateActiveButton(preference);

  if (darkMediaQuery) {
    darkMediaQuery.addEventListener('change', () => {
      if (getStoredPreference() === 'system') applyResolvedTheme('system');
    });
  }

  document.querySelectorAll('.theme-option[data-theme-choice]').forEach((button) => {
    button.addEventListener('click', () => setThemePreference(button.dataset.themeChoice));
  });
}
