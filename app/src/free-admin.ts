/** Les droits sont décidés par Firestore, sans liste de comptes dans le client. */
export async function isFreeAdminIdentity(user: {emailVerified: boolean}, probe: () => Promise<unknown>): Promise<boolean> {
  if (!user.emailVerified) return false;
  try { await probe(); return true; } catch { return false; }
}
