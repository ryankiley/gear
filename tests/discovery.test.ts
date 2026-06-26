import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";
import * as schema from "../server/db/schema";
import { lists } from "../server/db/schema";
import { LISTS_DDL } from "../server/utils/db";
import { sha256Hex } from "../server/utils/tokens";
import {
  bumpView,
  getFeed,
  getPublicBySlug,
  getPublishState,
  publishList,
  reportList,
} from "../server/utils/discoveryRepo";
import {
  cardFromRow,
  categorySegments,
  countLinks,
  decidePublish,
  isLikelySpam,
  normalizeLimit,
  normalizeSeason,
  normalizeTripType,
  normalizeView,
  sparkTop3,
} from "../shared/discovery";
import type { ListData } from "../shared/types";

// ===========================================================================
// Pure logic (no DB) — this is where the real feed logic lives + is tested.
// ===========================================================================

describe("facet normalizers — closed enums, sanitize by allow-list", () => {
  it("accepts known trip types (case/space-insensitive)", () => {
    expect(normalizeTripType("thru-hike")).toBe("thru-hike");
    expect(normalizeTripType("  Car-Camping ")).toBe("car-camping");
  });
  it("rejects anything else (no arbitrary strings into the feed)", () => {
    expect(normalizeTripType("<script>")).toBeUndefined();
    expect(normalizeTripType("")).toBeUndefined();
    expect(normalizeTripType(null)).toBeUndefined();
    expect(normalizeTripType(42)).toBeUndefined();
  });
  it("normalizes seasons the same way", () => {
    expect(normalizeSeason("THREE-season")).toBe("three-season");
    expect(normalizeSeason("monsoon")).toBeUndefined();
  });
});

describe("feed view + limit normalizers", () => {
  it("defaults to recent and clamps the limit", () => {
    expect(normalizeView(undefined)).toBe("recent");
    expect(normalizeView("light")).toBe("light");
    expect(normalizeView("garbage")).toBe("recent");
    expect(normalizeLimit("5")).toBe(5);
    expect(normalizeLimit(999)).toBe(60); // FEED_LIMIT_MAX
    expect(normalizeLimit("nope")).toBe(24); // default
    expect(normalizeLimit(-3)).toBe(24);
  });
});

describe("spam heuristic — link count", () => {
  it("counts link-like tokens", () => {
    expect(countLinks("see https://a.com and www.b.net and c.shop")).toBe(3);
    expect(countLinks("a calm note about my tent")).toBe(0);
  });
  it("flags link-heavy public text", () => {
    expect(isLikelySpam({ title: "CHEAP", description: "https://a.com https://b.com c.shop d.store" })).toBe(true);
    expect(isLikelySpam({ title: "My PCT kit", description: "Tested over 200 miles" })).toBe(false);
  });
});

describe("decidePublish — the publish rule (pure)", () => {
  it("publishes a clean list (stamps published_at once, not flagged)", () => {
    const d = decidePublish({ hasPublishedAt: false, title: "Kit", description: "" }, { isPublic: true });
    expect(d).toEqual({ isPublic: true, flagged: false, stampPublishedAt: true });
  });
  it("does not re-stamp published_at on a republish", () => {
    const d = decidePublish({ hasPublishedAt: true }, { isPublic: true });
    expect(d.stampPublishedAt).toBe(false);
  });
  it("flags a link-spam list (withheld from the feed — never a status change)", () => {
    const d = decidePublish(
      { hasPublishedAt: false, description: "https://a.com https://b.com c.shop" },
      { isPublic: true },
    );
    expect(d.flagged).toBe(true);
  });
  it("unpublishing never flags and never stamps", () => {
    const d = decidePublish({ hasPublishedAt: true }, { isPublic: false });
    expect(d).toEqual({ isPublic: false, flagged: false, stampPublishedAt: false });
  });
});

