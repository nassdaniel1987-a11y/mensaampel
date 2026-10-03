import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog ref={ref} onCancel={onClose}>
      <div className="modal-heading">
        <h2>{title}</h2>
        <button aria-label="Schließen" className="icon-button" onClick={onClose}>
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
