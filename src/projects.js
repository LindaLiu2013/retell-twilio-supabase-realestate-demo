import { readJson } from "./data.js";

export const projects = readJson("../data/projects.json");

export function matchProject(input = "", projectList = projects) {
  const normalized = input.trim().toLowerCase();
  if (!normalized) return null;

  return (
    projectList.find((project) => {
      const names = [project.name, project.slug, ...project.aliases];
      return names.some((name) => {
        const value = name.toLowerCase();
        return normalized === value || normalized.includes(value) || value.includes(normalized);
      });
    }) ?? null
  );
}
