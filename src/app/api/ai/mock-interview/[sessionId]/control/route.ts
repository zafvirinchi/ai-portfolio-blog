import { NextResponse } from "next/server";

import { Difficulty } from "@/lib/ai/mock-interview/session-schema";
import { sessionService } from "@/lib/ai/mock-interview/session-service";

export const maxDuration = 30;

type Params = {
  params: Promise<{ sessionId: string }>;
};

const DIFFICULTY_STEP: Record<"harder" | "easier", Difficulty> = {
  harder: "Hard",
  easier: "Easy",
};

export async function POST(req: Request, { params }: Params) {
  const { sessionId } = await params;

  try {
    const { action, difficulty } = await req.json();

    switch (action) {
      case "pause":
        return NextResponse.json(sessionService.pause(sessionId));
      case "resume":
        return NextResponse.json(sessionService.resume(sessionId));
      case "restart":
        return NextResponse.json(await sessionService.restart(sessionId));
      case "skip":
        return NextResponse.json(await sessionService.skip(sessionId));
      case "previous":
        return NextResponse.json(sessionService.previous(sessionId));
      case "next":
        return NextResponse.json(sessionService.next(sessionId));
      case "end":
        return NextResponse.json(await sessionService.end(sessionId));
      case "harder":
      case "easier": {
        // "Give me a harder/easier question" — sets the one-shot difficulty
        // override, then abandons the current question in favor of a fresh
        // one at that difficulty (same underlying transition as "skip").
        sessionService.setDifficulty(sessionId, DIFFICULTY_STEP[action as "harder" | "easier"]);
        return NextResponse.json(await sessionService.skip(sessionId));
      }
      case "setDifficulty": {
        if (difficulty !== "Easy" && difficulty !== "Medium" && difficulty !== "Hard") {
          return NextResponse.json({ error: "difficulty must be Easy, Medium, or Hard" }, { status: 400 });
        }

        return NextResponse.json(sessionService.setDifficulty(sessionId, difficulty));
      }
      default:
        return NextResponse.json(
          { error: "action must be one of: pause, resume, restart, skip, previous, next, end, harder, easier, setDifficulty" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("[mock-interview] Control route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Session control action failed" }, { status: 422 });
  }
}
