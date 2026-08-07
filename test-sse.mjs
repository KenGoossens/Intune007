// Quick test to see raw SSE output from the streaming chat endpoint
async function main() {
  const res = await fetch("http://localhost:3001/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "hi", history: [] }),
  });

  console.log("Status:", res.status);
  console.log("Content-Type:", res.headers.get("content-type"));

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    console.log("--- CHUNK ---");
    console.log(JSON.stringify(chunk));
  }
  console.log("--- STREAM DONE ---");
}

main().catch(console.error);
