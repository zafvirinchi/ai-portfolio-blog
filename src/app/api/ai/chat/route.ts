import { NextResponse } from "next/server";
import { conversationService } from "@/lib/ai/services/conversation.service";
import { resumeRequestContext } from "@/lib/ai/resume";

export async function POST(req: Request) {

    try {

        const { message, history, resumeId } = await req.json();

        if (!message) {

            return NextResponse.json(
                { error: "Message required" },
                { status: 400 }
            );

        }

        const askQuestion = () =>
            conversationService.ask(
                message,
                Array.isArray(history) ? history : []
            );

        // Optional: when the resume-analyzer chat panel sends a resumeId,
        // resume-tool (routed to automatically by the planner for
        // resume-related questions) picks it up via this request-scoped
        // context — existing callers that never send resumeId are
        // unaffected, since askQuestion() runs exactly as before.
        const response =
            typeof resumeId === "string" && resumeId
                ? await resumeRequestContext.run({ resumeId }, askQuestion)
                : await askQuestion();

        return NextResponse.json(response);

    } catch (error) {

        console.error(error);

        return NextResponse.json(
            { error: "AI Error" },
            { status: 500 }
        );

    }

}