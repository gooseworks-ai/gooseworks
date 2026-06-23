export function isManagedGooseworksSkill(name: string): boolean {
  return (
    name === 'gooseworks' ||
    // `ads-remix` was renamed to `goose-ads`; keep it managed so a stale
    // ads-remix dir from an older install is cleaned up on the next install.
    name === 'ads-remix' ||
    name.startsWith('gooseworks-') ||
    name.startsWith('goose-')
  );
}
