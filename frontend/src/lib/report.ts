import type { ResourceConfig, SimulationResponse } from "./sim";

/** Escape spreadsheet formula injection on user-editable CSV cells. */
export function sanitizeCsvCell(value: string | number): string {
  const raw = String(value ?? "");
  const needsEscape = /^[=+\-@]/.test(raw) || /[",\n\r]/.test(raw);
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  if (needsEscape || safe.includes('"')) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function buildCostCsv(
  resources: ResourceConfig[],
  simulation: SimulationResponse,
  meta: { provider: string; pricingModel: string; region: string },
): string {
  const header = [
    "name",
    "kind",
    "tier",
    "quantity",
    "size",
    "utilization",
    "unit_cost",
    "monthly_cost",
    "status",
    "provider",
    "pricing_model",
    "region",
  ];
  const rows = resources.map((resource) => {
    const estimate = simulation.resource_estimates.find((item) => item.resource_id === resource.id);
    return [
      sanitizeCsvCell(resource.name),
      sanitizeCsvCell(resource.kind),
      sanitizeCsvCell(resource.tier ?? ""),
      sanitizeCsvCell(resource.quantity),
      sanitizeCsvCell(resource.size),
      sanitizeCsvCell(estimate?.utilization ?? resource.utilization),
      sanitizeCsvCell(estimate?.unit_cost ?? 0),
      sanitizeCsvCell(estimate?.monthly_cost ?? 0),
      sanitizeCsvCell(estimate?.status ?? ""),
      sanitizeCsvCell(meta.provider),
      sanitizeCsvCell(meta.pricingModel),
      sanitizeCsvCell(meta.region),
    ].join(",");
  });
  return [header.join(","), ...rows].join("\n");
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
