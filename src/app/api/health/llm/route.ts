import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Diagnostics-only endpoint: sends a trivial prompt to OpenRouter and reports
 * whether the LLM path is reachable. Useful for confirming a new key / model
 * without needing to open a real pull request. Not linked from the UI.
 */
export async function GET() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL ?? "google/gemma-4-26b-a4b-it:free";

  if (!apiKey) {
    return NextResponse.json(
      { ok: false, model, error: "OPENROUTER_API_KEY is not set." },
      { status: 503 },
    );
  }

  const started = Date.now();
  let res: Response;
  try {
    res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.RATIFY_PUBLIC_URL ?? "https://ratify-zeta-dusky.vercel.app",
        "X-Title": "Ratify",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "reply with the two chars OK and nothing else" }],
        temperature: 0,
        max_tokens: 10,
      }),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, model, error: `Network error: ${String(err)}` },
      { status: 502 },
    );
  }

  const durationMs = Date.now() - started;
  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (!res.ok || body.error) {
    return NextResponse.json(
      {
        ok: false,
        model,
        durationMs,
        status: res.status,
        error: body.error?.message ?? `HTTP ${res.status}`,
      },
      { status: 502 },
    );
  }

  const reply = body.choices?.[0]?.message?.content ?? "";
  return NextResponse.json({
    ok: true,
    model,
    durationMs,
    replyPreview: reply.slice(0, 80),
  });
}
