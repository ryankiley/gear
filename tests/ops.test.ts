import { describe, expect, it } from "vitest";
import { applyOps, type Op } from "../shared/ops";
import type { ListState } from "../shared/types";

const base = (): ListState => ({
  title: "T",
  displayUnit: "g",
  folders: [
    { id: "f1", name: "Pack", defaultClassification: "base", sortOrder: 0 },
    { id: "f2", name: "Body", defaultClassification: "worn", sortOrder: 1 },
  ],
  items: [],
  version: 1,
});

describe("op reducer", () => {
  it("adds items, idempotent on duplicate id", () => {
    const s = base();
    const item = {
      id: "i1",
      folderId: "f1",
      name: "Tent",
      unitWeightMg: 538000,
      qty: 1,
      classification: null,
      sortOrder: 0,
    };
    applyOps(s, [{ t: "addItem", item } as Op, { t: "addItem", item } as Op]);
    expect(s.items.length).toBe(1);
    expect(s.items[0].name).toBe("Tent");
  });

  it("updates an item with a clamped patch", () => {
    const s = base();
    applyOps(s, [
      { t: "addItem", item: { id: "i1", folderId: "f1", name: "X", unitWeightMg: 0, qty: 1, classification: null, sortOrder: 0 } },
      { t: "updateItem", id: "i1", patch: { qty: -5, unitWeightMg: 12345.7, name: "Y" } },
    ]);
    expect(s.items[0].qty).toBe(0); // clamped to >= 0
    expect(s.items[0].unitWeightMg).toBe(12346); // rounded
    expect(s.items[0].name).toBe("Y");
  });

  it("removes a folder and its items", () => {
    const s = base();
    applyOps(s, [
      { t: "addItem", item: { id: "i1", folderId: "f2", name: "Jacket", unitWeightMg: 300000, qty: 1, classification: null, sortOrder: 0 } },
      { t: "removeFolder", id: "f2" },
    ]);
    expect(s.folders.some((f) => f.id === "f2")).toBe(false);
    expect(s.items.length).toBe(0);
  });

  it("setMeta updates title + unit, ignores bad unit", () => {
    const s = base();
    applyOps(s, [{ t: "setMeta", patch: { title: "JMT", displayUnit: "oz" } }]);
    expect(s.title).toBe("JMT");
    expect(s.displayUnit).toBe("oz");
    applyOps(s, [{ t: "setMeta", patch: { displayUnit: "stone" as any } }]);
    expect(s.displayUnit).toBe("oz"); // unchanged
  });

  it("independent adds from two editors both land (merge)", () => {
    // simulate server applying editor A then editor B's op onto the same base
    const server = base();
    applyOps(server, [{ t: "addItem", item: { id: "a", folderId: "f1", name: "A", unitWeightMg: 1000, qty: 1, classification: null, sortOrder: 0 } }]);
    applyOps(server, [{ t: "addItem", item: { id: "b", folderId: "f1", name: "B", unitWeightMg: 2000, qty: 1, classification: null, sortOrder: 1 } }]);
    expect(server.items.map((i) => i.id).sort()).toEqual(["a", "b"]);
  });

  it("ignores malformed ops without throwing", () => {
    const s = base();
    expect(() => applyOps(s, [{} as Op, { t: "updateItem", id: "nope", patch: {} } as Op])).not.toThrow();
  });
});
