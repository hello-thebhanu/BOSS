export const routes = {
  welcome: '/welcome', trailer: '/trailer', auth: '/auth', home: '/home', chat: '/chat',
  projects: '/projects', coding: '/coding', terminal: '/terminal', git: '/git', tools: '/tools', history: '/history',
  settings: '/settings', general: '/settings/general', appearance: '/settings/appearance', voice: '/settings/voice',
  models: '/settings/models', memory: '/settings/memory', profile: '/settings/profile',
  permissions: '/settings/permissions', about: '/settings/about',
} as const;

export type AppRoute = (typeof routes)[keyof typeof routes];
export const routeValues = new Set<string>(Object.values(routes));
