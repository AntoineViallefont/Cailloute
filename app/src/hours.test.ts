import { describe, expect, it } from "vitest";
import { frenchHours, standardHours } from "./hours";
import { isOpen } from "./geo";
import { LYON, type Place } from "./types";

describe("Horaires en français", () => {
  it("affiche plages, listes et tous les jours en français", () => {
    expect(frenchHours("Mo-Fr 08:30-19:30; Sa,Su 09:00-12:00")).toBe(
      "Lu-Ve 08:30-19:30; Sa,Di 09:00-12:00",
    );
    expect(frenchHours("Mo,Tu,We,Th,Fr,Sa,Su")).toBe("Lu,Ma,Me,Je,Ve,Sa,Di");
  });
  it("conserve le format calculable et les commentaires lors d'une modification", () => {
    const original =
      'Mo-Fr 08:00-18:00; Su off "Mo-Fr, Ma et Di dans un commentaire"';
    expect(standardHours(frenchHours(original))).toBe(original);
    expect(frenchHours("24/7")).toBe("24/7");
    expect(standardHours("Lu-Ve 08:00-18:00")).toBe("Mo-Fr 08:00-18:00");
    const place: Place = {
      ...LYON,
      id: "horaires-test",
      name: "Lieu de test",
      category: "health",
      hours: standardHours("Lu-Ve 08:00-18:00"),
      version: 1, address: "", city: "Lyon", description: "", age: "", access: "public",
      wheelchair: null, changing_table: null, drinking_water: null, free: null,
      fenced: null, elevator: null, sources: [], rating: null, review_count: 0,
    };
    expect(isOpen(place, new Date(2026, 8, 14, 10))).toBe(true);
    expect(isOpen(place, new Date(2026, 8, 13, 10))).toBe(false);
  });
});

describe('horaires de consultation lisibles', () => {
  it('affiche les jours, mois et fermetures sans codes anglais', async () => {
    const {displayHours} = await import('./hours');
    expect(displayHours('Mo-Fr 08:30-19:00; Su off; PH off')).toBe('lundi–vendredi 8 h 30–19 h ; dimanche fermé ; jours fériés fermé');
    expect(displayHours('Apr-Sep 10:00-18:00')).toBe('avril–septembre 10 h–18 h');
    expect(displayHours('24/7')).toBe('Ouvert 24 h/24, 7 j/7');
    expect(displayHours('Tu "mandatory reservation by phone"')).toBe('mardi Réservation téléphonique obligatoire');
    expect(displayHours('Mo[1] 10:00-12:00')).toBe('1er lundi du mois 10 h–12 h');
  });
});
