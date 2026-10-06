import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
export function PasswordField({label='Mot de passe',value,onChange,create=false}:{label?:string;value:string;onChange:(value:string)=>void;create?:boolean}) {
  const [visible,setVisible]=useState(false);
  return <label>{label}<span className="password-field"><input type={visible?'text':'password'} required minLength={10} maxLength={128} autoComplete={create?'new-password':'current-password'} value={value} onChange={e=>onChange(e.target.value)}/><button type="button" className="icon-button" aria-label={`${visible?'Masquer':'Afficher'} ${label.toLowerCase()}`} aria-pressed={visible} onClick={()=>setVisible(!visible)}>{visible?<EyeOff size={20}/>:<Eye size={20}/>}</button></span></label>;
}
