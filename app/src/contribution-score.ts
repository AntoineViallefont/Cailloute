export interface ContributionStats { added: number; edited: number }
export const emptyStats: ContributionStats = { added: 0, edited: 0 };
export const rewardLevels = [{ at: 0, name: "Petit coup de pouce" }, { at: 30, name: "Parent éclaireur" }, { at: 150, name: "Guide des familles" }, { at: 500, name: "Pilier du quartier" }, { at: 1500, name: "Grand explorateur" }];
export const rewardBadges = ["Premier repère", "Ouvreur de chemins", "Œil attentif", "Gardien des infos"];
export function contributionScore(stats: ContributionStats) {
  const points = stats.added * 10 + stats.edited * 3;

  const level = rewardLevels.filter(l => points >= l.at).at(-1)!;
  const next = rewardLevels.find(l => l.at > points);
  return { points, level: level.name, next, badges: [stats.added >= 1 && "Premier repère", stats.added >= 10 && "Ouvreur de chemins", stats.edited >= 10 && "Œil attentif", stats.edited >= 50 && "Gardien des infos"].filter(Boolean) as string[] };
}