const dataWithWeights = (): ListData => ({
  folders: [
    { id: "f1", name: "Shelter", colorKey: "shelter", defaultClassification: "base", sortOrder: 0 },
    { id: "f2", name: "Sleep", colorKey: "sleep", defaultClassification: "base", sortOrder: 1 },
    { id: "f3", name: "Pack", colorKey: "pack", defaultClassification: "base", sortOrder: 2 },
    { id: "f4", name: "Kitchen", colorKey: "kitchen", defaultClassification: "base", sortOrder: 3 },
  ],
  items: [
    { id: "i1", folderId: "f1", name: "Tent", unitWeightMg: 500_000, qty: 1, classification: null, sortOrder: 0 },
    { id: "i2", folderId: "f2", name: "Quilt", unitWeightMg: 400_000, qty: 1, classification: null, sortOrder: 0 },
    { id: "i3", folderId: "f3", name: "Pack", unitWeightMg: 300_000, qty: 1, classification: null, sortOrder: 0 },
    { id: "i4", folderId: "f4", name: "Stove", unitWeightMg: 100_000, qty: 1, classification: null, sortOrder: 0 },
  ],
});

describe("category sparkline (the one colour on a card)", () => {
  it("sums folder weights, top-3 + rolls the rest into other", () => {
    const segs = categorySegments(dataWithWeights());
    expect(segs.map((s) => s.colorKey)).toEqual(["shelter", "sleep", "pack", "kitchen"]);
    const top = sparkTop3(dataWithWeights());
    expect(top).toHaveLength(4); // top 3 + an "other" remainder
    expect(top[3]).toMatchObject({ colorKey: "other", mg: 100_000 });
    expect(top.slice(0, 3).map((s) => s.colorKey)).toEqual(["shelter", "sleep", "pack"]);
  });
  it("returns nothing for a weightless list (weight is optional)", () => {
    const empty: ListData = {
      folders: [{ id: "f1", name: "X", defaultClassification: "base", sortOrder: 0 }],
      items: [{ id: "i1", folderId: "f1", name: "Thing", unitWeightMg: 0, qty: 1, classification: null, sortOrder: 0 }],
    };
    expect(sparkTop3(empty)).toEqual([]);
  });
});

describe("cardFromRow — public shape, never leaks the id", () => {
  it("maps a row to a card with only public fields", () => {
    const card = cardFromRow({
      publicSlug: "my-kit-abc123",
      shareCode: "ABC123XYZ789",
      title: "My kit",
      itemCount: 4,
      tripType: "thru-hike",
      season: "three-season",
      baseWeightMg: 1_300_000,
      totalWeightMg: 1_300_000,
      publishedAt: new Date("2026-06-01T00:00:00Z"),
      data: dataWithWeights(),
    });
    expect(card.slug).toBe("my-kit-abc123");
    expect(card.tripTypeLabel).toBe("Thru-hike");
    expect(card.seasonLabel).toBe("Three-season");
    expect(card.hasWeights).toBe(true);
    expect(card.spark.length).toBeGreaterThan(0);
    expect(card).not.toHaveProperty("id");
    expect(card.publishedAt).toBe("2026-06-01T00:00:00.000Z");
  });
  it("marks a weightless list as hasWeights:false", () => {
    const card = cardFromRow({
      publicSlug: "s", shareCode: "c", title: "t", itemCount: 1,
      baseWeightMg: 0, totalWeightMg: 0, data: { folders: [], items: [] },
    });
    expect(card.hasWeights).toBe(false);
    expect(card.spark).toEqual([]);
  });
});

// ===========================================================================
// Repo against a fresh in-memory PGlite (mirrors catalog.test.ts).
// ===========================================================================

async function freshDb() {
  const db = drizzle(new PGlite(), { schema });
  for (const stmt of LISTS_DDL) await db.execute(sql.raw(stmt));
  return db;
}

