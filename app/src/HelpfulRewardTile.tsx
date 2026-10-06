import { RewardIcon } from "./RewardIcon";
export function HelpfulRewardTile({earned=false}: {earned?:boolean}) {
  return <div className={earned ? "" : "locked"}><RewardIcon name="Avis utile · Pouce"/><span>Avis utile</span><small>{earned ? "Obtenu" : "3 pouces +"}</small></div>;
}
