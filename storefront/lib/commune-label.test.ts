import { describe, expect, it } from "vitest";

import { formatCommuneOptionLabel } from "./commune-label";

describe("formatCommuneOptionLabel", () => {
  it("appends the stopdesk suffix only for communes that support stopdesk", () => {
    expect(
      formatCommuneOptionLabel(
        { name: "Bab Ezzouar", hasStopDesk: true },
        "(Stopdesk)",
      ),
    ).toBe("Bab Ezzouar (Stopdesk)");

    expect(
      formatCommuneOptionLabel(
        { name: "Dar El Beida", hasStopDesk: false },
        "(Stopdesk)",
      ),
    ).toBe("Dar El Beida");
  });

  it("falls back to the commune name when the suffix is blank", () => {
    expect(
      formatCommuneOptionLabel(
        { name: "Bir Mourad Rais", hasStopDesk: true },
        "   ",
      ),
    ).toBe("Bir Mourad Rais");
  });
});
