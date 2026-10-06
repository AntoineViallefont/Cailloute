import { afterEach, describe, expect, it, vi } from "vitest";
import { automaticPlaceName } from "./place-name";
const p = { category: "toilet" as const, lat: 45.7578, lon: 4.832 };
const result = (properties: Record<string, unknown>) => ({
  ok: true,
  json: async () => ({ features: [{ properties }] }),
});
afterEach(() => vi.unstubAllGlobals());
describe("Nom automatique d'un lieu", () => {
  it("conserve le nom saisi sans appel réseau", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(await automaticPlaceName({ ...p, name: "  Mes toilettes  " })).toBe(
      "Mes toilettes",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("associe le type au numéro et à la rue, sans déplacer le lieu", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        result({
          type: "housenumber",
          housenumber: "7 bis",
          street: "Place Bellecour",
          city: "Lyon",
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    expect(await automaticPlaceName(p)).toBe(
      "Toilettes · 7 bis Place Bellecour",
    );
    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.searchParams.get("lat")).toBe(String(p.lat));
    expect(url.searchParams.get("lon")).toBe(String(p.lon));
    expect(url.searchParams.get("type")).toBe("housenumber");
    expect(
      await automaticPlaceName({
        ...p,
        category: "health",
        health_type: "pharmacy",
      }),
    ).toBe("Pharmacie · 7 bis Place Bellecour");
  });
  it("utilise la rue seule si aucun numéro n'est trouvé", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ features: [] }),
        })
        .mockResolvedValueOnce(
          result({ type: "street", name: "Rue des Fleurs" }),
        ),
    );
    expect(await automaticPlaceName(p)).toBe("Toilettes · Rue des Fleurs");
  });
  it("autorise la création hors ligne sans inventer de numéro", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await automaticPlaceName(p)).toBe("Toilettes");
  });
});
