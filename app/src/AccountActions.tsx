export const accountDeletionMessage = 'Vos favoris et vos données personnelles de connexion seront supprimés. Vos avis et photos resteront sous le nom « Compte supprimé ». Les lieux ajoutés sont conservés.';
export function AccountActions({busy=false,onLogout,onDelete}:{busy?:boolean;onLogout:()=>void;onDelete:()=>void}) {
 return <div className="form account-actions"><button className="secondary" disabled={busy} onClick={onLogout}>Se déconnecter</button><button className="primary destructive" disabled={busy} onClick={onDelete}>Supprimer mon compte</button></div>;
}
