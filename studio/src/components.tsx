import { useEffect, useRef, useState, type ReactNode } from "react";
import { onQueue, queueState } from "./lib/process";
import { renderBackdrop, type Backdrop } from "./lib/backgrounds";

export function Header({ title, back, right }: { title: ReactNode; back?: string; right?: ReactNode }) {
  return (
    <header className="top">
      {back ? (
        <a className="icon-btn" href={`#${back}`} aria-label="Back">
          ‹
        </a>
      ) : (
        <span className="brand-dot" />
      )}
      <h1>{title}</h1>
      <div className="top-right">{right}</div>
    </header>
  );
}

/** Hidden file input driven by a button. capture opens the camera straight away on phones. */
export function FileButton({
  children, onFiles, capture, multiple, className = "btn", accept = "image/*",
}: {
  children: ReactNode;
  onFiles: (f: File[]) => void;
  capture?: boolean;
  multiple?: boolean;
  className?: string;
  accept?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={className} onClick={() => ref.current?.click()}>
        {children}
      </button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        hidden
        multiple={multiple}
        {...(capture ? { capture: "environment" } : {})}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </>
  );
}

export function QueueBadge() {
  const [st, setSt] = useState(queueState());
  useEffect(() => onQueue(() => setSt(queueState())), []);
  if (!st.current && !st.pending) return null;
  return <span className="pill busy">Processing {st.pending + (st.current ? 1 : 0)}</span>;
}

export function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`toggle${disabled ? " disabled" : ""}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
      {label}
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([v, l]) => (
        <button key={v} type="button" className={v === value ? "on" : ""} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function useToast(): [ReactNode, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3500);
    return () => clearTimeout(t);
  }, [msg]);
  return [msg ? <div className="toast">{msg}</div> : null, setMsg];
}

export function BackdropThumb({ bd, on, onPick }: { bd: Backdrop; on: boolean; onPick: () => void }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let u: string | undefined;
    renderBackdrop(bd.id, 160, 120).then(async ({ canvas }) => {
      u = URL.createObjectURL(await canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 }));
      setUrl(u);
    });
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [bd.id]);
  return (
    <button type="button" className={`bd${on ? " on" : ""}`} onClick={onPick} title={bd.name}>
      {url && <img src={url} alt="" />}
      <span>{bd.name}</span>
    </button>
  );
}
