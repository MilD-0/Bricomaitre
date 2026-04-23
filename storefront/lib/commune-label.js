export function formatCommuneOptionLabel(commune, stopDeskSuffix) {
  if (!commune?.hasStopDesk) {
    return commune?.name ?? "";
  }

  const suffix = typeof stopDeskSuffix === "string" ? stopDeskSuffix.trim() : "";
  if (suffix.length === 0) {
    return commune.name;
  }

  return `${commune.name} ${suffix}`;
}
