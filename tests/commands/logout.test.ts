jest.mock('../../src/auth/credentials', () => ({
  getCredentials: jest.fn(),
  clearCredentials: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  banner: jest.fn(),
  step: jest.fn(),
  info: jest.fn(),
  success: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  example: jest.fn(),
  spinner: jest.fn().mockReturnValue({ stop: jest.fn() }),
  done: jest.fn(),
}));

import { getCredentials, clearCredentials } from '../../src/auth/credentials';
import * as loggerModule from '../../src/utils/logger';
import { logoutCommand } from '../../src/commands/logout';

const mockGetCredentials = getCredentials as jest.MockedFunction<typeof getCredentials>;
const mockClearCredentials = clearCredentials as jest.MockedFunction<typeof clearCredentials>;

describe('logout command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does nothing when not logged in', async () => {
    mockGetCredentials.mockReturnValue(null);

    await logoutCommand.parseAsync(['node', 'test']);

    expect(loggerModule.info).toHaveBeenCalledWith('Not currently logged in.');
    expect(mockClearCredentials).not.toHaveBeenCalled();
  });

  it('clears credentials and logs email when logged in', async () => {
    mockGetCredentials.mockReturnValue({
      api_key: 'cal_test',
      email: 'u@example.com',
      agent_id: 'agent-1',
      api_base: 'https://app.gooseworks.ai',
    });

    await logoutCommand.parseAsync(['node', 'test']);

    expect(mockClearCredentials).toHaveBeenCalled();
    expect(loggerModule.success).toHaveBeenCalledWith(
      expect.stringContaining('u@example.com')
    );
  });
});
