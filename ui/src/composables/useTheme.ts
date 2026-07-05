import { computed, onMounted, onUnmounted, ref, type ComputedRef, type Ref } from 'vue';
import { darkTheme, type GlobalTheme } from 'naive-ui';

export type ThemePref = 'dark' | 'light' | 'auto';

const STORAGE_KEY = 'zt-theme-pref';

function loadPref(): ThemePref {
  if (typeof localStorage === 'undefined') return 'auto';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'dark' || stored === 'light' || stored === 'auto') return stored;
  return 'auto';
}

function detectSystemDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

interface ThemeApi {
  pref: Ref<ThemePref>;
  isDark: ComputedRef<boolean>;
  theme: ComputedRef<GlobalTheme | null>;
  setPref: (p: ThemePref) => void;
}

/**
 * Theme state:
 *  - pref: user preference (dark | light | auto), persisted in
 *    localStorage. 'auto' = follows prefers-color-scheme.
 *  - isDark: computed boolean combining pref + system media query.
 *  - theme: value to pass to <NConfigProvider :theme="...">. null = the
 *    default naive-ui light theme, darkTheme = dark theme.
 */
export function useTheme(): ThemeApi {
  const pref = ref<ThemePref>(loadPref());
  const systemDark = ref(detectSystemDark());

  let mql: MediaQueryList | null = null;
  const onChange = (e: MediaQueryListEvent) => {
    systemDark.value = e.matches;
  };

  onMounted(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    mql = window.matchMedia('(prefers-color-scheme: dark)');
    mql.addEventListener('change', onChange);
  });

  onUnmounted(() => {
    if (mql) mql.removeEventListener('change', onChange);
  });

  const isDark = computed(() => pref.value === 'dark' || (pref.value === 'auto' && systemDark.value));
  const theme = computed<GlobalTheme | null>(() => (isDark.value ? darkTheme : null));

  function setPref(p: ThemePref) {
    pref.value = p;
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, p);
  }

  return { pref, isDark, theme, setPref };
}
