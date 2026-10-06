import { expect, it } from "vitest";
import { googleMapsSearch } from "./google-maps";
const place = {
  id: "p1",
  name: "Square & jeux",
  address: "1 rue Test",
  city: "Lyon",
  lat: 45.75,
  lon: 4.83,
};
it("construit une recherche Google Maps sans clé, avec adresse ou coordonnées", () => {
  const url = new URL(googleMapsSearch(place));
  expect(url.origin).toBe("https://www.google.com");
  expect(url.searchParams.get("api")).toBe("1");
  expect(url.searchParams.get("query")).toBe("Square & jeux, 1 rue Test, Lyon");
  expect(
    new URL(
      googleMapsSearch({ ...place, address: "", city: "" }),
    ).searchParams.get("query"),
  ).toBe("45.75,4.83");
});

it("utilise uniquement les coordonnées quand seule la commune est connue", () => {
  expect(
    new URL(
      googleMapsSearch({
        ...place,
        name: "Toilettes",
        address: "",
        city: "Lyon",
      }),
    ).searchParams.get("query"),
  ).toBe("45.75,4.83");
});
