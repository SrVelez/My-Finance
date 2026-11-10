/** "Chrome no Android", "Safari no iPhone"…: o suficiente para reconhecer um aparelho na lista de sessões. */
export function describeDevice(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  if (!ua) return "Aparelho desconhecido";

  // A ordem importa: Edge e Opera também dizem "Chrome"; o Chrome diz "Safari".
  const browser = /Edg(e|A|iOS)?\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\/|FxiOS\//.test(ua)
        ? "Firefox"
        : /Chrome\/|CriOS\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Navegador";

  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(ua)
            ? "Mac"
            : /Linux|X11/.test(ua)
              ? "Linux"
              : null;

  return os ? `${browser} no ${os}` : browser;
}
