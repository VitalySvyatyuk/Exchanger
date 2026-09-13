import { db } from "@/lib/db";

export async function GET() {
  const startedAt = performance.now();

  try {
    await db.$queryRaw`SELECT 1`;

    return Response.json({
      status: "ok",
      database: "up",
      latencyMs: Math.round(performance.now() - startedAt),
    });
  } catch (error) {
    console.error("Health check failed:", error);

    return Response.json(
      { status: "error", database: "down" },
      { status: 503 },
    );
  }
}
