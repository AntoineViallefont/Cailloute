import type { SignInResult, SignInWithGoogleOptions } from '@capacitor-firebase/authentication';
/** Certains comptes Android exigent le sélecteur Google complet pour se réauthentifier. */
export async function nativeGoogleLogin(signIn:(options:SignInWithGoogleOptions)=>Promise<SignInResult>):Promise<SignInResult> {
 try {return await signIn({skipNativeAuth:true});}
 catch(error){
  const message=error instanceof Error?error.message:String(error);
  if(!/account[ _-]*reauth[ _-]*failed|reauthentication failed/i.test(message))throw error;
  return signIn({skipNativeAuth:true,useCredentialManager:false});
 }
}
