/** Toda série tem legenda com texto: a cor nunca é a única pista. */
export function Legenda({ itens }: { itens: { cor: string; rotulo: string; tracejado?: boolean }[] }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {itens.map((i) => (
        <li key={i.rotulo} className="flex items-center gap-1.5">
          {i.tracejado ? (
            <span aria-hidden className={`h-0 w-4 border-t-2 border-dashed ${i.cor}`} />
          ) : (
            <span aria-hidden className={`size-2.5 rounded-sm ${i.cor}`} />
          )}
          {i.rotulo}
        </li>
      ))}
    </ul>
  );
}
