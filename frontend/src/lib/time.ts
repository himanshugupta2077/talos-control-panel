/**
 * Renders ISO timestamps in IST (Asia/Kolkata) everywhere in the control
 * panel, regardless of the operator's OS locale/timezone — Talos stores
 * timestamps in UTC, and the team standardized on IST for review.
 */
export function formatIST(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return (
    new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(d) + " IST"
  );
}
