import type { Metadata } from "next";
import { CartClient } from "@/components/cart/cart-client";

export const metadata: Metadata = {
  title: "Your cart",
  description:
    "Review your ShopMate AI cart, adjust quantities, and start a labeled PayPal Sandbox approval. Capture is not implemented.",
};

export default function CartPage() {
  return <CartClient />;
}
