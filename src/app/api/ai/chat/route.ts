import { NextResponse } from "next/server";
import { conversationService } from "@/lib/ai/services/conversation.service";

export async function POST(req: Request) {

    try {

        const { message, history } = await req.json();

        if (!message) {

            return NextResponse.json(
                { error: "Message required" },
                { status: 400 }
            );

        }

        const response =
            await conversationService.ask(
                message,
                Array.isArray(history) ? history : []
            );

        return NextResponse.json(response);

    } catch (error) {

        console.error(error);

        return NextResponse.json(
            { error: "AI Error" },
            { status: 500 }
        );

    }

}