import type { ReactNode } from "react";

/** Mensagem de erro de formulário, anunciada por leitores de tela. */
export function FormError({ children, center }: { children: ReactNode; center?: boolean }) {
  return (
    <p role="alert" className={`text-sm text-warn-ink ${center ? "text-center" : ""}`}>
      {children}
    </p>
  );
}
