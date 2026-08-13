import { recordAttributionRef } from '../../src/auth/attribution';

describe('recordAttributionRef', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('skips an empty ref', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as typeof fetch;

    await expect(recordAttributionRef('https://api.gooseworks.ai', '  ', 'cal_test'))
      .resolves.toEqual({ recorded: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('records a ref against the authenticated user', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ recorded: true, kind: 'marketing' }),
    });
    global.fetch = fetchMock as typeof fetch;

    await expect(recordAttributionRef('https://api.gooseworks.ai/', 'brand-growth-x-1', 'cal_test'))
      .resolves.toEqual({ recorded: true, kind: 'marketing' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.gooseworks.ai/api/cli/attribution',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer cal_test' }),
      }),
    );
  });

  it('does not block setup when attribution fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as typeof fetch;
    await expect(recordAttributionRef('https://api.gooseworks.ai', 'campaign', 'cal_test'))
      .resolves.toEqual({ recorded: false });
  });
});
