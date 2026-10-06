import { photoDataUrl } from "./photo-input";
import { distance, distanceLabel } from "./geo";
import { ChoiceSelect } from "./ChoiceSelect";
import { automaticPlaceName } from "./place-name";
import { useState, useRef, useEffect, useMemo, type FormEvent } from "react";
import { frenchHours, standardHours } from "./hours";
import {
  MapPin,
  Search,
  ArrowLeft,
  ChevronRight,
  Camera,
  Star,
  Trash2,
} from "lucide-react";
import { Modal } from "./Modal";
import {
  categories,
  singular,
  filterCategories,
  transitLabels,
  transitLetters,
  type TransitMode,
  type Place,
  type Category,
} from "./types";
import { searchAddress, saveContribution } from "./store";
import { LocationPicker } from "./LocationPicker";
import { groupEdits, changedPlaceFields } from "./group-edits";
import { PhotoPicker } from "./PhotoPicker";
import { PhotoViewer } from "./PhotoViewer";
import { photoBarycenter } from "./photo-location";
import type { PreparedPhoto } from "./photo-input";
import { websiteUrl } from "./place-rules";
export const equipmentByCategory: Record<Category, [string, string][]> = {
  other: [],
  health: [["wheelchair", "Accès PMR"]],
  child_activity: [
    ["wheelchair", "Accès PMR"],
    ["free", "Gratuit"],
  ],
  playground: [
    ["drinking_water", "Point d’eau potable"],
    ["toilets_available", "Toilettes"],
    ["fenced", "Jeux clôturés"],
    ["shade", "Ombre"],
    ["bench", "Bancs"],
    ["wheelchair", "Accès PMR"],
  ],
  toilet: [
    ["toilet_public", "Toilettes publiques"],
    ["changing_table", "Table à langer"],
    ["wheelchair", "Accès PMR"],
    ["free", "Gratuit"],
  ],
  water: [
    ["drinking_water", "Eau potable"],
    ["wheelchair", "Accès PMR"],
    ["shade", "Ombre"],
  ],
  transit: [
    ["wheelchair", "Accès PMR"],
    ["elevator", "Ascenseur"],
    ["bench", "Bancs"],
  ],
  baby_shop: [
    ["children_clothes", "Vêtements bébé / enfant"],
    ["baby_food", "Alimentation bébé / enfant"],
    ["wheelchair", "Accès PMR"],
    ["changing_table", "Table à langer"],
  ],
  food_shop: [
    ["organic", "Produits bio"],
    ["children_clothes", "Vêtements bébé / enfant"],
    ["baby_food", "Alimentation bébé / enfant"],
    ["wheelchair", "Accès PMR"],
    ["changing_table", "Table à langer"],
  ],
  changing_table: [
    ["changing_table", "Table à langer"],
    ["wheelchair", "Accès PMR"],
    ["free", "Gratuit"],
  ],
};
const fields = [
  "name",
  "category",
  "lat",
  "lon",
  "address",
  "city",
  "hours",
  "description",
  "website",
  "activity_type",
  "health_type",
  "shop_type",
  "pediatric",
  "organic",
  "toilet_public",
  "baby_food",
  "children_clothes",
  "age",
  "access",
  "transit_modes",
  "transit_lines",
  "toilets_available",
  "wheelchair",
  "changing_table",
  "drinking_water",
  "free",
  "fenced",
  "elevator",
  "shade",
  "shelter",
  "bench",
  "condition",
] as const;
export function PlaceForm({
  place,
  aerial,
  position,
  onClose,
  onSaved,
  onCommit,
  onDelete,
  existingPlaces = [],
  deleteLabel = "Supprimer le lieu",
}: {
  existingPlaces?: Place[];
  deleteLabel?: string;
  place?: Place;
  aerial: boolean;
  onDelete?: () => void;
  position: { lat: number; lon: number };
  onClose: () => void;
  onSaved: (id: string) => void;
  onCommit?: (payload: Partial<Place>) => Promise<void>;
}) {
  const initial = Object.fromEntries(
    fields.map((k) => [
      k,
      place?.[k] ??
        ([
          "pediatric",
          "organic",
  "toilet_public",
  "baby_food",
          "children_clothes",
          "toilets_available",
          "wheelchair",
          "changing_table",
          "drinking_water",
          "free",
          "fenced",
          "elevator",
          "shade",
          "shelter",
          "bench",
        ].includes(k)
          ? null
          : ""),
    ]),
  ) as Record<string, any>;
  const [d, setD] = useState<Record<string, any>>({
    ...initial,
    category:
      !onCommit && place?.category === "changing_table"
        ? "toilet"
        : place?.category || "other",
    transit_modes: place?.transit_modes || [],
    transit_lines: place?.transit_lines || [],
    lat: place?.lat ?? position.lat,
    lon: place?.lon ?? position.lon,
    condition: place?.condition || "unknown",
    access: onCommit ? place?.access || "unknown" :
      place?.access &&
      ["public", "private", "customers", "permissive"].includes(place.access)
        ? place.access
        : "unknown",
  });
  const [existingTarget, setExistingTarget] = useState<Place | null>(null);
  const nearby = useMemo(() => place ? [] : existingPlaces.filter(p => p.category === d.category && distance(p, {lat:Number(d.lat),lon:Number(d.lon)}) <= 120).sort((a,b)=>distance(a,d as Place)-distance(b,d as Place)).slice(0,5), [existingPlaces, place, d.category,d.lat,d.lon]);
  const originalValues = useRef(structuredClone(d));
  const [picking, setPicking] = useState(false);
  const [locationLabel, setLocationLabel] = useState(
    place ? "Position actuelle du lieu" : "",
  );
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [photos, setPhotos] = useState<PreparedPhoto[]>([]);
  const manualPosition = useRef(!!place);
  const [pickingPhotos, setPickingPhotos] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [step, setStep] = useState(place ? 2 : 1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<
    { label: string; lat: number; lon: number }[]
  >([]);
  const [addressQuery, setAddressQuery] = useState("");
  const [addressStatus, setAddressStatus] = useState("");
  useEffect(() => {
    if (addressQuery.trim().length < 3) { setResults([]); setAddressStatus(""); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setAddressStatus("Recherche…");
      void searchAddress(addressQuery, controller.signal).then(({ results }) => {
        if (controller.signal.aborted) return;
        setResults(results);
        setAddressStatus(results.length ? "Sélectionnez une adresse pour positionner le lieu." : "Aucune adresse trouvée. Vous pouvez placer le point sur la carte.");
      }).catch(() => { if (!controller.signal.aborted) setAddressStatus("Recherche indisponible. Utilisez la carte."); });
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [addressQuery]);
  const set = (k: string, v: unknown) => setD((x) => ({ ...x, [k]: v }));
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!existingTarget && d.category === "other" && !(onCommit && place?.category === "other")) {
      setError("Choisissez une catégorie pour ce lieu.");
      if (!place) setStep(1);
      return;
    }
    if (
      !place && !existingTarget &&
      photos.length &&
      !photoBarycenter(photos) &&
      !manualPosition.current
    ) {
      setError(
        "Ces photos n’ont pas de position GPS. Choisissez l’emplacement sur la carte.",
      );
      setStep(1);
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (comment.trim() && stars === 0)
        throw new Error("Choisissez une note pour accompagner votre avis.");
      if (existingTarget) {
        await saveContribution(existingTarget.id, {}, existingTarget.version, stars ? {stars,text:comment.trim()} : undefined, photos, []);
        onSaved(existingTarget.id); return;
      }
      if (onCommit) {
        const changed = changedPlaceFields(originalValues.current, d) as Partial<Place>;
        if (!Object.keys(changed).length) throw new Error("Modifiez au moins un champ avant d’enregistrer la correction.");
        if (Object.hasOwn(changed, "website")) {
          if (changed.website && !websiteUrl(changed.website)) throw new Error("Indiquez un site valide, par exemple exemple.fr.");
          changed.website = websiteUrl(changed.website) || "";
        }
        if (Object.hasOwn(changed, "name")) changed.name = String(changed.name || "").trim() || singular[d.category as Category];
        await onCommit(changed);
        onSaved(place!.id);
        return;
      }
      if (d.website && !websiteUrl(d.website))
        throw new Error("Indiquez un site valide, par exemple exemple.fr.");
      const payload = {
        ...d,
        website: websiteUrl(d.website) || "",
        name: !place
          ? await automaticPlaceName(d as Place)
          : String(d.name || "").trim() || singular[d.category as Category],
      };
      const savedId = place?.id || "c_" + crypto.randomUUID();
      await saveContribution(
        savedId,
        payload,
        place?.version,
        stars ? { stars, text: comment.trim() } : undefined,
        photos.map(({ base64, caption }) => ({ base64, caption })),
        place ? groupEdits(place, originalValues.current, d) : undefined,
      );
      onSaved(savedId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function search() {
    setError("");
    try {
      const r = await searchAddress(d.address);
      setResults(r.results);
      if (!r.results.length)
        setError("Aucune adresse trouvée dans le périmètre.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function updatePhotos(next: PreparedPhoto[]) {
    setPhotos(next);
    if (place || manualPosition.current) return;
    const center = photoBarycenter(next);
    if (center) {
      setD((previous) => ({ ...previous, lat: center.lat, lon: center.lon }));
      setLocationLabel(
        `Position calculée à partir de ${center.count} photo${center.count > 1 ? "s" : ""}`,
      );
      setError("");
    } else {
      setD((previous) => ({ ...previous, ...position }));
      setLocationLabel(
        next.length
          ? "Photos sans GPS · choisissez un point sur la carte"
          : "",
      );
    }
  }
  const locationFields = (
    <>
      <label>
        Nom du lieu · facultatif
        <input
          minLength={onCommit ? 1 : 2}
          maxLength={160}
          value={d.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Automatique : type de lieu et rue la plus proche"
        />
      </label>
      <label>
        Catégorie · obligatoire
        <ChoiceSelect
          label="Catégorie"
          value={d.category}
          placeholder="Choisir une catégorie"
          onChange={(value) => set("category", value)}
          options={[...filterCategories.map((k) => ({value: k,label: categories[k]})), ...(onCommit && !filterCategories.includes(d.category) ? [{value:d.category,label:categories[d.category as Category]}] : [])]}
        />
      </label>
      {d.category === "transit" && (
        <div
          className="chip-group transit-chips"
          aria-label="Type de transport"
        >
          {(Object.keys(transitLabels) as TransitMode[]).map((m) => (
            <button
              type="button"
              key={m}
              aria-pressed={d.transit_modes.includes(m)}
              onClick={() =>
                set(
                  "transit_modes",
                  d.transit_modes.includes(m)
                    ? d.transit_modes.filter((v: string) => v !== m)
                    : [...d.transit_modes, m],
                )
              }
            >
              <b>{transitLetters[m]}</b>{" "}
              {m === "metro" ? "Métro" : transitLabels[m]}
            </button>
          ))}
        </div>
      )}
      {d.category === "health" && (
        <label>
          Type de lieu
          <ChoiceSelect
            label="Type de lieu"
            value={
              !onCommit && d.health_type === "doctor" && d.pediatric !== true
                ? ""
                : d.health_type || ""
            }
            onChange={(value) =>
              setD((x) => ({
                ...x,
                health_type: value,
                pediatric: onCommit ? x.pediatric :
                  value === "doctor"
                    ? true
                    : value === "emergency"
                      ? null
                      : x.pediatric,
              }))
            }
            options={[
              { value: "", label: "Santé" },
              { value: "doctor", label: onCommit && d.pediatric !== true ? "Médecin" : "Pédiatre" },
              { value: "pharmacy", label: "Pharmacie" },
              { value: "emergency", label: "Urgences" },
            ]}
          />
        </label>
      )}
      {d.category === "health" && d.health_type === "emergency" && (
        <label>
          Urgences pédiatriques · facultatif
          <ChoiceSelect
            label="Urgences pédiatriques"
            value={
              d.pediatric === true
                ? "yes"
                : d.pediatric === false
                  ? "no"
                  : "unknown"
            }
            onChange={(value) =>
              set("pediatric", value === "unknown" ? null : value === "yes")
            }
            options={[
              { value: "yes", label: "Oui" },
              { value: "no", label: "Non" },
              { value: "unknown", label: "?" },
            ]}
          />
        </label>
      )}
      {d.category === "child_activity" && (
        <label>
          Activité · facultatif
          <input
            value={d.activity_type}
            maxLength={100}
            onChange={(e) => set("activity_type", e.target.value)}
            placeholder="Théâtre, bébé gym, bébé nageur…"
          />
        </label>
      )}
      <label>
        Adresse · facultatif
        <div className="input-action">
          <input
            value={d.address}
            onChange={(e) => { set("address", e.target.value); setAddressQuery(e.target.value); }}
            autoComplete="off"
            aria-describedby="address-status"
            placeholder="Rechercher une adresse"
          />
          <button
            type="button"
            className="icon-button"
            aria-label="Rechercher l’adresse du lieu"
            disabled={d.address.length < 3}
            onClick={search}
          >
            <Search />
          </button>
        </div>
      </label>
      {onCommit && <>
        {place?.shop_type && <label>Type de commerce<input value={d.shop_type} maxLength={100} onChange={e=>set("shop_type",e.target.value)}/></label>}
        <label>Commune<input value={d.city} maxLength={100} onChange={e=>set("city", e.target.value)}/></label>
        <label>Accès<ChoiceSelect label="Accès" value={d.access} onChange={value=>set("access",value)} options={[
          {value:"unknown",label:"Non renseigné"}, {value:"public",label:"Public"}, {value:"private",label:"Privé"}, {value:"customers",label:"Réservé à la clientèle"}, {value:"permissive",label:"Accès autorisé"},
          ...(!["unknown","public","private","customers","permissive"].includes(d.access) ? [{value:d.access,label:d.access}] : [])
        ]}/></label>
        <label>État<ChoiceSelect label="État" value={d.condition} onChange={value=>set("condition",value)} options={[
          {value:"unknown",label:"Non renseigné"}, {value:"open",label:"Ouvert"}, {value:"temporary_closed",label:"Fermeture temporaire"}, {value:"closed",label:"Fermé"}, {value:"unavailable",label:"Indisponible"},
          ...(!["unknown","open","temporary_closed","closed","unavailable"].includes(d.condition) ? [{value:d.condition,label:d.condition}] : [])
        ]}/></label>
        {d.category === "transit" && <label>Lignes<input value={d.transit_lines.join(", ")} onChange={e=>set("transit_lines",e.target.value.split(",").map(v=>v.trim()).filter(Boolean))}/></label>}
      </>}
      {addressStatus && <small id="address-status" role="status">{addressStatus}</small>}
      {results.map((r) => (
        <button
          type="button"
          key={r.label}
          className="result"
          onClick={() => {
            setD((x) => ({ ...x, address: r.label, lat: r.lat, lon: r.lon }));
            setAddressQuery("");
            setAddressStatus("");
            setResults([]);
            manualPosition.current = true;
            setLocationLabel("Adresse sélectionnée");
          }}
        >
          <MapPin size={18} />
          {r.label}
        </button>
      ))}
      {locationLabel && <p className="muted location-status" role="status">{locationLabel}</p>}
      <button
        type="button"
        className="secondary"
        onClick={() => setPicking(true)}
      >
        <MapPin size={18} /> Positionner un point sur la carte
      </button>
    </>
  );
  const renderQuestions = (entries: [string, string][]) => (
    <>
      {entries.map(([k, label]) => (
        <div className="quick-question" key={k}>
          <span>{label}</span>
          <div className="quick-options" role="group" aria-label={label}>
            {[
              [true, "Oui"],
              [false, "Non"],
              [null, "?"],
            ].map(([value, text]) => (
              <button
                type="button"
                key={String(text)}
                aria-label={text === "?" ? "Non renseigné" : String(text)}
                data-answer={String(value)}
                aria-pressed={d[k] === value}
                className={d[k] === value ? "active" : ""}
                onClick={() => set(k, value)}
              >
                {String(text)}
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  );
  const photoFields = onCommit ? null : (
    <section className="contribution-photos">
      {!place && <h3>Commencer avec des photos</h3>}
      <div className="photo-drafts">
        {photos.map((photo, index) => (
          <div key={index}>
            <button
              type="button"
              className="photo-preview"
              aria-label={`Ouvrir la photo ${index + 1}`}
              onClick={() => setPreviewIndex(index)}
            >
              <img
                src={photoDataUrl(photo.base64)}
                alt={`Photo à ajouter ${index + 1}`}
              />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={`Retirer la photo ${index + 1}`}
              onClick={() => updatePhotos(photos.filter((_, i) => i !== index))}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="secondary"
        disabled={busy}
        onClick={() => setPickingPhotos(true)}
      >
        <Camera size={18} /> Ajouter des photos
      </button>
      {pickingPhotos && (
        <PhotoPicker
          locatePhotos={!place}
          onClose={() => setPickingPhotos(false)}
          onAdd={async (items) => {
            updatePhotos([...photos, ...items]);
            setPickingPhotos(false);
          }}
        />
      )}
      {previewIndex !== null && (
        <PhotoViewer
          placeName={d.name}
          photos={photos.map((p) => ({
            url: photoDataUrl(p.base64),
            caption: p.caption,
          }))}
          initialIndex={previewIndex}
          onClose={() => setPreviewIndex(null)}
        />
      )}
    </section>
  );
  if (picking)
    return (
      <LocationPicker
        position={{ lat: Number(d.lat), lon: Number(d.lon) }}
        aerial={aerial}
        onCancel={() => setPicking(false)}
        onConfirm={(point) => {
          setD((previous) => ({ ...previous, ...point }));
          manualPosition.current = true;
          setLocationLabel("Position choisie sur la carte");
          setPicking(false);
        }}
      />
    );
  return (
    <Modal
      title={place ? "Modifier le lieu" : "Ajouter un lieu"}
      onClose={onClose}
      wide={!place}
      className={place ? "edit-dialog" : ""}
    >
      {!place && (
        <div className="step-progress">
          <span className={step === 1 ? "active" : ""}>
            1 · Photos et emplacement
          </span>
          <span className={step === 2 ? "active" : ""}>
            2 · Précisions facultatives
          </span>
        </div>
      )}
      {!place && !existingTarget && nearby.length > 0 && <section className="duplicate-suggestions">
        <strong>Un lieu similaire existe à proximité</strong>
        <p className="muted">Vérifiez les fiches ci-dessous. Vous pouvez y ajouter vos photos et votre avis, ou poursuivre la création si c’est un autre lieu. Aucune fusion automatique.</p>
        {nearby.map(p=><button type="button" className="secondary" key={p.id} onClick={()=>setExistingTarget(p)}>{p.name} · {distanceLabel(distance(p,d as Place))} — Utiliser ce lieu</button>)}
      </section>}
      <form onSubmit={save} className={place ? "form compact-edit" : "form place-create"}>
        {existingTarget ? <section>
          <h3>{existingTarget.name}</h3><p>Vos photos et votre avis seront ajoutés à cette fiche, sans créer de lieu.</p>
          <button type="button" className="text-button" onClick={()=>setExistingTarget(null)}>C’est un autre lieu</button>
          {photoFields}
          <div className="rating-input" role="group" aria-label="Note sur cinq étoiles">{[1,2,3,4,5].map(n=><button key={n} type="button" aria-label={`${n} étoiles`} aria-pressed={stars===n} onClick={()=>setStars(stars===n?0:n)}><Star fill={n<=stars?"currentColor":"none"}/></button>)}</div>
          <label>Votre avis<textarea value={comment} onChange={e=>setComment(e.target.value)} maxLength={3000}/></label>
        </section> : <>
        {place && (
          <>
            <p className="edit-place-name">{d.name}</p>
            {photoFields}
          </>
        )}
        {step === 1 ? (
          <>
            {photoFields}
            <p className="muted">
              L’emplacement est calculé avec le GPS des photos. Choisissez une
              catégorie ; les autres informations sont facultatives.
            </p>
            {locationFields}
          </>
        ) : (
          <>
            {place ? (
              <details
                className="optional"
                open={onCommit || d.category === "other" ? true : undefined}
              >
                <summary>Nom et emplacement</summary>
                <div className="form compact-location">{locationFields}</div>
              </details>
            ) : (
              <div>
                <h2>{d.name || singular[d.category as Category]}</h2>
                <small>Répondez seulement à ce que vous savez.</small>
              </div>
            )}
            {d.category === "water" && (
              <small>
                Le point apparaît sur la carte uniquement si l’eau est confirmée
                potable.
              </small>
            )}
            {d.category === "transit" && (
              <small>
                Métro affiché uniquement avec accès PMR confirmé. Tram et bus :
                accès PMR précisé lorsqu’il est connu.
              </small>
            )}
            {place ? (
              <details className="optional" open={onCommit ? true : undefined}>
                <summary>Équipements</summary>
                <div className="edit-equipment">
                  {renderQuestions(
                    (onCommit ? [...new Map(Object.values(equipmentByCategory).flat().concat([["shelter", "Abri"], ["pediatric", "Accueil pédiatrique"]]).filter(([key]) => key !== "free" && (equipmentByCategory[d.category as Category].some(([k]) => k === key) || (key === "pediatric" && d.category === "health") || place?.[key as keyof Place] != null)).map(entry => [entry[0], entry] as const)).values()] : equipmentByCategory[d.category as Category].filter(([key]) => key !== "free")),
                  )}
                </div>
              </details>
            ) : (
              renderQuestions(
                equipmentByCategory[d.category as Category].filter(
                  ([key]) => key !== "free",
                ),
              )
            )}
            {!place && (["playground", "child_activity"].includes(d.category) || (onCommit && d.age)) && (
              <label>
                Âge conseillé
                <input
                  value={d.age}
                  maxLength={80}
                  onChange={(e) => set("age", e.target.value)}
                  placeholder="Facultatif · ex. 2–6 ans"
                />
              </label>
            )}
            <details className="optional" open={onCommit ? true : undefined}>
              <summary>
                {place
                  ? ["playground", "child_activity"].includes(d.category)
                    ? "Âges, horaires et précisions"
                    : "Horaires et précisions"
                  : "Horaires et précisions · facultatif"}
              </summary>
              <div className="form">
                <div className="quick-question">
                  <span>Tarif</span>
                  <div
                    className="quick-options"
                    role="group"
                    aria-label="Tarif"
                  >
                    {[
                      [true, "Gratuit"],
                      [false, "Payant"],
                      [null, "?"],
                    ].map(([value, label]) => (
                      <button
                        type="button"
                        key={String(label)}
                        data-answer={String(value)}
                        aria-pressed={d.free === value}
                        className={d.free === value ? "active" : ""}
                        onClick={() => set("free", value)}
                      >
                        {String(label)}
                      </button>
                    ))}
                  </div>
                </div>
                {place && (["playground", "child_activity"].includes(d.category) || (onCommit && d.age)) && (
                  <label>
                    Âge conseillé
                    <input
                      value={d.age}
                      maxLength={80}
                      onChange={(e) => set("age", e.target.value)}
                      placeholder="Ex. 2–6 ans"
                    />
                  </label>
                )}
                <label>
                  Horaires
                  <input
                    value={frenchHours(d.hours)}
                    maxLength={300}
                    onChange={(e) =>
                      set("hours", standardHours(e.target.value))
                    }
                    placeholder="Lu-Ve 08:00-20:00 ou 24/7"
                  />
                </label>
                <label>
                  Site web · facultatif
                  <input
                    type="text"
                    inputMode="url"
                    autoCapitalize="none"
                    maxLength={1000}
                    value={d.website || ""}
                    placeholder="exemple.fr"
                    onChange={(e) => set("website", e.target.value)}
                  />
                </label>
                <label>
                  {d.category === "child_activity"
                    ? "Petit descriptif"
                    : "Informations utiles"}
                  <textarea
                    aria-label={d.category === "child_activity" ? "Petit descriptif" : "Informations utiles"}
                    value={d.description}
                    maxLength={2000}
                    onChange={(e) => set("description", e.target.value)}
                    rows={3}
                    placeholder="Entrée, marches, détails sur l’accès…"
                  />
                </label>
              </div>
            </details>
            {onCommit ? null : place ? (
              <details className="optional">
                <summary>Ajouter un avis</summary>{" "}
                <section className="contribution-review">
                  <h3>Votre avis · facultatif</h3>
                  <div
                    className="rating-input"
                    role="group"
                    aria-label="Note sur cinq étoiles"
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        type="button"
                        key={n}
                        aria-pressed={stars === n}
                        aria-label={`${n} étoile${n > 1 ? "s" : ""}`}
                        onClick={() => setStars(stars === n ? 0 : n)}
                      >
                        <Star
                          size={30}
                          fill={n <= stars ? "currentColor" : "none"}
                        />
                      </button>
                    ))}
                  </div>
                  <label>
                    Votre expérience
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      maxLength={3000}
                      rows={2}
                      placeholder="Accès, propreté, équipements…"
                    />
                  </label>
                </section>
              </details>
            ) : (
              <section className="contribution-review">
                <h3>Votre avis · facultatif</h3>
                <div
                  className="rating-input"
                  role="group"
                  aria-label="Note sur cinq étoiles"
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      type="button"
                      key={n}
                      aria-pressed={stars === n}
                      aria-label={`${n} étoile${n > 1 ? "s" : ""}`}
                      onClick={() => setStars(stars === n ? 0 : n)}
                    >
                      <Star
                        size={30}
                        fill={n <= stars ? "currentColor" : "none"}
                      />
                    </button>
                  ))}
                </div>
                <label>
                  Votre expérience
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    maxLength={3000}
                    rows={2}
                    placeholder="Accès, propreté, équipements…"
                  />
                </label>
              </section>
            )}
          </>
        )}
        </>}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="step-actions">
          {!place && !existingTarget && step === 2 && (
            <button
              type="button"
              className="icon-button"
              aria-label="Étape précédente"
              onClick={() => setStep(1)}
            >
              <ArrowLeft />
            </button>
          )}
          {!place && !existingTarget && step === 1 && (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                if (d.category === "other")
                  setError("Choisissez une catégorie pour ce lieu.");
                else {
                  setError("");
                  setStep(2);
                }
              }}
            >
              Ajouter des précisions
            </button>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
        {onDelete && (
          <button
            type="button"
            className="text-button danger delete-place-action"
            onClick={onDelete}
          >
            <Trash2 size={17} /> {deleteLabel}
          </button>
        )}
      </form>
    </Modal>
  );
}
