export function SignalRow({ label, detail, none = false }: { label: string; detail: string; none?: boolean }) {
  return (
    <div className={`signal-row ${none ? 'none' : ''}`}>
      <span className="signal-label">{label}</span>
      <span className="signal-detail">{detail}</span>
    </div>
  );
}