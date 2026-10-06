import { expect, it } from "vitest";
import {
  routeDistance,
  routesForStop,
  type TransitRoute,
} from "./transit-routes";
import type { Place } from "./types";
const route: TransitRoute = {
  id: "metro:B",
  mode: "metro",
  line: "B",
  color: "#0075BF",
  paths: [
    [
      [45.75, 4.8],
      [45.75, 4.9],
    ],
  ],
  destinations: [],
};
const place = {
  category: "transit",
  transit_modes: ["metro"],
  transit_lines: ["B"],
  lat: 45.75,
  lon: 4.85,
} as Place;
it("mesure la proximité du segment entre deux sommets du tracé", () => {
  expect(routeDistance(route, place)).toBeLessThan(1);
  expect(routesForStop([route], place)).toEqual([route]);
});
it("écarte les lignes éloignées et les homonymes d’un autre mode", () => {
  expect(routesForStop([route], { ...place, lat: 45.8 })).toEqual([]);
  expect(routesForStop([route], { ...place, transit_modes: ["bus"] })).toEqual(
    [],
  );
  expect(routesForStop([route], { ...place, transit_lines: ["A"] })).toEqual(
    [],
  );
});

it("ne mélange pas des lignes homonymes de réseaux différents",()=>{
 const route={id:'national',resourceId:'network-a',line:'1',mode:'bus',paths:[[[45.7,4.8],[45.71,4.8]]],color:'#000',destinations:[]} as TransitRoute;
 const place={category:'transit',lat:45.705,lon:4.8,transit_lines:['1'],transit_modes:['bus'],sources:[{key:'gtfs:network-b:stop'}]} as Place;
 expect(routesForStop([route],place)).toEqual([]);
 expect(routesForStop([route],{...place,sources:[{key:'gtfs:network-a:stop'}] as Place['sources']})).toEqual([route]);
});
