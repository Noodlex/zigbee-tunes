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

// Module-level, so every caller shares ONE source of truth. Building this
// state inside the function would hand each extra consumer its own copy:
// it would read the right value on mount and then never see the preference
// change, so that component would keep rendering the previous theme.
const pref = ref<ThemePref>(loadPref());
const systemDark = ref(detectSystemDark());

const isDark = computed(() => pref.value === 'dark' || (pref.value === 'auto' && systemDark.value));
const theme = computed<GlobalTheme | null>(() => (isDark.value ? darkTheme : null));

function setPref(p: ThemePref) {
  pref.value = p;
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, p);
}

/**
 * Theme state:
 *  - pref: user preference (dark | light | auto), persisted in
 *    localStorage. 'auto' = follows prefers-color-scheme.
 *  - isDark: computed boolean combining pref + system media query.
 *  - theme: value to pass to <NConfigProvider :theme="...">. null = the
 *    default naive-ui light theme, darkTheme = dark theme.
 *
 * The state above is shared; each caller only registers its own listener on
 * the system media query so 'auto' keeps tracking the OS setting.
 */
export function useTheme(): ThemeApi {
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

  return { pref, isDark, theme, setPref };
}
