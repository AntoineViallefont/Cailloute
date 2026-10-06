import {syncAccountBackup} from './account-backup';
import { HelpfulRewardTile } from "./HelpfulRewardTile";
import { isHelpfulReview } from './review-rewards';
import { useFreeAccount } from "./useFreeAccount";
import { freeCollaborationEnabled, getFreeHelpfulBadge } from "./free-cloud";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { db, api, user } from "./store";
import { personalMode } from "./personal";
import { RewardIcon } from "./RewardIcon";
import { contributionScore, emptyStats, rewardLevels, rewardBadges, type ContributionStats } from "./contribution-score";
export function ContributionRewards() {
  const account=useFreeAccount();
  const key=freeCollaborationEnabled ? `contribution-stats:${account?.uid || "guest"}` : "contribution-stats";
  const local = useLiveQuery(() => db.meta.get(key),[key]);
  const backup=useLiveQuery(()=>account?db.meta.get(`account-backup-status:${account.uid}`):undefined,[account?.uid]);
  const backupState=backup?.value as {state:string;message?:string}|undefined;
  const helpfulKey=`helpful-badge:${account?.uid||'guest'}`;
  const cachedHelpful=useLiveQuery(()=>db.meta.get(helpfulKey),[helpfulKey]);
  const candidate=useLiveQuery(async()=>{if(!account)return undefined;const details=await db.details.toArray();return details.find(d=>d.reviews.some(r=>r.user_id===account.uid&&isHelpfulReview(r)))?.id;},[account?.uid]);
  useEffect(()=>{let stopped=false;if(account)void getFreeHelpfulBadge(candidate).then(earned=>{if(earned&&!stopped)void db.meta.put({key:helpfulKey,value:true});}).catch(()=>{});return()=>{stopped=true;};},[account?.uid,candidate]);
  const helpful=!!account && cachedHelpful?.key===helpfulKey && cachedHelpful.value===true;
  const [remote, setRemote] = useState<ContributionStats | null>(null);
  useEffect(() => { if (!personalMode && user) void api("/v1/me/rewards").then(setRemote).catch(() => setRemote(null)); }, [user?.id]);
  const stats = personalMode ? local?.value as ContributionStats || emptyStats : remote || emptyStats;
  const score = contributionScore(stats);
  return <section className="rewards-card" aria-label="Mes coups de pouce">
    <div className="reward-current"><RewardIcon name={score.level} /><div><h2>{score.level}</h2><strong>{score.points.toLocaleString("fr-FR")} points</strong></div></div>
    <p>{stats.added} lieu{stats.added > 1 ? "x" : ""} ajouté{stats.added > 1 ? "s" : ""} · {stats.edited} lieu{stats.edited > 1 ? "x" : ""} corrigé{stats.edited > 1 ? "s" : ""}</p>
    {score.next && <><progress value={score.points} max={score.next.at} aria-label={`Prochain niveau : ${score.next.name}, à ${score.next.at} points`} /><small>{score.next.name} · {score.points} / {score.next.at} pts</small></>}
    {(score.badges.length > 0 || helpful) && <div className="earned-badges">{score.badges.map(name => <span className="earned-badge" key={name}><RewardIcon name={name} small /><span>{name}</span></span>)}{helpful && <span className="earned-badge"><RewardIcon name="Avis utile · Pouce" small/><span>Avis utile</span></span>}</div>}
    {account && <div className="muted" role="status"><small>{backupState?.state==='saved'?'Photo et points sauvegardés sur votre compte.':'Photo et points : sauvegarde en attente. Gardez l’application installée jusqu’à confirmation.'}</small><button className="text-button" onClick={()=>void syncAccountBackup(true)}>Synchroniser la sauvegarde</button></div>}
    <details className="reward-collection"><summary>Grades et badges</summary>
      <div className="reward-grid">{rewardLevels.map(level => <div key={level.name} className={score.points < level.at ? "locked" : ""}>
        <RewardIcon name={level.name} /><span>{level.name}</span><small>{level.at} pts {score.points < level.at && <LockKeyhole size={12} aria-label="À débloquer" />}</small>
      </div>)}</div>
      <div className="reward-grid">{rewardBadges.map((name, i) => <div key={name} className={!score.badges.includes(name) ? "locked" : ""}>
        <RewardIcon name={name} /><span>{name}</span><small>{["1 ajout", "10 ajouts", "10 corrections", "50 corrections"][i]} {!score.badges.includes(name) && <LockKeyhole size={12} aria-label="À débloquer" />}</small>
      </div>)}<HelpfulRewardTile earned={helpful}/></div>
    </details>
  </section>;
}