let seq = 0;
async function seed(
  db: Awaited<ReturnType<typeof freshDb>>,
  o: Partial<typeof lists.$inferInsert> & { editToken?: string } = {},
) {
  seq++;
  const editToken = o.editToken ?? `tok-${seq}`;
  const [row] = await db
    .insert(lists)
    .values({
      publicSlug: o.publicSlug ?? `list-${seq}-aaa${seq}`,
      editTokenHash: sha256Hex(editToken),
      shareCode: o.shareCode ?? `SHARECODE${seq}00`,
      title: o.title ?? `List ${seq}`,
      description: o.description ?? null,
      data: o.data ?? { folders: [], items: [] },
      itemCount: o.itemCount ?? 0,
      baseWeightMg: o.baseWeightMg ?? 0,
      totalWeightMg: o.totalWeightMg ?? 0,
      isPublic: o.isPublic ?? false,
      status: o.status ?? "active",
      flagged: o.flagged ?? false,
      publishedAt: o.publishedAt ?? null,
      tripType: o.tripType ?? null,
      season: o.season ?? null,
      viewCount: o.viewCount ?? 0,
    })
    .returning();
  return { row: row!, editToken };
}

describe("publishList — capability write, decision applied", () => {
  it("publishes by edit token, stamps published_at, returns only public address", async () => {
    const db = await freshDb();
    const { editToken, row } = await seed(db, { itemCount: 3 });
    const state = await publishList(editToken, { isPublic: true, tripType: "thru-hike", season: "summer" }, db);
    expect(state).toMatchObject({ isPublic: true, status: "active", tripType: "thru-hike", season: "summer", slug: row.publicSlug });
    expect(state).not.toHaveProperty("id");
    expect(state).not.toHaveProperty("editTokenHash");
    const after = (await db.select().from(lists))[0]!;
    expect(after.isPublic).toBe(true);
    expect(after.publishedAt).toBeInstanceOf(Date);
  });

  it("flags a link-spam list but keeps it active (owner not locked out)", async () => {
    const db = await freshDb();
    const { editToken } = await seed(db, { itemCount: 2, description: "https://a.com https://b.com c.shop d.store" });
    const state = await publishList(editToken, { isPublic: true }, db);
    expect(state?.flagged).toBe(true);
    expect(state?.status).toBe("active"); // status untouched → /e + /s still resolve
  });

  it("flagging is sticky — a clean republish can't self-clear it", async () => {
    const db = await freshDb();
    const { editToken } = await seed(db, { itemCount: 1, flagged: true });
    const state = await publishList(editToken, { isPublic: true }, db);
    expect(state?.flagged).toBe(true);
  });

  it("rejects an unknown trip type (drops to null)", async () => {
    const db = await freshDb();
    const { editToken } = await seed(db, { itemCount: 1 });
    const state = await publishList(editToken, { isPublic: true, tripType: "moon-mission" }, db);
    expect(state?.tripType).toBeUndefined();
  });

  it("returns null for a bad/unknown edit token (→ 404 at the endpoint)", async () => {
    const db = await freshDb();
    expect(await publishList("nope", { isPublic: true }, db)).toBeNull();
    expect(await getPublishState("nope", db)).toBeNull();
  });
});

describe("getPublicBySlug — public-only, no id/token leak", () => {
  it("resolves a public list and omits id + edit token", async () => {
    const db = await freshDb();
    const { row } = await seed(db, { itemCount: 2, isPublic: true, publishedAt: new Date() });
    const view = await getPublicBySlug(row.publicSlug, db);
    expect(view).toBeTruthy();
    expect(view).not.toHaveProperty("id");
    expect(view).not.toHaveProperty("editTokenHash");
    expect(view!.slug).toBe(row.publicSlug);
  });
  it("404s (null) for a private list — no oracle", async () => {
    const db = await freshDb();
    const { row } = await seed(db, { itemCount: 2, isPublic: false });
    expect(await getPublicBySlug(row.publicSlug, db)).toBeNull();
  });
  it("404s (null) for an admin-hidden list (status takedown)", async () => {
    const db = await freshDb();
    const { row } = await seed(db, { itemCount: 2, isPublic: true, status: "hidden" });
    expect(await getPublicBySlug(row.publicSlug, db)).toBeNull();
  });
  it("404s (null) for a flagged (reported/spam) list — withheld from public discovery", async () => {
    const db = await freshDb();
    const { row } = await seed(db, { itemCount: 2, isPublic: true, flagged: true });
    expect(await getPublicBySlug(row.publicSlug, db)).toBeNull();
  });
  it("404s (null) for a malformed slug before any query", async () => {
    const db = await freshDb();
    expect(await getPublicBySlug("not a slug!!", db)).toBeNull();
  });
});

