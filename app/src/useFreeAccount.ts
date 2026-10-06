import { useEffect, useState } from 'react';
import { getFreeSession, subscribeFreeSession } from './free-cloud';
export function useFreeAccount() { const [account,setAccount]=useState(getFreeSession); useEffect(()=>subscribeFreeSession(s=>setAccount(s?{...s}:null)),[]); return account; }
