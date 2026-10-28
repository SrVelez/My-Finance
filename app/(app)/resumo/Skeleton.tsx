/** Mesmas alturas dos cards, para a tela não pular quando os dados chegam. */
export function Skeleton() {
  return (
    <div aria-busy aria-label="Carregando o resumo" className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-card bg-line" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-card bg-line" />
      <div className="h-40 animate-pulse rounded-card bg-line" />
      <div className="h-24 animate-pulse rounded-card bg-line" />
    </div>
  );
}
