import { NextResponse } from "next/server";
import { conversationService } from "@/lib/ai/services/conversation.service";
import { resumeRequestContext } from "@/lib/ai/resume";
import { jdMatchRequestContext } from "@/lib/ai/job-description/jd-service";
import { interviewPrepRequestContext } from "@/lib/ai/interview-prep/prep-service";
import { mockInterviewRequestContext } from "@/lib/ai/mock-interview/session-service";
import { rewriteRequestContext } from "@/lib/ai/resume-rewriter/rewrite-service";
import { coverRequestContext } from "@/lib/ai/cover-letter/cover-service";
import { linkedinRequestContext } from "@/lib/ai/linkedin/linkedin-service";
import { recruiterRequestContext } from "@/lib/ai/recruiter/candidate-service";
import { recruitmentRequestContext } from "@/lib/ai/recruitment/pipeline-service";
import { interviewSourcesContext } from "@/lib/ai/interview-chat";
import type { InterviewSourceSummary } from "@/lib/ai/interview-chat";
import { organizationRequestContext, getTenantContext } from "@/lib/saas/tenant-context";
import { authRequestContext } from "@/lib/auth/permission-service";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { checkCredits, consumeCredits } from "@/lib/billing/credit-service";
import { InsufficientCreditsError } from "@/lib/billing/billing-types";
import { withUsageContext } from "@/lib/ai/usage/usage-context";
import { InsufficientAiCreditsError } from "@/lib/ai/usage/usage-errors";

