import { hostTextReader } from './fetchers';

describe('hostTextReader (social.fetch)', () => {
  const answer = (over: Record<string, unknown>) => async () => ({ status: 200, body: '<html>ok</html>', encoding: 'utf8', truncated: false, contentType: 'text/html', ...over });

  it('returns the body of a complete text answer', async () => {
    expect(await hostTextReader(answer({}))('https://x')).toBe('<html>ok</html>');
  });

  it('refuses a TRUNCATED body: a prefix is never a whole text', async () => {
    await expect(hostTextReader(answer({ truncated: true }))('https://x')).rejects.toThrow('HOST_FETCH_TRUNCATED');
  });

  it('refuses a base64 body and an answer without a body', async () => {
    await expect(hostTextReader(answer({ encoding: 'base64' }))('https://x')).rejects.toThrow('HOST_FETCH_NOT_TEXT');
    await expect(hostTextReader(async () => undefined)('https://x')).rejects.toThrow('HOST_FETCH_NO_BODY');
  });

  it('lets the host error through (a non-2xx is thrown by the host as HTTP_<status>)', async () => {
    await expect(hostTextReader(async () => { throw new Error('HTTP_404'); })('https://x')).rejects.toThrow('HTTP_404');
  });
});
