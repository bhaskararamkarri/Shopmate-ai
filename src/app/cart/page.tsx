import type { Metadata } from "next";
import { CartClient } from "@/components/cart/cart-client";

export const metadata: Metadata = {
  title: "Your cart",
  description:
    "Review your ShopMate AI cart: adjust quantities, remove items, and see an estimated total before checkout goes live.",
};

export default function CartPage() {
  return <CartClient />;
}
