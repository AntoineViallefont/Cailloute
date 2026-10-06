import { Fragment } from 'react';
import { equipmentByCategory } from './PlaceForm';
import { frenchLabel } from './french-labels';
import { frenchHours } from './hours';
import { placeLabel } from './place-rules';
import type { Place } from './types';

// Lecture de la fiche reçue : aucun enrichissement ni lecture supplémentaire.
export function ReportedPlace({place}: {place: Place}) {
  const equipment = [...new Map(Object.values(equipmentByCategory).flat().concat([
    ['shelter', 'Abri'], ['pediatric', 'Accueil pédiatrique'],
  ]).map(entry => [entry[0], entry] as const)).values()];
  const rows: [string, string][] = [
    ['Catégorie', placeLabel(place) || 'Non renseignée'],
    ['Adresse', place.address || 'Non renseignée'],
    ['Commune', place.city || 'Non renseignée'],
    ['Position', `${place.lat}, ${place.lon}`],
    ['Informations utiles', place.description || 'Non renseignées'],
    ['Horaires', frenchHours(place.hours) || 'Non renseignés'],
    ['Âges', place.age || 'Non renseignés'],
    ['Accès', frenchLabel(place.access) || 'Non renseigné'],
    ['Tarif', place.free == null ? 'Non renseigné' : place.free ? 'Gratuit' : 'Payant'],
    ['État', frenchLabel(place.condition || 'unknown')],
    ...(place.website ? [['Site web', place.website] as [string,string]] : []),
    ...(place.shop_type ? [['Type de commerce', frenchLabel(place.shop_type)] as [string,string]] : []),
    ...(place.activity_type ? [['Activité', frenchLabel(place.activity_type)] as [string,string]] : []),
    ...(place.transit_lines?.length ? [['Lignes', place.transit_lines.join(', ')] as [string,string]] : []),
    ...equipment.filter(([key]) => key !== 'free' && place[key as keyof Place] != null)
      .map(([key,label]):[string,string] => [label, place[key as keyof Place] ? 'Oui' : 'Non']),
  ];
  return <dl className="reported-place-fields">{rows.map(([label,value]) => <Fragment key={label}>
    <dt>{label}</dt><dd>{value}</dd>
  </Fragment>)}</dl>;
}
