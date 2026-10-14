/** "Vence hoje", "Vence amanhã" ou "Vence em N dias" (até 7 dias); null se ainda está longe. */
export function dueSoonLabel(daysLeft: number): string | null {
  if (daysLeft < 0 || daysLeft > 7) return null;
  if (daysLeft === 0) return "Vence hoje";
  if (daysLeft === 1) return "Vence amanhã";
  return `Vence em ${daysLeft} dias`;
}
