import { describe, expect, it } from 'vitest';
import { parseReviseActions, parseReviseAgentResponse } from './reviseSchema';

describe('parseReviseActions', () => {
  it('accepts paint_wall and rejects unknown types', () => {
    const actions = parseReviseActions([
      { type: 'paint_wall', color: '#112233' },
      { type: 'nope' },
      { type: 'set_appearance', floorPreset: 'lightOak' },
    ]);
    expect(actions).toHaveLength(2);
    expect(actions[0]).toEqual({ type: 'paint_wall', color: '#112233' });
  });

  it('parses agent envelope', () => {
    const parsed = parseReviseAgentResponse({
      reply: 'Done.',
      actions: [{ type: 'add_item', query: 'desk lamp', placement: 'desk' }],
    });
    expect(parsed?.reply).toBe('Done.');
    expect(parsed?.actions[0]?.type).toBe('add_item');
  });
});
