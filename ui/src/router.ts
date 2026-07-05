import { createRouter, createWebHashHistory } from 'vue-router';

const routes = [
  { path: '/', name: 'devices', component: () => import('./views/Devices.vue') },
  {
    path: '/customizations',
    name: 'customizations',
    component: () => import('./views/Customizations.vue'),
  },
  { path: '/dashboard', name: 'dashboard', component: () => import('./views/Dashboard.vue') },
  // Legacy alias: old French URL still works (bookmarks, etc.)
  { path: '/personnalisations', redirect: '/customizations' },
  // Catch-all -> redirects to devices (fallback for unknown URLs)
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});
