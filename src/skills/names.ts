export function isManagedGooseworksSkill(name: string): boolean {
  return name === 'gooseworks' || name.startsWith('gooseworks-') || name.startsWith('goose-');
}
