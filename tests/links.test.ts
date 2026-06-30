import { describe, expect, it } from "vitest";
import { webSearchUrl } from "../shared/links";

describe("webSearchUrl", () => {
  it("builds a Google search URL for a simple query", () => {
    expect(webSearchUrl("Nemo")).toBe("https://www.google.com/search?q=Nemo");
  });

  it("encodes spaces in a multi-word product name", () => {
    expect(webSearchUrl("Nemo Hornet Elite OSMO 2P")).toBe(
      "https://www.google.com/search?q=Nemo%20Hornet%20Elite%20OSMO%202P",
    );
  });

  it("encodes special characters", () => {
    // & / ? # + and unicode must all be percent-encoded so the query is literal
    expect(webSearchUrl("Sea to Summit Spark Sp III · 18°F & down")).toBe(
      "https://www.google.com/search?q=Sea%20to%20Summit%20Spark%20Sp%20III%20%C2%B7%2018%C2%B0F%20%26%20down",
    );
  });
});
