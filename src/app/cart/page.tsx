import type { Metadata } from "next";
import { CartClient } from "@/components/cart/cart-client";

export const metadata: Metadata = {
  title: "Your cart",
  description:
    "Review your ShopMate AI cart, adjust quantities, and complete a labeled PayPal Sandbox approval with server-verified capture. No goods are shipped.",
};

export default function CartPage() {
  return <CartClient />;
}
