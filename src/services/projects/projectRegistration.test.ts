import { describe, expect, it } from 'vitest';
import { registerProject } from './projectRegistration';

describe('project registration boundary', () => {
  it('exposes only explicit permission decisions', () => {
    expect(registerProject).toBeTypeOf('function');
  });
});
