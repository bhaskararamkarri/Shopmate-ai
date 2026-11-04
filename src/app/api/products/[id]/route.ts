/**
 * ShopMate AI — product detail API (GET /api/products/[id]).
 *
 * Returns one verified product record:
 * - `demo-*` ids resolve from the isolated demo catalog (labeled demo data).
 * - other ids are validated and forwarded to the free, always-fresh Channel3
 *   detail endpoint (`GET /v1/products/{product_id}`). Per Channel3's caching
 *   guidance, prices, availability and offer URLs are fetched fresh and never
 *   served from a cache.
 *
 * SECURITY RULES:
 * - Ids are strictly pattern-validated, so a request can never steer this
 *   route into arbitrary-path or arbitrary-host fetching. The outbound URL is
 *   always `https://api.trychannel3.com/v1/products/<encoded-id>`.
 * - Provider failures return a machine-readable reason (no secrets) and never
 *   substitute a demo record for a live product id.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCatalogProduct } from "@/lib/catalog/provider";
import { CatalogError } from "@/lib/catalog/types";

/** Demo catalog ids ("demo-aurora-headphones") and live Channel3 ids. */
const PRODUCT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!PRODUCT_ID_PATTERN.test(id)) {
    return NextResponse.json(
      {
        success: false,
        error: "invalid_id",
        message: "The product id contains unsupported characters.",
      },
      { status: 400 },
    );
  }

  try {
    const found = await getCatalogProduct(id);
    if (!found) {
      return NextResponse.json(
        { success: false, error: "not_found" },
        { status: 404 },
      );
    }
    return NextResponse.json(
      {
        success: true,
        source: found.source,
        product: found.product,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    if (error instanceof CatalogError) {
      // Live provider failure: report it honestly instead of answering a
      // live product id with a demo record.
      return NextResponse.json(
        {
          success: false,
          error: error.reason === "timeout" ? "timeout" : "provider_error",
          reason: error.reason,
        },
        { status: error.reason === "timeout" ? 504 : 502 },
      );
    }
    return NextResponse.json(
      { success: false, error: "internal_error" },
      { status: 500 },
    );
  }
}
