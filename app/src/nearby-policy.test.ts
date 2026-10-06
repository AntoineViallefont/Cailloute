import { describe, expect, it } from "vitest";
import { canSuggest, claimSuggestion, nearbyPromptKey, suggestionsEnabled } from "./nearby-prompt";
function memory() {
  const values = new Map<string,string>();
  return { getItem: (key:string) => values.get(key) ?? null, setItem: (key:string,value:string) => { values.set(key,value); } };
}
const day = 86400000;
const now = Date.parse("2026-09-16T10:00:00Z");
describe("Sollicitations limitées", () => {
  it("limite à une proposition sur 24 heures et trois sur sept jours glissants", () => {
    const storage = memory();
    expect(claimSuggestion(["a"],now,storage)).toBe(true);
    expect(claimSuggestion(["b"],now+day-1,storage)).toBe(false);
    expect(claimSuggestion(["b"],now+day,storage)).toBe(true);
    expect(claimSuggestion(["c"],now+2*day,storage)).toBe(true);
    expect(claimSuggestion(["d"],now+3*day,storage)).toBe(false);
    expect(claimSuggestion(["d"],now+7*day,storage)).toBe(true);
  });
  it("ne repropose jamais un lieu déjà vu, même regroupé ou plusieurs semaines après", () => {
    const storage = memory();
    expect(claimSuggestion(["a","b"],now,storage)).toBe(true);
    expect(canSuggest(["b","c"],now+30*day,storage)).toBe(false);
    expect(canSuggest(["c"],now+30*day,storage)).toBe(true);
  });
  it("respecte la désactivation et les contributions, sans consommer de quota", () => {
    const storage = memory();
    storage.setItem("nearby-suggestions-enabled-v1","false");
    expect(suggestionsEnabled(storage)).toBe(false);
    expect(claimSuggestion(["a"],now,storage)).toBe(false);
    storage.setItem("nearby-suggestions-enabled-v1","true");
    storage.setItem(nearbyPromptKey("b"),"contributed");
    expect(canSuggest(["b"],now,storage)).toBe(false);
    expect(claimSuggestion(["a"],now,storage)).toBe(true);
  });
  it("ne sollicite pas si l’historique est inaccessible, corrompu ou dans le futur", () => {
    const storage = memory();
    for (const value of ["invalid", "{}", '["yesterday"]', JSON.stringify([now+day])]) {
      storage.setItem("nearby-suggestions-history-v1",value);
      expect(canSuggest(["a"],now,storage)).toBe(false);
    }
    const broken = {getItem: () => {throw Error("blocked");},setItem: () => {throw Error("blocked");}};
    expect(claimSuggestion(["a"],now,broken)).toBe(false);
  });
});
