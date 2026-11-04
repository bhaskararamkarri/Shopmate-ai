import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingState } from "@/components/shop/loading-state";
import { ChatClient } from "@/components/chat/chat-client";

export const metadata: Metadata = {
  title: "AI Shopping Assistant",
  description:
    "Chat with the ShopMate AI shopping agent: describe what you need and get ranked demo picks with honest trade-offs.",
};

/**
 * The chat waits on searchParams (?q=...), which makes the scope dynamic
 * under `cacheComponents`; the static shell streams first.
 */
async function ChatQueryScope({
  searchParams,
}: {
  searchParams: PageProps<"/chat">["searchParams"];
}) {
  const params = await searchParams;
  const query = Array.isArray(params.q) ? params.q[0] : params.q;

  return <ChatClient initialQuery={query} />;
}

export default function ChatPage(props: PageProps<"/chat">) {
  return (
    <Suspense fallback={<ChatFallback />}>
      <ChatQueryScope searchParams={props.searchParams} />
    </Suspense>
  );
}

function ChatFallback() {
  return (
    <section
      aria-busy="true"
      aria-label="Loading the AI shopping chat"
      className="flex h-[calc(100svh-4rem)] w-full flex-col"
    >
      <div className="border-b border-border">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-4 md:px-6">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-48 rounded-md" />
            <Skeleton className="h-3 w-64 rounded-md" />
          </div>
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center px-4">
        <LoadingState variant="chat-bubble" className="w-full max-w-2xl" />
      </div>
    </section>
  );
}
