import{describe,it,expect,vi}from'vitest';import{nativeGoogleLogin}from'./google-native-login';
describe('connexion Google Android',()=>{
 it('utilise normalement la connexion native sans ouvrir deux sélecteurs',async()=>{const value={credential:{idToken:'test'}} as any;const signIn=vi.fn().mockResolvedValue(value);expect(await nativeGoogleLogin(signIn)).toBe(value);expect(signIn).toHaveBeenCalledTimes(1);});
 it('propose le sélecteur complet après account reauth failed',async()=>{const value={credential:{idToken:'test'}} as any;const signIn=vi.fn().mockRejectedValueOnce(Error('Account reauth failed')).mockResolvedValue(value);expect(await nativeGoogleLogin(signIn)).toBe(value);expect(signIn).toHaveBeenLastCalledWith({skipNativeAuth:true,useCredentialManager:false});});
 it('ne relance pas une connexion annulée par la personne',async()=>{const signIn=vi.fn().mockRejectedValue(Error('User cancelled'));await expect(nativeGoogleLogin(signIn)).rejects.toThrow('User cancelled');expect(signIn).toHaveBeenCalledTimes(1);});
 it('signale un second échec sans boucler',async()=>{const signIn=vi.fn().mockRejectedValue(Error('Account reauth failed'));await expect(nativeGoogleLogin(signIn)).rejects.toThrow();expect(signIn).toHaveBeenCalledTimes(2);});
});
