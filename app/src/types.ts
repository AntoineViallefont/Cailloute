export type Category =
  | "other"
  | "health"
  | "child_activity"
  | "playground"
  | "toilet"
  | "water"
  | "baby_shop"
  | "food_shop"
  | "transit"
  | "changing_table";
export type TransitMode = "metro" | "tram" | "bus" | "train" | "ferry" | "cable";
export const transitLabels = { metro: "Métro", tram: "Tram", bus: "Bus / Car", train: "Train", ferry: "Bateau", cable: "Câble / funiculaire" };
export const transitLetters = { metro: "M", tram: "T", bus: "B", train: "R", ferry: "N", cable: "F" };
export type Tri = boolean | null;
export interface Source {
  key: string;
  name: string;
  url: string;
  license: string;
  retrieved_at: string;
}
export interface Place {
  personal_edited?: boolean;
  catalog_sources?: string[];
  catalog_version?: string;
  catalog_group?: { id: string; kind?: "nearby" | "station" };
  id: string;
  version: number;
  name: string;
  category: Category;
  lat: number;
  lon: number;
  address: string;
  city: string;
  hours: string;
  description: string;
  website?: string;
  activity_type?: string;
  health_type?: "doctor" | "pharmacy" | "emergency" | "";
  pediatric?: Tri;
  baby_food?: Tri;
  organic?: Tri;
  toilet_public?: Tri;
  photo_count?: number;
  children_clothes?: Tri;
  shop_type?: string;
  information_validated?: boolean;
  validated_at?: string;
  validation_changed_at?: string;
  age: string;
  access: string;
  transit_modes?: TransitMode[];
  transit_lines?: string[];
  toilets_available?: Tri;
  merged_members?: Place[];
  group_kind?: "station" | "nearby";
  merged_conflicts?: string[];
  related_names?: string[];
  hours_variants?: string[];
  asset_ref?: string;
  wheelchair: Tri;
  changing_table: Tri;
  drinking_water: Tri;
  free: Tri;
  fenced: Tri;
  elevator: Tri;
  shade?: Tri;
  shelter?: Tri;
  bench?: Tri;
  condition?: string;
  condition_observed_at?: string;
  sources: Source[];
  rating: number | null;
  review_count: number;
  location_kind?: string;
  verified_at?: string;
  verified_by?: string;
  withdrawn?: boolean;
  deleted?: boolean;
  redirect?: string;
  license_verified?: boolean;
  community?: boolean;
}
export interface Review {
  place_id?: string;
  id: string;
  user_id: string;
  author: string;
  stars: number;
  text: string;
  created: string;
  updated: string;
  votes: number;
  voters: string[];
  downvotes?: number;
  downvoters?: string[];
}
export interface Photo {
  author?: string;
  place_id?: string;
  id: string;
  user_id: string;
  url: string;
  caption: string;
  created: string;
}
export interface Detail extends Place {
  reviews: Review[];
  photos: Photo[];
}
export interface User {
  id: string;
  username: string;
  role: string;
  terms_version?: string;
  moderation?: { can_contribute: boolean; action: string | null; until: string | null; reason: string; decision_id: string | null };
}
export interface Op {
  id: string;
  kind: string;
  place_id: string;
  base_version?: number;
  payload: Record<string, unknown>;
}
export interface Pending {
  id: string;
  operation: Op;
  owner: string;
  server: string;
  created: number;
  error?: string;
  status: "pending" | "error";
}
export interface Origin {
  lat: number;
  lon: number;
  label: string;
  chosen: boolean;
}
export const categories: Record<Category, string> = {
  health: "Santé",
  child_activity: "Activités",
  playground: "Aires de jeux",
  toilet: "Toilettes",
  water: "Points d’eau",
  baby_shop: "Magasins",
  food_shop: "Alimentation",
  transit: "Transports",
  changing_table: "Tables à langer",
  other: "Lieu",
};
export const filterCategories = Object.keys(categories).filter(
  (k) => k !== "changing_table" && k !== "other",
) as Category[];
export const singular: Record<Category, string> = {
  health: "Santé",
  child_activity: "Activité enfant",
  playground: "Aire de jeux",
  toilet: "Toilettes",
  water: "Point d’eau",
  baby_shop: "Magasin bébé / enfant",
  food_shop: "Alimentation",
  transit: "Transport",
  changing_table: "Table à langer",
  other: "Lieu",
};
export const colors: Record<Category, string> = {
  health: "#c33254",
  child_activity: "#087f8c",
  playground: "#00895e",
  toilet: "#e2b500",
  water: "#0866f5",
  baby_shop: "#b03a91",
  food_shop: "#7650c0",
  transit: "#191919",
  changing_table: "#e2b500",
  other: "#64748b",
};
export const LYON: Origin = {
  lat: 45.7578,
  lon: 4.832,
  label: "Lyon",
  chosen: false,
};

export const categoryInk = (category: Category) =>
  ["toilet", "changing_table"].includes(category) ? "#292200" : "#ffffff";
