#!/usr/bin/env node
/**
 * ShopMate AI — Phase 3 end-to-end catalog checks.
 *
 * Runs against a running dev/production server and exercises the product
 * catalog API scenarios from the Phase 3 test matrix:
 *
 *   1. successful search            6. missing images (schema-level)
 *   2. search with no results       7. missing prices (normalizer policy)
 *   3. invalid search query         8. currency handling
 *   4. provider auth failure        9. product details (+404/+400)
 *   5. provider timeout            10. demo fallback labeling
 *
 * Usage:
 *   node scripts/phase3-checks.mjs --base http://localhost:3000 \
 *        --expect-source channel3|demo [--expect-fallback <reason>]
 *
 * Scenarios 4 and 5 are exercised by starting extra dev instances with
 * CHANNEL3_API_KEY=invalid (auth failure) and CHANNEL3_BASE_URL pointing at
 * a non-responding stub plus CHANNEL3_TIMEOUT_MS=1000 (timeout — the client
 * clamps timeouts to a 1s minimum, so a sub-second value never fires).
 * Exit code 0 = all checks passed.
 */

const args = process.argv.slice(2);
function argValue(name) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

const base = (argValue("base") ?? "http://localhost:3000").replace(/\/$/, "");
const expectSource = argValue("expect-source");
const expectFallback = argValue("expect-fallback");

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function getJson(path) {
  const response = await fetch(`${base}${path}`, { headers: { accept: "application/json" } });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return { status: response.status, payload };
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function assertProductShape(product, label) {
  check(`${label}: id is a non-empty string`, isNonEmptyString(product.id));
  check(`${label}: name is a non-empty string`, isNonEmptyString(product.name));
  check(
    `${label}: price is a finite non-negative number`,
    typeof product.price === "number" && Number.isFinite(product.price) && product.price >= 0,
    `price=${product.price}`,
  );
  check(
    `${label}: currency is a 3-letter uppercase code`,
    typeof product.currency === "string" && /^[A-Z]{3}$/.test(product.currency),
    `currency=${product.currency}`,
  );
  check(
    `${label}: availability is a known value`,
    ["in_stock", "out_of_stock", "limited", "unknown"].includes(product.availability),
    `availability=${product.availability}`,
  );
  check(
    `${label}: images is an array of strings (possibly empty — UI falls back to drawn tile)`,
    Array.isArray(product.images) && product.images.every((src) => typeof src === "string"),
  );
  check(
    `${label}: source is an explicit identifier`,
    product.source === "channel3" || product.source === "demo",
    `source=${product.source}`,
  );
  check(
    `${label}: demo flag agrees with source`,
    product.source === "demo" ? product.demo === true : product.demo === false,
  );
  check(
    `${label}: ratings never fabricated (0 or a 0–5 value with review count)`,
    (product.ratings === 0 && product.reviews === 0) ||
      (typeof product.ratings === "number" &&
        product.ratings >= 0 &&
        product.ratings <= 5 &&
        Number.isInteger(product.reviews) &&
        product.reviews >= 0),
    `ratings=${product.ratings}, reviews=${product.reviews}`,
  );
  if (product.source === "channel3") {
    check(`${label}: merchant attribution present`, isNonEmptyString(product.merchant));
    check(
      `${label}: buy URL is https`,
      typeof product.buyUrl === "string" && product.buyUrl.startsWith("https://"),
    );
  }
}

async function main() {
  console.log(`Phase 3 catalog checks against ${base}`);

  /* 3. Invalid search query ------------------------------------------ */
  {
    const missing = await getJson("/api/products/search");
    check("invalid query (missing ?q=) is rejected with 400", missing.status === 400);
    check(
      "invalid query response is a structured error",
      missing.payload?.success === false && missing.payload?.error === "invalid_query",
    );

    const empty = await getJson("/api/products/search?q=");
    check("empty ?q= is rejected with 400", empty.status === 400);

    const control = await getJson(`/api/products/search?q=${encodeURIComponent("bad\u0001query")}`);
    check("control characters in ?q= are rejected with 400", control.status === 400);

    const tooLong = await getJson(`/api/products/search?q=${"x".repeat(201)}`);
    check("overlong ?q= is rejected with 400", tooLong.status === 400);

    const badLimit = await getJson("/api/products/search?q=headphones&limit=999");
    check("out-of-range limit is clamped, not an error", badLimit.status === 200);
  }

  /* 1. Successful search --------------------------------------------- */
  let firstProductId = null;
  {
    const search = await getJson("/api/products/search?q=" + encodeURIComponent("wireless headphones"));
    check("search returns 200", search.status === 200);
    check("search payload has success:true", search.payload?.success === true);
    check(
      `search source is ${expectSource ?? "channel3|demo"}`,
      expectSource ? search.payload?.source === expectSource : ["channel3", "demo"].includes(search.payload?.source),
      `source=${search.payload?.source}`,
    );
    if (expectFallback) {
      check(
        `fallback reason is ${expectFallback}`,
        search.payload?.fallback?.reason === expectFallback,
        `fallback=${JSON.stringify(search.payload?.fallback)}`,
      );
      check(
        "fallback keeps success:true with labeled demo data",
        search.payload?.success === true && search.payload?.source === "demo",
      );
    } else if (search.payload?.source === "channel3") {
      check("live search carries no fallback marker", search.payload?.fallback === undefined);
    }
    check("products is an array", Array.isArray(search.payload?.products));
    check(
      "count equals products.length",
      search.payload?.count === search.payload?.products?.length,
    );

    const products = search.payload?.products ?? [];
    if (products.length > 0) {
      firstProductId = products[0].id;
      assertProductShape(products[0], "search[0]");
      const currencies = new Set(products.map((p) => p.currency));
      check(
        "every product carries an explicit currency (8. currency handling)",
        [...currencies].every((c) => /^[A-Z]{3}$/.test(c)),
        `currencies=${[...currencies].join(",")}`,
      );
      check(
        "every product has a finite price or was dropped (7. missing prices policy)",
        products.every((p) => typeof p.price === "number" && Number.isFinite(p.price)),
      );
      if (search.payload?.source === "channel3") {
        check(
          "live products preserve merchant + buy URL (source attribution)",
          products.every((p) => isNonEmptyString(p.merchant) && isNonEmptyString(p.buyUrl)),
        );
      }
    } else {
      check("search returned at least one product", false, "empty result set for a common query");
    }
  }

  /* 2. Search with no results ---------------------------------------- */
  {
    const none = await getJson("/api/products/search?q=" + encodeURIComponent("zzqqxx12345-no-such-product"));
    check("no-results search still succeeds with 200", none.status === 200);
    check(
      "no-results payload is structurally consistent",
      none.payload?.success === true &&
        none.payload?.count === (none.payload?.products ?? []).length,
    );
    if (expectSource === "channel3") {
      // The live catalog fuzzy-matches gibberish queries (it happily returns
      // real titles containing "no such …"), so a zero-result guarantee only
      // exists against the deterministic demo catalog. Assert that whatever
      // comes back is still well-formed live data.
      check(
        "live search on gibberish query returns well-formed products",
        (none.payload?.products ?? []).every(
          (p) => p?.source === "channel3" && typeof p?.price === "number" && typeof p?.currency === "string",
        ),
      );
    } else {
      check("no-results payload reports count 0", none.payload?.count === 0);
      check("no-results products array is empty", Array.isArray(none.payload?.products) && none.payload.products.length === 0);
    }
  }

  /* 9. Product details ----------------------------------------------- */
  {
    if (firstProductId) {
      const detail = await getJson(`/api/products/${encodeURIComponent(firstProductId)}`);
      check("detail for a search result returns 200", detail.status === 200);
      check("detail payload echoes the same id", detail.payload?.product?.id === firstProductId);
      check(
        "detail source matches its record",
        detail.payload?.source === (expectSource ?? detail.payload?.source),
      );
      assertProductShape(detail.payload?.product ?? {}, "detail");
    } else {
      check("detail for a search result returns 200", false, "no search result to look up");
    }

    const demoDetail = await getJson("/api/products/demo-aurora-headphones");
    check("demo product detail resolves with source demo", demoDetail.status === 200 && demoDetail.payload?.source === "demo");

    const unknownDemo = await getJson("/api/products/demo-nonexistent");
    check("unknown demo id returns 404", unknownDemo.status === 404);

    const unknownLive = await getJson("/api/products/nonexistent-product-000");
    check(
      "unknown live id returns 404 or labeled provider error (never demo data)",
      [404, 502, 504].includes(unknownLive.status) && unknownLive.payload?.source !== "demo",
      `status=${unknownLive.status}`,
    );

    const traversal = await getJson(`/api/products/${encodeURIComponent("../etc/passwd")}`);
    check("path-like id is rejected (never arbitrary URL fetching)", [400, 404].includes(traversal.status), `status=${traversal.status}`);

    const badChars = await getJson(`/api/products/${encodeURIComponent("bad id!")}`);
    check("id with spaces/symbols is rejected with 400", badChars.status === 400);
  }

  /* Summary ----------------------------------------------------------- */
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("Failures:");
    for (const failure of failures) console.log(`  - ${failure}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Check run crashed:", error);
  process.exit(1);
});
