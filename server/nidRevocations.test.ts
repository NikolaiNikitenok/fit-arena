import { describe, expect, it, vi } from 'vitest';
import { NidRevocations } from './nidRevocations';

describe('ID session revocation', () => {
  it('rejects old versions after logout and closes when its authoritative cache expires', async () => {
    let versions: Record<string, number> = {};
    const state = new NidRevocations({ internal: 'http://id.test', clientId: 'arena', secret: 'test',
      fetch: (async () => new Response(JSON.stringify({ versions }))) as typeof fetch });
    await state.refresh();
    expect(state.accepts('nid_test', 0)).toBe(true);
    versions = { nid_test: 1 }; await state.refresh();
    expect(state.accepts('nid_test', 0)).toBe(false);
    expect(state.accepts('nid_test', 1)).toBe(true);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 121_000);
    expect(state.accepts('nid_test', 1)).toBe(false);
    clock.mockRestore(); state.close();
  });
});
