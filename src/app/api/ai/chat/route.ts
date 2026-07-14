import { NextResponse } from "next/server";
import { conversationService } from "@/lib/ai/services/conversation.service";
import { resumeRequestContext } from "@/lib/ai/resume";
import { interviewSourcesContext } from "@/lib/ai/interview-chat";
import type { InterviewSourceSummary } from "@/lib/ai/interview-chat";

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
        const withResumeContext = () =>
            typeof resumeId === "string" && resumeId
                ? resumeRequestContext.run({ resumeId }, askQuestion)
                : askQuestion();

        // interview-tool populates this store (if present) with rich
        // {category, topic, question, difficulty} source attribution when
        // it answers from the imported interview database — additive only,
        // every existing caller/response shape is unaffected.
        const interviewStore: { sources: InterviewSourceSummary[] } = { sources: [] };
        const response = await interviewSourcesContext.run(interviewStore, withResumeContext);

        return NextResponse.json(
            interviewStore.sources.length > 0
                ? { ...response, interviewSources: interviewStore.sources }
                : response
        );

    } catch (error) {

        console.error(error);

        return NextResponse.json(
            { error: "AI Error" },
            { status: 500 }
        );

    }

}