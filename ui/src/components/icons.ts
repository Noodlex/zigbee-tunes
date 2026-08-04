// Shared inline SVG icons, so the same action always looks the same.
// Same approach as the sidebar icons in App.vue: render functions passed to
// <NIcon><component :is="..." /></NIcon>, no icon-font dependency.

import { h } from 'vue';

function icon(path: string) {
  return () =>
    h('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [h('path', { d: path })]);
}

/** mdi:pencil — edit. */
export const IconPencil = icon(
  'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
);

/** mdi:delete — remove. */
export const IconTrash = icon(
  'M9 3v1H4v2h1v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6h1V4h-5V3H9zm0 5h2v9H9V8zm4 0h2v9h-2V8z',
);
