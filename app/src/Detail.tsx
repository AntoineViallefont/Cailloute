import { protectedPlace } from "./place-rules";
import { summarizePlaceText } from "./place-text.mjs";
import { reviewDate, reviewTime } from "./latest-reviews";
import { uniquePhotos } from "./unique-photos";
import { placeSourceIds } from "./canonical-data";
import { RewardIcon } from './RewardIcon';
import { ChoiceSelect } from "./ChoiceSelect";
import { useFreeAccount } from "./useFreeAccount";
import { isHelpfulReview } from "./review-rewards";
import {type PreviewState} from "./free-sync";
import {loadOpenedDetail} from './open-detail';
import { applyFreeChanges,watchAdminDetail } from "./free-sync";
import { offlineMap } from "./map-cache";
import { freeCollaborationEnabled, getFreeSession, reportFreeReview, voteFreeReview } from "./free-cloud";
import { AuthorActions, useBlockedPeople } from "./BlockedUsers";
import { reportReasons } from "./report-reasons";
import { frenchLabel } from "./french-labels";
import { NearbyPrompt } from "./NearbyPrompt";
import { useNearbyPrompt } from "./useNearbyPrompt";
import { PhotoPicker } from "./PhotoPicker";
import { usePlaceSheet } from "./usePlaceSheet";
import { useTransitRoutes } from "./TransitRoutes";
import { GoogleMapsLink } from "./GoogleMapsLink";
import { useConfirmation } from "./Confirmation";
import { categoryInk } from "./types";
import { useEffect, useRef, useState } from "react";
import { displayHours } from "./hours";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Map as MapIcon,
  Heart,
  Star,
  Navigation,
  Footprints,
  Bike,
  TrainFront,
  Car,
  MapPin,
  Clock,
  Pencil,
  ThumbsUp,
  ThumbsDown,
  Flag,
  Trash2,
  ExternalLink,
  CircleCheck,
  CircleX,
} from "lucide-react";
import { PhotoViewer } from "./PhotoViewer";
import { PhotoCredit } from './PhotoCredit';
import { photoCredit } from './photo-credit';
import { AccuracyIcon } from "./AccuracyIcon";
import { personalMode, PERSONAL_ID } from "./personal";
import { Modal } from "./Modal";
import { PlaceForm, equipmentByCategory } from "./PlaceForm";
import {
  db,
  getGroupedDetail,
  enqueue,
  favorite,
  user,
  sync,
  photoUrl,
  validateInformation,
  addPhotos,
  api,
} from "./store";
import { directions, distance, distanceLabel, isOpen } from "./geo";
import { placeLabel, websiteUrl } from "./place-rules";
import { NavigationChooser } from "./NavigationChooser";
import { PlaceSymbol } from "./MapView";
import {
  singular,
  colors,
  type Place,
  type Detail as DetailType,
  type Origin,
} from "./types";
const date = (v: string) =>
  new Date(v).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
