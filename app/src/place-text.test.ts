import { describe, it, expect } from 'vitest';
import { cleanPlaceText, summarizePlaceText } from './place-text.mjs';
describe('nettoyage et synthèse des descriptions', () => {
  it('décode les tableaux et les caractères échappés sans montrer la syntaxe JSON', () => {
    expect(cleanPlaceText('["Jardin d\\u2019été.","Visites en famille."]')).toBe('Jardin d’été. Visites en famille.');
    expect(cleanPlaceText('["Jardin d\\\\u2019été.')).toBe('Jardin d’été.');
  });
  it('supprime les balises et corrige les entités, espaces et termes anglais connus', () => {
    expect(cleanPlaceText('<p>Activités&nbsp;indoor.</p><p>Jeux outdoor.</p>')).toBe('Activités en intérieur. Jeux en extérieur.');
    expect(cleanPlaceText('broken, no water (may 2022)')).toBe('Hors service, sans eau (observation de mai 2022).');
    expect(cleanPlaceText('Water without sanitary control. Eau sans contrôle sanitarie.')).toBe('Eau sans contrôle sanitaire.');
  });
  it('préserve les noms propres, chiffres et dates sans inventer d’informations', () => {
    expect(cleanPlaceText('The World of Banksy : 2,20 m, 18 ans et 2022.')).toBe('The World of Banksy : 2,20 m, 18 ans et 2022.');
  });
  it('produit une vraie sélection de phrases et conserve les conditions utiles à la visite', () => {
    const intro = 'Le musée présente des collections de peinture et de sculpture.';
    const history = 'Son histoire remonte au siècle dernier et témoigne de nombreuses transformations architecturales.';
    const condition = 'Visites pour les enfants de 6 à 12 ans, uniquement sur réservation.';
    const text = `${intro} ${history.repeat(12)} ${condition} L’eau de la fontaine est non potable.`;
    const summary = summarizePlaceText(text);
    expect(summary.length).toBeLessThanOrEqual(360);
    expect(summary).toContain(condition);
    expect(summary).toContain('non potable');
    expect(summary).toContain(intro);
    expect(summary).not.toContain(history.repeat(2));
    expect(summarizePlaceText(summary)).toBe(summary);
  });
  it('ne tronque pas les petits textes ni les valeurs décimales', () => {
    const text = 'Bassin de 12,5 m. Profondeur maximale : 1,30 m. Accès réservé aux enfants de 3 à 6 ans.';
    expect(summarizePlaceText(text)).toBe(text);
  });
});
