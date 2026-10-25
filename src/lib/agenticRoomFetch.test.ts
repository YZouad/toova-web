import { describe, expect, it } from 'vitest';
import { readAgenticRoomJson } from './agenticRoomFetch';

describe('readAgenticRoomJson', () => {
  it('handles empty body without throwing', async () => {
    const res = new Response('', { status: 502 });
    const out = await readAgenticRoomJson<{ ok?: boolean; error?: string }>(res);
    expect(out.ok).toBe(false);
    expect(out.data).toBeNull();
    expect(out.error).toMatch(/empty response|TRELLIS_BFF_ORIGIN/i);
  });

  it('hints when Vite proxy cannot reach local BFF (HTTP 500 empty)', async () => {
    const res = new Response('', { status: 500 });
    const out = await readAgenticRoomJson<{ ok?: boolean }>(res);
    expect(out.error).toMatch(/toova-bff/i);
  });

  it('humanizes Bedrock IAM errors', async () => {
    const res = new Response(
      JSON.stringify({
        ok: false,
        error:
          'User: arn:aws:iam::123:user/x is not authorized to perform: bedrock:InvokeModel on resource: arn:aws:bedrock:us-east-1:123:inference-profile/us.anthropic.claude-sonnet-4-6',
      }),
      { status: 502 },
    );
    const out = await readAgenticRoomJson<{ ok?: boolean; error?: string }>(res);
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/Bedrock access denied/i);
  });

  it('parses successful JSON', async () => {
    const res = new Response(JSON.stringify({ ok: true, result: { items: [] } }), { status: 200 });
    const out = await readAgenticRoomJson<{ ok?: boolean }>(res);
    expect(out.ok).toBe(true);
    expect(out.data?.ok).toBe(true);
  });
});
