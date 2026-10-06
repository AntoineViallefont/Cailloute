export function PendingContributions({count, message}: {count:number; message:string}) {
  if (!count) return null;
  return <div className="pending-contributions"><p>{count} contribution{count > 1 ? "s" : ""} en attente</p><small role="status">{message}</small></div>;
}
