import {it,expect} from 'vitest';
import {outsideSearchAnchor} from './search-zone';
const anchor={lat:45.75,lon:4.83};
it('un petit déplacement ou un zoom gardant le GPS visible ne propose pas de zone',()=>{
 expect(outsideSearchAnchor({...anchor,bounds:{south:45.74,north:45.76,west:4.82,east:4.84}},anchor)).toBe(false);
});
it('le bouton apparaît hors du point GPS ou de la recherche et disparaît au retour',()=>{
 expect(outsideSearchAnchor({lat:45.78,lon:4.83,bounds:{south:45.77,north:45.79,west:4.82,east:4.84}},anchor)).toBe(true);
 expect(outsideSearchAnchor({...anchor,bounds:{south:45.749,north:45.751,west:4.829,east:4.831}},anchor)).toBe(false);
});
it('une zone appliquée devient le nouveau repère sans dépendre des filtres',()=>{
 const next={lat:46,lon:5};expect(outsideSearchAnchor({...next,bounds:{south:45.99,north:46.01,west:4.99,east:5.01}},next)).toBe(false);
});
