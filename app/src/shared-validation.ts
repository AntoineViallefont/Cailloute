import type {Place} from './types';
/** Les corrections validées localement doivent conserver ce statut après réinstallation. */
export function sharedValidation(place:Place,kind:string,payload:Record<string,unknown>,at=new Date().toISOString()):Place {
 if(kind==='place.create'||kind==='place.edit')return {...place,information_validated:true,validated_at:at,validation_changed_at:at};
 if(kind==='place.validate')return {...place,information_validated:payload.value===true,validation_changed_at:at,...(payload.value===true?{validated_at:at}:{})};
 return place;
}
