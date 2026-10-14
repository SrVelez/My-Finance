export const CATEGORIES = ["Mercado", "Transporte", "Comer fora", "Outro"] as const;
export type Category = (typeof CATEGORIES)[number];
