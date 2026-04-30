import { describe, expect, it } from 'vitest';
import { HealthController } from '../health.controller';

describe('HealthController', () => {
  const controller = new HealthController();

  it('returns ok with non-negative uptime and ISO timestamp', () => {
    const result = controller.check();

    expect(result.status).toBe('ok');
    expect(result.uptime).toBeGreaterThanOrEqual(0);
    expect(() => new Date(result.timestamp).toISOString()).not.toThrow();
    expect(result.timestamp).toBe(new Date(result.timestamp).toISOString());
  });
});
