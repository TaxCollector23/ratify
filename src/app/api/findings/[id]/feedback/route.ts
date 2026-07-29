import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { findings, findingFeedback } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";
import { eq } from "drizzle-orm";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  verdict: z.enum(["accepted", "false_positive", "needs_context", "exception"]),
  comment: z.string().max(2000).optional(),
});

/**
 * POST /api/findings/:id/feedback
 *
 * Records a signed-in user's verdict on a specific finding — the primary
 * signal that closes the loop between "Ratify said X" and "reviewers
 * agreed / disagreed / thought it was a false positive". Idempotent per
 * (finding, user): posting again updates the existing verdict.
 *
 * The confidence score on the underlying finding is adjusted here too —
 * accepted feedback nudges confidence up, false_positive nudges it down —
 * so subsequent findings citing the same rule can inherit a calibrated
 * prior. The math is intentionally gentle; a single user's disagreement
 * shouldn't flip a rule off entirely.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "You must be signed in to leave feedback." }, { status: 401 });
  }

  const { id: findingId } = await params;

  let parsedBody;
  try {
    parsedBody = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "Invalid feedback body. `verdict` must be one of accepted, false_positive, needs_context, exception.", detail: String(err) },
      { status: 400 },
    );
  }

  const [existingFinding] = await db.select().from(findings).where(eq(findings.id, findingId));
  if (!existingFinding) {
    return NextResponse.json({ error: "Finding not found." }, { status: 404 });
  }

  // Upsert the feedback row.
  await db
    .insert(findingFeedback)
    .values({
      findingId,
      firebaseUid: session.uid,
      verdict: parsedBody.verdict,
      comment: parsedBody.comment ?? null,
    })
    .onConflictDoUpdate({
      target: [findingFeedback.findingId, findingFeedback.firebaseUid],
      set: { verdict: parsedBody.verdict, comment: parsedBody.comment ?? null, createdAt: new Date() },
    });

  // Gentle confidence nudge. Never let a single user push confidence below
  // 0.2 or above 0.98 — leaves room for corroboration + never fully removes
  // a deterministic-check finding just because one reviewer disagreed.
  const delta =
    parsedBody.verdict === "accepted" ? +0.03 :
    parsedBody.verdict === "exception" ? -0.02 :
    parsedBody.verdict === "false_positive" ? -0.08 :
    0; // needs_context: no confidence change, just signal
  if (delta !== 0) {
    const next = Math.min(0.98, Math.max(0.2, existingFinding.confidence + delta));
    await db.update(findings).set({ confidence: next }).where(eq(findings.id, findingId));
  }

  return NextResponse.json({ ok: true, verdict: parsedBody.verdict });
}
