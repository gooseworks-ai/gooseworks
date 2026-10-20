import { pluginSource } from "./plugin-source";
import { getGooseVideoLocalSkillContent } from "./legacy-video-local";
export { getGooseVideoLocalSkillContent } from "./legacy-video-local";

export interface EntrySkill {
  name: string;
  content: string;
}
const entry = (name: string): string => {
  const skill = pluginSource.entries.find((item) => item.name === name);
  if (!skill) throw new Error(`Missing app-owned entry: ${name}`);
  return skill.content;
};

/** Keep the installed CLI order and retired helper compatible with existing releases. */
export function getEntrySkills(): EntrySkill[] {
  return [
    { name: "gooseworks", content: entry("gooseworks") },
    { name: "goose-ads", content: entry("goose-ads") },
    { name: "goose-video", content: entry("goose-video") },
    { name: "goose-video-local", content: getGooseVideoLocalSkillContent() },
    { name: "make-custom-video", content: entry("make-custom-video") },
    { name: "goose-product-photos", content: entry("goose-product-photos") },
  ];
}
export const getEntrySkillNames = (): string[] =>
  getEntrySkills().map((skill) => skill.name);
export const getMasterSkillContent = (): string => entry("gooseworks");
export const getGooseAdsSkillContent = (): string => entry("goose-ads");
export const getGooseProductPhotosSkillContent = (): string =>
  entry("goose-product-photos");
export const getGooseVideoSkillContent = (): string => entry("goose-video");
export const getMakeCustomVideoSkillContent = (): string =>
  entry("make-custom-video");
