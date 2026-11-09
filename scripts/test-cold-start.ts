export {};

async function testLiveColdStart() {
  const url = "https://shopmate-f7rvw38on-bhaskararamkarris-projects.vercel.app/api/chat";
  const newConvId = "cold-start-test-" + Date.now();
  console.log("Testing live cold start with Channel3 re-fetch on new conversationId:", newConvId);
  
  const start = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conversationId: newConvId,
      message: "what is the capacity of this machine?",
      history: [],
      contextProductIds: ["prXIzEg"], // Bosch Serie 8 9kg from Channel3
    }),
  });
  
  const latency = Date.now() - start;
  const data = await res.json();
  console.log(`HTTP ${res.status} in ${latency}ms | Mode: ${data.mode} | Model: ${data.model}`);
  console.log("Shortlist product IDs:", data.products?.map((p: { id: string }) => p.id));
  console.log("Shortlist product names:", data.products?.map((p: { name: string }) => p.name));
  console.log("Assistant content:\n", data.content);
}

testLiveColdStart().catch(console.error);