export async function POST(req: Request) {

    try {

        const { message, history, resumeId, jdMatchId, prepId, sessionId, rewriteId, coverLetterId, linkedinId, recruiterMode, recruitmentMode } = await req.json();

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

        // Optional: when the Recruitment Pipeline chat panel is active,
        // resume-tool picks it up via this request-scoped context
        // (innermost of all — like recruiterMode below, no single session
        // ID exists to key on) to drive "show top Java candidates", "who
        // has been waiting longest", "recommend candidates for [job
        // title]", "generate interview feedback summary", "show hiring
        // funnel" style requests. Existing callers that never send
        // recruitmentMode are unaffected.
        const withRecruitmentContext = () =>
            recruitmentMode === true ? recruitmentRequestContext.run({ active: true }, askQuestion) : askQuestion();

        // Optional: when the Recruiter Workspace chat panel is active,
        // resume-tool picks it up via this request-scoped context
        // (the workspace is a true singleton, so this carries a boolean
        // flag rather than an ID like every other context here) to drive
        // "who is the strongest Java candidate", "compare X and Y",
        // "recommend top 5 candidates" style requests. Existing callers
        // that never send recruiterMode are unaffected.
        const withRecruiterContext = () =>
            recruiterMode === true ? recruiterRequestContext.run({ active: true }, withRecruitmentContext) : withRecruitmentContext();

        // Optional: when a LinkedIn optimizer session is active, resume-tool
        // picks it up via this request-scoped context to drive "optimize
        // my linkedin"/"rewrite my headline"/"rewrite my about section"/
        // "generate recruiter summary"/"generate networking message"/
        // "improve linkedin seo" style requests. Existing callers that
        // never send linkedinId are unaffected.
        const withLinkedinContext = () =>
            typeof linkedinId === "string" && linkedinId
                ? linkedinRequestContext.run({ linkedinId }, withRecruiterContext)
                : withRecruiterContext();

        // Optional: when a cover-letter session is active, resume-tool
        // picks it up via this request-scoped context to drive "generate
        // cover letter"/"generate startup version"/"generate recruiter
        // email"/"generate LinkedIn message" style requests. Existing
        // callers that never send coverLetterId are unaffected.
        const withCoverContext = () =>
            typeof coverLetterId === "string" && coverLetterId
                ? coverRequestContext.run({ coverLetterId }, withLinkedinContext)
                : withLinkedinContext();

        // Optional: when a resume-rewrite session is active, resume-tool
        // picks it up via this request-scoped context to drive style/
        // section/domain-targeted rewrite requests ("rewrite my
        // experience", "make it more technical", "FAANG style").
        // Existing callers that never send rewriteId are unaffected.
        const withRewriteContext = () =>
            typeof rewriteId === "string" && rewriteId
                ? rewriteRequestContext.run({ rewriteId }, withCoverContext)
                : withCoverContext();

        // Optional: when a mock interview session is active, interview-tool
        // picks it up via this request-scoped context to drive session
        // commands ("ask next question", "evaluate my answer", "end
        // interview") and to treat a plain message as the candidate's
        // answer when a question is pending. Existing callers that never
        // send sessionId are unaffected.
        const withMockInterviewContext = () =>
            typeof sessionId === "string" && sessionId
                ? mockInterviewRequestContext.run({ sessionId }, withRewriteContext)
                : withRewriteContext();

        // Optional: when an interview-prep report has been generated,
        // resume-tool/interview-tool pick it up via this request-scoped
        // context, nested inside the JD-match one — existing callers that
        // never send prepId are unaffected.
        const withPrepContext = () =>
            typeof prepId === "string" && prepId
                ? interviewPrepRequestContext.run({ prepId }, withMockInterviewContext)
                : withMockInterviewContext();

        // Optional: when the resume-analyzer chat panel has also analyzed a
        // job description, resume-tool picks up the match result via this
        // request-scoped context, nested inside the resume one — existing
        // callers that never send jdMatchId are unaffected.
        const withJdMatchContext = () =>
            typeof jdMatchId === "string" && jdMatchId
                ? jdMatchRequestContext.run({ jdMatchId }, withPrepContext)
                : withPrepContext();

        // Optional: when the resume-analyzer chat panel sends a resumeId,
        // resume-tool (routed to automatically by the planner for
        // resume-related questions) picks it up via this request-scoped
        // context — existing callers that never send resumeId are
        // unaffected, since askQuestion() runs exactly as before.
        const withResumeContext = () =>
            typeof resumeId === "string" && resumeId
                ? resumeRequestContext.run({ resumeId }, withJdMatchContext)
                : withJdMatchContext();

        // interview-tool populates this store (if present) with rich
        // {category, topic, question, difficulty} source attribution when
        // it answers from the imported interview database — additive only,
        // every existing caller/response shape is unaffected.
        const interviewStore: { sources: InterviewSourceSummary[] } = { sources: [] };
        const withInterviewSources = () => interviewSourcesContext.run(interviewStore, withResumeContext);

        // Design decision 9 — resolved automatically server-side (never a
        // client-sent flag) whenever the requester is logged in with an
        // active organization; a pure no-op otherwise (every request
        // today, since these public AI pages remain fully anonymous-usable).
        const tenantContext = await getTenantContext();

        await checkCredits("ai_chat");

        const withOrganizationContext = () =>
            tenantContext
                ? organizationRequestContext.run(
                      { organizationId: tenantContext.organizationId, userId: tenantContext.userId, role: tenantContext.role },
                      withInterviewSources
                  )
                : withInterviewSources();

        // Phase 14 Milestone 2 — resolved independently of organization
        // membership (unlike tenantContext above), so "show my active
        // sessions"/"when did I last log in" work even for a logged-in
        // user with no organization yet.
        const supabaseAuth = await createSupabaseServerClient();
        const {
            data: { user: authUser },
        } = await supabaseAuth.auth.getUser();

        const withAuthContext = () =>
            authUser
                ? authRequestContext.run({ userId: authUser.id, email: authUser.email ?? null }, withOrganizationContext)
                : withOrganizationContext();

        // Phase 14 Milestone 4 — the whole chat flow (planner, tools,
        // generation, multi-agent) runs inside one usageRequestContext
        // labeled AI_CHAT; usage-meter.ts meters every LLM/embedding call
        // made anywhere in that call stack, including RAG search and any
        // multi-agent sub-calls (each individually re-labeled via
        // usageOperationContext — see the 3 agent files).
        const response = await withUsageContext("AI_CHAT", "LLM_CALL", withAuthContext);

        await consumeCredits("ai_chat");

        return NextResponse.json(
            interviewStore.sources.length > 0
                ? { ...response, interviewSources: interviewStore.sources }
                : response
        );

    } catch (error) {

        console.error(error);

        if (error instanceof InsufficientCreditsError || error instanceof InsufficientAiCreditsError) {
            return NextResponse.json(
                { error: error.message },
                { status: 402 }
            );
        }

        return NextResponse.json(
            { error: "AI Error" },
            { status: 500 }
        );

    }

}