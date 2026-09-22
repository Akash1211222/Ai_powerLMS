import { describe, it, expect, vi } from 'vitest';
import { SessionEvents } from './session-events';

describe('SessionEvents', () => {
  it('tells every listener, even after one fails', async () => {
    const events = new SessionEvents();
    const after = vi.fn();
    events.onLogout(() => {
      throw new Error('boom');
    });
    events.onLogout(after);
    await expect(events.loggedOut('user_1')).resolves.toBeUndefined();
    expect(after).toHaveBeenCalledWith('user_1');
  });
});
