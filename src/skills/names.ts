export function isManagedGooseworksSkill(name: string): boolean {
  return (
    name === 'gooseworks' ||
    name === 'ads-remix' ||
    name.startsWith('gooseworks-') ||
    name.startsWith('goose-')
  );
}
