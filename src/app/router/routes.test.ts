import { describe, expect, it } from 'vitest';
import { routes, routeValues } from './routes';
describe('application routes', () => { it('contains every required workspace route', () => expect([routes.home,routes.chat,routes.projects,routes.coding,routes.terminal,routes.tools,routes.history]).toHaveLength(7)); it('contains settings subroutes', () => expect(routeValues.has('/settings/permissions')).toBe(true)); });
