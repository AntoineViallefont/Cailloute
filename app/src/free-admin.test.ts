import {expect,it,vi} from 'vitest';
import {isFreeAdminIdentity} from './free-admin';
it('ne consulte pas les droits d’un compte non vérifié',async()=>{
 const probe=vi.fn();expect(await isFreeAdminIdentity({emailVerified:false},probe)).toBe(false);expect(probe).not.toHaveBeenCalled();
});
it('accorde l’interface administrateur uniquement après autorisation serveur',async()=>{
 expect(await isFreeAdminIdentity({emailVerified:true},async()=>undefined)).toBe(true);
 expect(await isFreeAdminIdentity({emailVerified:true},async()=>{throw new Error('permission-denied');})).toBe(false);
});
