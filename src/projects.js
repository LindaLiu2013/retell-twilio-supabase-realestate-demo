export const projects = [
  {
    slug: "harbour-view-residences",
    name: "Harbour View Residences",
    aliases: ["harbour view", "harbor view", "north sydney apartments"],
    salesperson: "Ava Chen",
    notifyEmail: "ava.sales@example.com",
    notifySms: "+61411111111"
  },
  {
    slug: "parramatta-square-living",
    name: "Parramatta Square Living",
    aliases: ["parramatta square", "parramatta apartments", "west sydney project"],
    salesperson: "Marcus Lee",
    notifyEmail: "marcus.sales@example.com",
    notifySms: "+61422222222"
  },
  {
    slug: "bondi-beach-collection",
    name: "Bondi Beach Collection",
    aliases: ["bondi", "bondi beach", "eastern suburbs project"],
    salesperson: "Sophie Nguyen",
    notifyEmail: "sophie.sales@example.com",
    notifySms: "+61433333333"
  }
];

export function matchProject(input = "") {
  const normalized = input.trim().toLowerCase();
  if (!normalized) return null;

  return (
    projects.find((project) => {
      const names = [project.name, project.slug, ...project.aliases];
      return names.some((name) => {
        const value = name.toLowerCase();
        return normalized === value || normalized.includes(value) || value.includes(normalized);
      });
    }) ?? null
  );
}
