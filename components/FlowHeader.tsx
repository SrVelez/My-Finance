import Link from "next/link";
import type { ReactNode } from "react";

/** Cabeçalho das telas de fluxo: fechar (X) ou voltar, título centralizado e ação opcional. */
export function FlowHeader({
  title,
  onBack,
  closeHref = "/",
  backHref,
  action,
}: {
  title: string;
  /** Destino do X quando não há `onBack` nem `backHref`. */
  closeHref?: string;
  /** Mostra "‹" como link para esta rota (telas de detalhe). */
  backHref?: string;
  /** Sem `onBack`, mostra o X que volta ao Início. */
  onBack?: () => void;
  /** Botão à direita (ex.: ⋮). */
  action?: ReactNode;
}) {
  const btn = "flex size-11 items-center justify-center rounded-full text-2xl";
  return (
    <header className="flex items-center justify-between px-3 pt-4">
      {onBack ? (
        <button type="button" onClick={onBack} aria-label="Voltar" className={btn}>
          ‹
        </button>
      ) : backHref ? (
        <Link href={backHref} aria-label="Voltar" className={btn}>
          ‹
        </Link>
      ) : (
        <Link href={closeHref} aria-label="Fechar" className={btn}>
          ×
        </Link>
      )}
      <h1 className="min-w-0 truncate text-sm font-bold">{title}</h1>
      {action ?? <span className="size-11" aria-hidden />}
    </header>
  );
}