export function Detail({
  place,
  aerial,
  origin,
  pmr,
  onClose,
  onShowMap,
  onLogin,
  toast,
}: {
  place: Place;
  aerial: boolean;
  origin: Origin;
  pmr: boolean;
  onClose: () => void;
  onShowMap: (place: Place) => void;
  onLogin: () => void;
  toast: (s: string) => void;
}) {
  const sheet = usePlaceSheet(onClose);
  const { ask, confirmation } = useConfirmation();
  const [d, setD] = useState<DetailType>({ ...place, reviews: [], photos: [] });
  const [detailLoading,setDetailLoading]=useState(false),[detailError,setDetailError]=useState(''),[detailOffline,setDetailOffline]=useState(offlineMap);
  useEffect(()=>{
    let active=true;
    const update=()=>{setDetailOffline(offlineMap());setDetailError('');setDetailLoading(!offlineMap());
      void loadOpenedDetail(place.id).then(()=>getGroupedDetail(place)).then(result=>{if(active)setD(result);}).catch(error=>{if(active)setDetailError((error as Error).message||'Chargement de la fiche interrompu.');}).finally(()=>{if(active)setDetailLoading(false);});};
    update();window.addEventListener('map-mode',update);window.addEventListener('online',update);window.addEventListener('offline',update);
    return ()=>{active=false;window.removeEventListener('map-mode',update);window.removeEventListener('online',update);window.removeEventListener('offline',update);};
  },[place.id]);
  const transit = useTransitRoutes(d);
  const reviewsHeading = useRef<HTMLHeadingElement>(null);
  const ownReviewElement = useRef<HTMLElement>(null);
  const [sort, setSort] = useState<"relevant" | "recent">("relevant");
  const [modal, setModal] = useState("");
  const [photoIndex, setPhotoIndex] = useState(0);
  const previewState=useLiveQuery(()=>db.meta.get(`free-preview-page:${d.id}`),[d.id]);
  const linkedSources=useLiveQuery(()=>db.meta.get(`detail-sources:${d.id}`),[d.id]);
  const [error, setError] = useState("");
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");
  const [reason, setReason] = useState("");
  const [reportCategory, setReportCategory] = useState("other");
  const blockedPeople = useBlockedPeople();
  const blocked = new Set(personalMode ? [] : blockedPeople.map(p => p.id));
  const visiblePhotos = uniquePhotos(d.photos.filter(p => !blocked.has(p.user_id)));
  const [reportTarget, setReportTarget] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const nearby = useNearbyPrompt(place, modal === "" && !confirmation && !busy);
  const memberIds = placeSourceIds(d);
  const fav = useLiveQuery(
    () => db.favorites.where("id").anyOf(memberIds).first(),
    [memberIds.join(",")],
  );
  const freeAccount = useFreeAccount();
  const pending = useLiveQuery(async () => freeCollaborationEnabled ? (await db.freeQueue.toArray()).filter(q => q.owner === freeAccount?.uid) : db.queue.toArray(), [freeAccount?.uid]) || [];
  useEffect(()=>{
    if(!freeAccount?.isAdmin)return;
    let stop=()=>{};
    const update=()=>{stop();stop=offlineMap() || document.visibilityState==='hidden'?()=>{}:watchAdminDetail(d.id);};
    update();
    window.addEventListener('map-mode',update);window.addEventListener('online',update);window.addEventListener('offline',update);
    document.addEventListener('visibilitychange',update);
    return ()=>{stop();window.removeEventListener('map-mode',update);window.removeEventListener('online',update);window.removeEventListener('offline',update);document.removeEventListener('visibilitychange',update);};
  },[d.id,freeAccount?.uid,freeAccount?.isAdmin,JSON.stringify(linkedSources?.value)]);
  const canContribute=freeCollaborationEnabled ? !!freeAccount : personalMode || !!user;
  const actorId = personalMode ? freeAccount?.uid || PERSONAL_ID : user?.id;
  const canDelete = canContribute;
  const [deletionReason, setDeletionReason] = useState("");
  const own = d.reviews.find((r) => personalMode && r.user_id === PERSONAL_ID)
    || d.reviews.find((r) => r.user_id === actorId);
  const refresh = () => getGroupedDetail(place, sort).then(setD);
  useEffect(() => {
    let active=true, running=false, again=false;
    const update=async()=>{
      if(running){again=true;return;}
      running=true;
      do {
        again=false;
        try {const result=await getGroupedDetail(place,sort);if(active)setD(result);} catch { /* La fiche locale reste visible. */ }
      } while(active&&again);
      running=false;
    };
    void update();
    window.addEventListener("cailloute",update);
    return ()=>{active=false;window.removeEventListener("cailloute",update);};
  }, [place.id,sort,memberIds.join(",")]);
  const open = isOpen(d);
  async function act(kind: string, payload: Record<string, unknown>) {
    if ((!personalMode || (kind === "report.create" && !freeCollaborationEnabled)) && !user) {
      onLogin();
      return;
    }
    if(kind !== "report.create" && !canContribute){onLogin();return;}
    setBusy(true);
    setError("");
    try {
      const target = payload.photo_id
        ? d.photos.find((p) => p.id === payload.photo_id)?.place_id
        : payload.review_id
          ? d.reviews.find((r) => r.id === payload.review_id)?.place_id
          : kind === "review.save"
            ? own?.place_id
            : undefined;
      if (kind === "report.create") {
        if (freeCollaborationEnabled) {
          const sent = await reportFreeReview(target || d.id, String(payload.review_id || ""), `${payload.category || "Autre"} : ${payload.reason || ""}`,String(payload.photo_id || ""),{place:d,photo:d.photos.find(p=>p.id===payload.photo_id),review:d.reviews.find(r=>r.id===payload.review_id)});
          if (!sent) { toast("Ce contenu a déjà été signalé et attend une décision."); setModal(""); return; }
        } else await api("/v1/operations", { method: "POST", body: JSON.stringify({ id: crypto.randomUUID(), kind, place_id: target || d.id, payload }) });
        toast("Signalement transmis à l’éditeur.");
        setModal("");
        return;
      }
      if (kind === "review.vote" && freeCollaborationEnabled) {
        if (!freeAccount) { onLogin(); return; }
        const changed = await voteFreeReview(target || d.id, String(payload.review_id), Number(payload.value));
        await applyFreeChanges([changed]);
        await refresh();
        toast("Vote enregistré.");
        return;
      }
      await enqueue(kind, target || d.id, payload);
      if (!personalMode) await sync();
      await refresh();
      toast(
        personalMode
          ? "Enregistré sur cet appareil."
          : "Contribution enregistrée.",
      );
      setModal("");
      if(kind === "review.save") requestAnimationFrame(()=>requestAnimationFrame(()=>{
        ownReviewElement.current?.scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"center"});
      }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function validate(value: boolean) {
    if (!canContribute) {
      onLogin();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await validateInformation(d.merged_members || [d], value);
      await refresh();
      setModal("");
      toast(freeCollaborationEnabled ? "Validation enregistrée sur cet appareil ; synchronisation en cours." : value ? "Informations validées." : "Lieu marqué à corriger.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const sorted = d.reviews.filter(r => !blocked.has(r.user_id)).sort((a, b) =>
    sort === "relevant"
      ? b.votes - (b.downvotes || 0) - (a.votes - (a.downvotes || 0)) ||
        reviewTime(b) - reviewTime(a)
      : reviewTime(b) - reviewTime(a),
  );
  const photosSection = (
    <>
      {visiblePhotos.length ? (
        <div className="photos featured-photos">
          {visiblePhotos.map((p,index) => (
            <figure key={p.id}>
              <div className="photo-tile">
              <button
                type="button"
                className="photo-preview"
                aria-label={`Agrandir la photo de ${d.name}`}
                onClick={() => {
                  setPhotoIndex(
                    visiblePhotos.findIndex((photo) => photo.id === p.id),
                  );
                  setModal("photo");
                }}
              >
                <img
                  src={photoUrl(p.url)}
                  alt={photoCredit(p.caption) ? `Photo de ${d.name}` : p.caption || `Photo de ${d.name}`}
                  loading={index < 3 ? "eager" : "lazy"}
                  decoding="async"
                />
              </button>
              <figcaption>
                {!personalMode && p.user_id !== actorId && !photoCredit(p.caption) && <AuthorActions person={{ id: p.user_id, username: p.author || "Contributeur" }} toast={toast} onReport={() => {
                  if (!user) { onLogin(); return; }
                  setReason(""); setReportCategory("other"); setReportTarget({ photo_id: p.id, scope: "author" }); setModal("report");
                }} />}
                {(!personalMode || freeCollaborationEnabled) && (
                  <button
                    className="icon-button photo-report"
                    aria-label="Signaler cette photo"
                    onClick={() => {
                      if (!freeCollaborationEnabled && !user) {
                        onLogin();
                        return;
                      }
                      setReason("");
                      setReportCategory("other");
                      setReportTarget({ photo_id: p.id });
                      setModal("report");
                    }}
                  >
                    <Flag size={16} />
                  </button>
                )}
                {canDelete && (
                  <button
                    className="icon-button photo-delete"
                    aria-label="Supprimer cette photo"
                    onClick={() => {
                      ask("Supprimer cette photo ?", () =>
                        act("photo.delete", { photo_id: p.id }),
                      );
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </figcaption>
              </div>
              <PhotoCredit caption={p.caption} />
            </figure>
          ))}
        </div>
      ) : null}
    </>
  );
  return (
    <section
      className={`detail page place-sheet ${sheet.expanded ? "expanded" : ""} ${sheet.height !== null ? "dragging" : ""} ${sheet.closing ? "closing" : ""}`}
      ref={sheet.rootRef}
      {...sheet.rootEvents}
      aria-label={`Fiche du lieu : ${d.name}`}
      style={{
        height:
          sheet.height !== null
            ? `${sheet.height}px`
            : `${sheet.expanded ? "100" : "50"}dvh`,
      }}
    >
      <button
        type="button"
        className="sheet-handle"
        aria-label={sheet.expanded ? "Réduire la fiche" : "Agrandir la fiche"}
        aria-expanded={sheet.expanded}
        onClick={sheet.handleClick}
      >
        <span />
      </button>
      <header className="page-head">
        <span>{placeLabel(d)}</span>
        <div className="detail-head-actions">
          <button
            className="icon-button"
            aria-label="Voir ce lieu sur la carte"
            onClick={() => onShowMap(d)}
          >
            <MapIcon />
          </button>
          <button
            className={"icon-button " + (fav ? "selected" : "")}
            aria-label={fav ? "Retirer des favoris" : "Ajouter aux favoris"}
            onClick={() =>
              canContribute ? void favorite({ ...d, merged_members: place.merged_members }).catch(e=>toast(e.message)) : onLogin()
            }
          >
            <Heart fill={fav ? "currentColor" : "none"} />
          </button>
        </div>
      </header>
      <div className="detail-scroll" ref={sheet.scrollRef}>
        <div className="place-intro">
          <span
            className="category-badge big"
            style={{
              background: colors[d.category],
              color: categoryInk(d.category),
            }}
          >
            <PlaceSymbol place={d} />
          </span>
          <div>
            {d.name.trim().toLocaleLowerCase("fr") !==
              placeLabel(d).toLocaleLowerCase("fr") && <h1>{d.name}</h1>}
            {!!d.transit_lines?.length && (
              <div className="transit-lines" aria-label="Lignes">
                {d.transit_lines.map((line) => {
                  const route = transit.routes.find(
                    (route) => route.line === line.toUpperCase(),
                  );
                  return (
                    <b key={line} className="route-line-badge">
                      {route && <i style={{ background: route.color }} />}
                      {line}
                    </b>
                  );
                })}
              </div>
            )}
            <div className="place-reputation">
              <button
                className="review-summary"
                aria-label={`Voir les ${d.review_count || 0} avis`}
                onClick={() => {
                  reviewsHeading.current?.focus({ preventScroll: true });
                  reviewsHeading.current?.scrollIntoView({
                    behavior: matchMedia("(prefers-reduced-motion: reduce)")
                      .matches
                      ? "instant"
                      : "smooth",
                    block: "start",
                  });
                }}
              >
                {d.rating !== null ? (
                  <>
                    <Star size={17} className="star" fill="currentColor" />{" "}
                    {d.rating.toLocaleString("fr-FR")} · {d.review_count} avis
                  </>
                ) : (
                  <>
                    <Star size={17} className="star" /> 0 avis
                  </>
                )}
              </button>
              <button
                className="icon-button accuracy-button"
                aria-label="Exactitude des informations"
                onClick={() => {if(canContribute)setModal("validation");else onLogin();}}
              >
                <AccuracyIcon place={d} showLabel />
              </button>
            </div>
          </div>
        </div>
        {/* Le cache reste affiché pendant l’actualisation silencieuse. */}
        {detailOffline && <p role="status" className="notice">Hors connexion : seules les données enregistrées sont disponibles.</p>}
        {detailError && <div role="alert" className="notice"><span>{detailError}</span><button className="secondary" disabled={detailLoading} onClick={async()=>{setDetailLoading(true);setDetailError('');try{await loadOpenedDetail(place.id,true);await refresh();}catch(error){setDetailError((error as Error).message);}finally{setDetailLoading(false);}}}>Réessayer</button></div>}
        {(d.photos.length > 0 || (freeCollaborationEnabled && (d.photo_count||0)>0) || (previewState?.value as PreviewState|undefined)?.hasMore) && photosSection}
        {pending.some((q) => [d.id,...(d.catalog_sources||[]),...(d.merged_members||[]).map(p=>p.id)].includes(q.operation.place_id)) && (
          <p className="notice">
            Contribution non confirmée sur le compte : consultez son état dans Profil. Ne désinstallez pas l’application avant la fin de l’envoi.
          </p>
        )}
        {(d.address || d.city || origin.chosen) && (
          <div className="place-location">
            <MapPin size={20} />
            <span>
              {d.address || d.city}
              {origin.chosen && (
                <small>
                  {distanceLabel(distance(origin, d))} depuis {origin.label} · à
                  vol d’oiseau
                </small>
              )}
            </span>
          </div>
        )}
        <button className="primary" onClick={() => setModal("directions")}>
          <Navigation size={19} /> {pmr ? "Itinéraire PMR" : "Itinéraire"}
        </button>
        {d.condition && !["unknown", "open"].includes(d.condition) && (
          <div className="condition">
            <b className={d.condition === "open" ? "green" : "orange"}>
              {d.condition === "temporary_closed"
                ? "Signalé fermé temporairement"
                : "Signalé hors service"}
            </b>
            {d.condition_observed_at && (
              <small>
                Constaté le {date(d.condition_observed_at)} · information
                communautaire
              </small>
            )}
          </div>
        )}
        <div className="equipment">
          {(typeof d.free === "boolean" || d.merged_conflicts?.includes("free")) && (
            <div>
              <span>Tarif</span>
              <b className={d.free == null ? "muted" : d.free ? "green" : "red"}>
                {d.free == null ? "À confirmer" : d.free ? "Gratuit" : "Payant"}
              </b>
            </div>
          )}
          {equipmentByCategory[d.category]
            .filter(([key]) => key !== "free")
            .filter(
              ([key]) =>
                key !== "toilets_available" || d.category === "playground",
            )
            .filter(([k]) => typeof d[k as keyof Place] === "boolean" || d.merged_conflicts?.includes(k))
            .map(([key, label]) => {
              const value = d[key as keyof Place];
              return (
                <div key={key}>
                  <span>{label}</span>
                  <b
                    className={
                      value === true
                        ? "green"
                        : value === false
                          ? "red"
                          : "muted"
                    }
                  >
                    {value === true
                      ? "Oui"
                      : value === false
                        ? "Non"
                        : d.merged_conflicts?.includes(key)
                          ? "À confirmer"
                          : "Non renseigné"}
                  </b>
                </div>
              );
            })}
        </div>
        {d.age && <p>Âge conseillé : {d.age}</p>}
        {["customers", "private", "public", "permissive"].includes(
          d.access,
        ) && (
          <p className="access-note">
            {d.access === "customers"
              ? "Accès réservé à la clientèle"
              : d.access === "private"
                ? "Accès privé"
                : d.access === "public"
                  ? "Accès public"
                  : "Accès autorisé par le propriétaire"}
          </p>
        )}
        {(d.hours || !!d.hours_variants?.length) && (
          <p className="hours">
            <Clock size={18} />
            <span>
              {open === true
                ? "Ouvert actuellement · "
                : open === false
                  ? "Fermé actuellement · "
                  : ""}
              {displayHours(d.hours || d.hours_variants?.join(" · ") || "")}
            </span>
          </p>
        )}
        {!!d.related_names?.length && (
          <p className="description">{d.related_names.join(" · ")}</p>
        )}
        {d.activity_type && d.category === "child_activity" && (
          <p>
            <b>{frenchLabel(d.activity_type)}</b>
          </p>
        )}
        {d.description && <p className="description">{protectedPlace(d) ? d.description : summarizePlaceText(d.description)}</p>}
        {!!d.merged_members?.length && <details className="merged-source-details">
          <summary>Informations des fiches regroupées</summary>
          {d.merged_members.map(source => <div key={source.id}>
            <strong>{source.name}</strong>
            <p>{[source.address, source.city, ({public:"Accès public",private:"Accès privé",customers:"Réservé à la clientèle",permissive:"Accès autorisé"} as Record<string,string>)[source.access], source.website].filter(Boolean).join(" · ")}</p>
          </div>)}
        </details>}
        {websiteUrl(d.website) && (
          <a
            className="secondary website-link"
            href={websiteUrl(d.website)!}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={18} /> Site web
          </a>
        )}
        <button
          className="secondary"
          onClick={() => {
            if (canContribute) setModal("edit");
            else onLogin();
          }}
        >
          <Pencil size={18} /> Modifier les informations / Photos
        </button>
        <div className="section-title">
          <h2 ref={reviewsHeading} tabIndex={-1}>
            Avis ({d.reviews.length})
          </h2>
          <div
            className="chip-group review-sort"
            role="group"
            aria-label="Avis et Google Maps"
          >
            <button
              aria-pressed={sort === "relevant"}
              onClick={() => setSort("relevant")}
            >
              Pertinents
            </button>
            <button
              aria-pressed={sort === "recent"}
              onClick={() => setSort("recent")}
            >
              Récents
            </button>
            <GoogleMapsLink place={d} />
          </div>
        </div>
        {!own && (
          <button
            className="secondary"
            onClick={() => {
              if (!canContribute) {
                onLogin();
                return;
              }
              setStars(5);
              setComment("");
              setModal("review");
            }}
          >
            <Star size={18} />
            Donner mon avis
          </button>
        )}
        {sorted.map((r) => (
          <article className="review" ref={r.user_id === actorId || (personalMode && r.user_id === PERSONAL_ID) ? ownReviewElement : undefined} key={`${r.place_id || d.id}:${r.id}`}>
            <div className="review-top">
              <b>{r.author}</b>
              <time dateTime={reviewDate(r)}>
                {date(reviewDate(r))}
                {reviewDate(r) !== r.created ? " · modifié" : ""}
              </time>
            </div>
            <div className="stars" aria-label={`${r.stars} sur 5`}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  size={15}
                  fill={n <= r.stars ? "currentColor" : "none"}
                />
              ))}
            </div>
            <p>{r.text}</p>
            {isHelpfulReview(r) && <span className="helpful-review-badge"><RewardIcon name="Avis utile · Pouce"/> Avis utile</span>}
            <div className="review-actions">
              {!personalMode && r.user_id !== actorId && <AuthorActions person={{ id: r.user_id, username: r.author }} toast={toast} onReport={() => {
                if (!user) { onLogin(); return; }
                setReason(""); setReportCategory("other"); setReportTarget({ review_id: r.id, scope: "author" }); setModal("report");
              }} />}
              <div className="review-votes" aria-label="Pertinence de l’avis">
                {([1, -1] as const).map((value) => {
                  const down = value === -1;
                  const active = (
                    down ? r.downvoters || [] : r.voters
                  ).includes(actorId || "");
                  const Icon = down ? ThumbsDown : ThumbsUp;
                  const count = down ? r.downvotes || 0 : r.votes;
                  return (
                    <button
                      key={value}
                      className="text-button"
                      aria-pressed={active}
                      aria-label={`${down ? "Peu utile" : "Utile"} : ${count}`}
                      disabled={!canContribute || (personalMode && !freeCollaborationEnabled) || r.user_id === actorId || busy}
                      onClick={() =>
                        void act("review.vote", {
                          review_id: r.id,
                          value: active ? 0 : value,
                        })
                      }
                    >
                      <Icon size={17} fill={active ? "currentColor" : "none"} />{" "}
                      {count}
                    </button>
                  );
                })}
              </div>
              {(r.user_id === actorId || (personalMode && r.user_id === PERSONAL_ID)) && (
                <button
                  className="text-button review-edit"
                  disabled={busy}
                  onClick={() => {
                    setStars(r.stars);
                    setComment(r.text);
                    setModal("review");
                  }}
                >
                  <Pencil size={15} /> Modifier mon avis
                </button>
              )}
              {(r.user_id === actorId || (personalMode && r.user_id === PERSONAL_ID)) ? (
                <button
                  className="text-button muted"
                  disabled={busy}
                  onClick={() => {
                    ask("Supprimer votre avis ?", () =>
                      act("review.delete", { review_id: r.id }),
                    );
                  }}
                >
                  <Trash2 size={15} /> Supprimer
                </button>
              ) : (!personalMode || freeCollaborationEnabled) ? (
                <button
                  className="text-button"
                  aria-label="Signaler"
                  onClick={() => {
                    if (!freeCollaborationEnabled && !user) { onLogin(); return; }
                    setReason("");
                    setReportTarget({ review_id: r.id });
                    setModal("report");
                  }}
                >
                  <Flag size={15} /> Signaler
                </button>
              ) : null}
            </div>
          </article>
        ))}
        {(!personalMode || freeCollaborationEnabled) && (
          <button
            className="text-button muted"
            onClick={() => {
              if (!freeCollaborationEnabled && !user) {
                onLogin();
                return;
              }
              setReason("");
              setReportTarget({});
              setModal("report");
            }}
          >
            <Flag size={16} /> Signaler
          </button>
        )}
      </div>
      {confirmation}
      {canContribute && nearby.visible && modal === "" && !confirmation && (
        <NearbyPrompt
          onClose={nearby.dismiss}
          onValidate={() => { nearby.dismiss(); void validate(true); }}
          onPhotos={() => {
            nearby.dismiss();
            if (!canContribute) { onLogin(); return; }
            setModal("add-photos");
          }}
          onEdit={() => {
            nearby.dismiss();
            if (!canContribute) { onLogin(); return; }
            setModal("edit");
          }}
        />
      )}
      {modal === "add-photos" && (
        <PhotoPicker
          onClose={() => setModal("")}
          onAdd={async photos => {
            await addPhotos(d.id, photos);
            await refresh();
            setModal("");
            toast("Photos enregistrées.");
          }}
        />
      )}
      {modal === "photo" && visiblePhotos[photoIndex] && (
        <PhotoViewer
          placeName={d.name}
          photos={visiblePhotos.map((p,index) => ({
            url: photoUrl(p.url),
            caption: p.caption,
          }))}
          initialIndex={photoIndex}
          onClose={() => setModal("")}
        />
      )}
      {modal === "validation" && (
        <Modal title="Exactitude des informations" onClose={() => setModal("")}>
          <p className="place-reputation">
            <AccuracyIcon place={d} showLabel />
          </p>
          {d.validated_at && (
            <p>Dernière validation : {date(d.validated_at)}</p>
          )}
          {d.information_validated === false &&
            d.validation_changed_at &&
            d.validated_at && (
              <p className="muted">
                Remises à valider le {date(d.validation_changed_at)}
              </p>
            )}
          <div className="validation-actions">
            <button
              className="secondary green"
              disabled={busy}
              onClick={() => void validate(true)}
            >
              <CircleCheck size={20} /> Informations exactes
            </button>
            <button
              className="secondary red"
              disabled={busy}
              onClick={() => void validate(false)}
            >
              <CircleX size={20} /> À corriger
            </button>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </Modal>
      )}
      {modal === "delete-place" && (
        <Modal
          title={
            canDelete ? "Supprimer ce lieu ?" : "Demander la suppression ?"
          }
          onClose={() => setModal("edit")}
        >
          <p className="muted">
            {canDelete
              ? `${d.name} sera retiré de la carte et de la liste. La suppression est définitive : photos, avis et détails sont effacés.`
              : `${d.name} restera visible jusqu’à la validation de l’administrateur.`}
          </p>
          {!canDelete && (
            <label>
              Motif
              <textarea
                value={deletionReason}
                onChange={(e) => setDeletionReason(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="Pourquoi ce lieu n’est-il pas pertinent ?"
              />
            </label>
          )}
          <button
            className="primary destructive"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                if (personalMode) {
                  for (const member of d.merged_members || [d]) await enqueue("place.delete", member.id, {});
                } else {
                  await enqueue("place.delete", d.id, {
                    place_ids: (d.merged_members || [d]).map((p) => p.id),
                    reason: deletionReason,
                  });
                  await sync();
                }
                toast(
                  personalMode
                    ? "Lieu supprimé définitivement."
                    : canDelete
                      ? "Suppression enregistrée pour envoi."
                      : "Demande enregistrée pour validation par l’administrateur.",
                );
                if (canDelete) onClose();
                else setModal("");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {canDelete ? "Confirmer la suppression" : "Envoyer la demande"}
          </button>
          {error && <p className="error">{error}</p>}
        </Modal>
      )}
      {modal === "directions" && (
        <NavigationChooser
          place={d}
          origin={origin}
          pmr={pmr}
          onClose={() => setModal("")}
        />
      )}
      {modal === "edit" && (
        <PlaceForm
          place={d}
          aerial={aerial}
          onDelete={() => setModal("delete-place")}
          deleteLabel={
            canDelete ? "Supprimer le lieu" : "Demander la suppression"
          }
          position={origin}
          onClose={() => setModal("")}
          onSaved={() => {
            setModal("");
            void refresh();
            toast("Correction enregistrée.");
          }}
        />
      )}
      {modal === "review" && (
        <Modal
          title={own ? "Mon avis" : "Donner mon avis"}
          onClose={() => setModal("")}
        >
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              void act("review.save", { stars, text: comment });
            }}
          >
            <div
              className="rating-input"
              role="radiogroup"
              aria-label="Note sur cinq étoiles"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={stars === n}
                  aria-label={`${n} étoile${n > 1 ? "s" : ""}`}
                  key={n}
                  onClick={() => setStars(n)}
                >
                  <Star fill={n <= stars ? "currentColor" : "none"} size={34} />
                </button>
              ))}
            </div>
            <label>
              Votre expérience
              <textarea
                aria-label="Votre expérience"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={freeCollaborationEnabled && freeAccount?.verified ? 1000 : 3000}
                rows={5}
                placeholder="Accès avec la poussette, équipements, propreté…"
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="primary" disabled={busy}>
              Enregistrer mon avis
            </button>
          </form>
        </Modal>
      )}
      {modal === "report" && (
        <Modal title={reportTarget.scope === "author" ? "Signaler cet utilisateur" : reportTarget.review_id ? "Signaler cet avis" : "Signaler un problème"} onClose={() => setModal("")}>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              void act("report.create", { reason, category: reportCategory, ...reportTarget });
            }}
          >
            <label>
              Motif
              <ChoiceSelect label="Motif du signalement" value={reportCategory} onChange={setReportCategory} options={reportReasons.map(([value,label])=>({value,label}))} />
            </label>
            <label>
              Décrivez le problème
              <textarea
                required
                minLength={5}
                maxLength={1500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={5}
              />
            </label>
            <button className="primary" disabled={busy}>
              Envoyer le signalement
            </button>
            {error && <p className="error">{error}</p>}
          </form>
        </Modal>
      )}
    </section>
  );
}
