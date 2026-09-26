// Runs independently of browsers. In production use an authenticated scheduler
// calling the same endpoint, or supervise this process as a background service.
const secret = process.env.CRON_SECRET;
if (!secret)
  throw new Error("Set CRON_SECRET in .env.local before running the worker.");
const origin = process.env.CONVENE_WORKER_URL || "http://localhost:3000";
const url = new URL("/api/jobs/match", origin);
if (
  url.protocol !== "https:" &&
  !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
)
  throw new Error("Remote worker URLs must use HTTPS.");
const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => controller.abort());
console.log(
  "Matching worker running; checking the durable queue every minute.",
);
while (!controller.signal.aborted) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      redirect: "error",
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(55000)]),
    });
    if (!response.ok)
      console.error(
        `Matching worker returned HTTP ${response.status}. Check setup and server logs.`,
      );
    else {
      const result = await response.json();
      if (result.processed)
        console.log(
          `Processed ${result.processed} jobs; assigned ${result.assigned} plans.`,
        );
    }
  } catch {
    if (!controller.signal.aborted)
      console.error("Matching server unavailable; retrying in a minute.");
  }
  if (process.argv.includes("--once")) break;
  await new Promise((resolve) => {
    if (controller.signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      controller.signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, 60000);
    controller.signal.addEventListener("abort", done, { once: true });
  });
}
