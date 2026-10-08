import { chooseLoginMode, type LoginModeOptions } from '../../src/auth/login-mode';

const noFiles = () => false;
const noProcVersion = () => { throw new Error('ENOENT'); };

/** A macOS desktop with nothing special set: the browser flow. */
function choose(
  opts: LoginModeOptions = {},
  env: NodeJS.ProcessEnv = {},
  platform: NodeJS.Platform = 'darwin',
  exists: (file: string) => boolean = noFiles,
  readFile: (file: string) => string = noProcVersion,
) {
  return chooseLoginMode(opts, env, platform, exists, readFile).mode;
}

describe('auth/login-mode', () => {
  describe('one case per rule', () => {
    it('1. --device and --no-wait pick device', () => {
      expect(choose({ device: true })).toBe('device');
      expect(choose({ noWait: true })).toBe('device');
    });

    it('2. --browser picks browser', () => {
      expect(choose({ browser: true }, { SSH_CONNECTION: '1.2.3.4 5 6.7.8.9 22' })).toBe('browser');
    });

    it('3. GOOSEWORKS_LOGIN picks that mode', () => {
      expect(choose({}, { GOOSEWORKS_LOGIN: 'device' })).toBe('device');
      expect(choose({}, { GOOSEWORKS_LOGIN: 'browser', CI: 'true' })).toBe('browser');
      expect(choose({}, { GOOSEWORKS_LOGIN: 'sideways' })).toBe('browser');
    });

    it('4. a pending device sign-in is resumed', () => {
      expect(chooseLoginMode({ pendingLogin: true }, {}, 'darwin', noFiles, noProcVersion))
        .toEqual({ mode: 'device', reason: 'resuming a pending device sign-in' });
    });

    it('5. an SSH session picks device', () => {
      expect(choose({}, { SSH_CONNECTION: '1.2.3.4 5 6.7.8.9 22' })).toBe('device');
      expect(choose({}, { SSH_CLIENT: '1.2.3.4 5 22' })).toBe('device');
      expect(choose({}, { SSH_TTY: '/dev/ttys001' })).toBe('device');
    });

    it('6. CI picks device when truthy', () => {
      expect(choose({}, { CI: 'true' })).toBe('device');
      expect(choose({}, { CI: '1' })).toBe('device');
      expect(choose({}, { CI: 'false' })).toBe('browser');
      expect(choose({}, { CI: '0' })).toBe('browser');
    });

    it('7. Linux without a display picks device; with one, browser', () => {
      expect(choose({}, {}, 'linux')).toBe('device');
      expect(choose({}, { DISPLAY: ':0' }, 'linux')).toBe('browser');
      expect(choose({}, { WAYLAND_DISPLAY: 'wayland-0' }, 'linux')).toBe('browser');
    });

    it('8. container markers pick device', () => {
      expect(choose({}, {}, 'darwin', (file) => file === '/.dockerenv')).toBe('device');
      expect(choose({}, {}, 'darwin', (file) => file === '/run/.containerenv')).toBe('device');
      expect(choose({}, { container: 'podman' })).toBe('device');
      expect(choose({}, { KUBERNETES_SERVICE_HOST: '10.0.0.1' })).toBe('device');
    });

    it('9. otherwise browser (macOS and Windows desktops)', () => {
      expect(choose()).toBe('browser');
      expect(choose({}, {}, 'win32')).toBe('browser');
    });
  });

  describe('precedence', () => {
    it('explicit flags beat GOOSEWORKS_LOGIN', () => {
      expect(choose({ device: true }, { GOOSEWORKS_LOGIN: 'browser' })).toBe('device');
      expect(choose({ browser: true }, { GOOSEWORKS_LOGIN: 'device' })).toBe('browser');
    });

    it('GOOSEWORKS_LOGIN beats a pending sign-in and the heuristics', () => {
      expect(choose({ pendingLogin: true }, { GOOSEWORKS_LOGIN: 'browser' })).toBe('browser');
      expect(choose({}, { GOOSEWORKS_LOGIN: 'browser', SSH_TTY: '/dev/pts/0' }, 'linux', () => true)).toBe('browser');
    });

    it('--browser beats a pending sign-in', () => {
      expect(choose({ browser: true, pendingLogin: true })).toBe('browser');
    });

    it('WSL without a display uses the Windows browser', () => {
      expect(choose({}, { WSL_DISTRO_NAME: 'Ubuntu' }, 'linux')).toBe('browser');
      expect(choose({}, {}, 'linux', noFiles, () => 'Linux version 5.15.90.1-microsoft-standard-WSL2')).toBe('browser');
    });
  });
});
