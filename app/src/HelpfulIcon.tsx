import { MessageSquareHeart, BadgeCheck, ThumbsUp, Sparkles } from 'lucide-react';
export const helpfulIconOptions = [{name:'Pouce',Icon:ThumbsUp},{name:'Bulle et cœur',Icon:MessageSquareHeart},{name:'Badge',Icon:BadgeCheck},{name:'Étincelles',Icon:Sparkles}] as const;
export function HelpfulIcon({variant=0,size=18}:{variant?:number;size?:number}) {const Icon=helpfulIconOptions[variant]?.Icon || ThumbsUp;return <Icon size={size} strokeWidth={1.8} aria-hidden="true"/>;}
