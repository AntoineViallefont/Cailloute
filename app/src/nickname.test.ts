import{describe,it,expect}from'vitest';import{nickname}from'./nickname';
describe('pseudo public unique',()=>{
 it('ignore la casse et les espaces superflus',()=>{expect(nickname('  AVI  ')).toEqual({name:'AVI',key:'u_avi'});expect(nickname('avi').key).toBe(nickname('AVI').key);expect(nickname('Jean   Paul').name).toBe('Jean Paul');});
 it('normalise les accents et conserve le pseudo affiché',()=>{expect(nickname('E\u0301milie')).toEqual({name:'Émilie',key:'u_emilie'});});
 it('refuse les chemins et les valeurs invalides',()=>{for(const value of ['a','a/b','x'.repeat(41),'😀😀'])expect(()=>nickname(value)).toThrow();});
});
