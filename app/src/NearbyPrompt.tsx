import { Camera, CircleCheck, Pencil } from "lucide-react";
import { Modal } from "./Modal";
export function NearbyPrompt({ onClose, onValidate, onPhotos, onEdit }: {
  onClose: () => void; onValidate: () => void; onPhotos: () => void; onEdit: () => void;
}) {
  return <Modal title="Vous êtes sur place ?" className="nearby-prompt" onClose={onClose}>
    <div className="nearby-actions">
      <button className="nearby-validate" onClick={onValidate}><CircleCheck /><span>Valider</span></button>
      <button onClick={onPhotos}><Camera /><span>Photos</span></button>
      <button onClick={onEdit}><Pencil /><span>Modifier</span></button>
    </div>
  </Modal>;
}