describe("getFeed — filters + sort", () => {
  async function feedFixture() {
    const db = await freshDb();
    // light, recent-ish
    await seed(db, { isPublic: true, itemCount: 5, baseWeightMg: 3_000_000, totalWeightMg: 3_000_000, publishedAt: new Date("2026-01-01"), viewCount: 1, tripType: "thru-hike" });
    // lightest
    await seed(db, { isPublic: true, itemCount: 5, baseWeightMg: 1_000_000, totalWeightMg: 1_000_000, publishedAt: new Date("2026-02-01"), viewCount: 9, tripType: "car-camping" });
    // newest, no weight
    await seed(db, { isPublic: true, itemCount: 5, baseWeightMg: 0, totalWeightMg: 0, publishedAt: new Date("2026-03-01"), viewCount: 3, tripType: "thru-hike" });
    // excluded: empty
    await seed(db, { isPublic: true, itemCount: 0, baseWeightMg: 500_000, publishedAt: new Date("2026-04-01") });
    // excluded: private
    await seed(db, { isPublic: false, itemCount: 5, baseWeightMg: 200_000, publishedAt: new Date("2026-05-01") });
    // excluded: hidden
    await seed(db, { isPublic: true, status: "hidden", itemCount: 5, baseWeightMg: 100_000, publishedAt: new Date("2026-06-01") });
    // excluded: flagged (reported/spam) — NEWEST, so its absence from `recent` proves exclusion
    await seed(db, { isPublic: true, flagged: true, itemCount: 5, baseWeightMg: 50_000, publishedAt: new Date("2026-07-01"), tripType: "thru-hike" });
    return db;
  }

  it("recent: newest first, hides empty/private/hidden", async () => {
    const db = await feedFixture();
    const cards = await getFeed({ view: "recent" }, db);
    expect(cards).toHaveLength(3);
    expect(cards[0]!.publishedAt!.startsWith("2026-03")).toBe(true);
  });
  it("popular: most-viewed first", async () => {
    const db = await feedFixture();
    const cards = await getFeed({ view: "popular" }, db);
    expect(cards[0]!.totalWeightMg).toBe(1_000_000); // the viewCount:9 one
  });
  it("light: lightest base weight first, weightless excluded", async () => {
    const db = await feedFixture();
    const cards = await getFeed({ view: "light" }, db);
    expect(cards).toHaveLength(2); // the zero-base one drops out
    expect(cards[0]!.baseWeightMg).toBe(1_000_000);
  });
  it("filters by trip type", async () => {
    const db = await feedFixture();
    const cards = await getFeed({ view: "recent", tripType: "thru-hike" }, db);
    expect(cards).toHaveLength(2);
    expect(cards.every((c) => c.tripType === "thru-hike")).toBe(true);
  });
});

describe("reportList + bumpView", () => {
  it("report withholds a list from the feed + read view but keeps the owner's access", async () => {
    const db = await freshDb();
    const { row } = await seed(db, { isPublic: true, itemCount: 3, baseWeightMg: 1_000_000, publishedAt: new Date() });
    expect(await getFeed({}, db)).toHaveLength(1);
    expect(await reportList(row.publicSlug, db)).toBe(true);
    expect(await getFeed({}, db)).toHaveLength(0);
    expect(await getPublicBySlug(row.publicSlug, db)).toBeNull();
    // owner is NOT locked out: status stays active, so listRepo's /e + /s still resolve
    const after = (await db.select().from(lists))[0]!;
    expect(after.status).toBe("active");
    expect(after.flagged).toBe(true);
    // idempotent: a second report on an already-flagged list changes nothing
    expect(await reportList(row.publicSlug, db)).toBe(false);
  });
  it("bumpView increments the counter for a public list", async () => {
    const db = await freshDb();
    const { row } = await seed(db, { isPublic: true, itemCount: 1, publishedAt: new Date() });
    await bumpView(row.publicSlug, db);
    await bumpView(row.publicSlug, db);
    const after = (await db.select().from(lists))[0]!;
    expect(after.viewCount).toBe(2);
  });
});
