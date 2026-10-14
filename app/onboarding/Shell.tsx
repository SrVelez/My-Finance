import type { ReactNode } from "react";

const TOTAL = 4;

/** Moldura dos passos: voltar + progresso, conteúdo e rodapé fixo. */
export function Shell({
  step,
  onBack,
  title,
  subtitle,
  children,
  footer,
}: {
  step: number;
  onBack?: () => void;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col px-5 pt-5">
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Voltar"
          disabled={!onBack}
          className={`flex size-11 items-center justify-center rounded-full text-2xl ${onBack ? "" : "invisible"}`}
        >
          ‹
        </button>
        <div className="flex flex-1 gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={TOTAL} aria-valuenow={step}>
          {Array.from({ length: TOTAL }, (_, i) => (
            <span key={i} className={`h-1 flex-1 rounded-full ${i < step ? "bg-brand" : "bg-line"}`} />
          ))}
        </div>
        <span className="w-9 text-right text-xs text-muted">
          {step} de {TOTAL}
        </span>
      </header>

      <div className="mt-6 flex-1 pb-4">
        <h1 className="font-display text-[28px] leading-[1.1] font-extrabold">{title}</h1>
        <p className="mt-2 text-[15px] text-muted">{subtitle}</p>
        <div className="mt-5 space-y-4">{children}</div>
      </div>

      <footer className="sticky bottom-0 -mx-5 space-y-1 bg-gradient-to-t from-canvas via-canvas to-transparent px-5 pt-4 pb-5">
        {footer}
      </footer>
    </div>
  );
}
