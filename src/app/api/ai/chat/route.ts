import { NextResponse } from "next/server";
import { openai } from "@/lib/ai/openai";
import { searchRagContext } from "@/lib/ai/retrieval";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function POST(req: Request) {
  try {
    const { message, history = [] } = await req.json();

    if (!message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    const latestMessage = String(message).trim();
    const latestLower = latestMessage.toLowerCase();

    const conversationText = [
      ...history.map((m: ChatMessage) => m.content),
      latestMessage,
    ]
      .join(" ")
      .toLowerCase();

    const isBirthdayMode =
      conversationText.includes("rafat") ||
      conversationText.includes("tona") ||
      conversationText.includes("birthday");

    const isIntroMessage =
      latestLower.includes("rafat") ||
      latestLower.includes("tona") ||
      latestLower.includes("birthday");

    const askedGift =
      conversationText.includes("what is the gift you want") ||
      conversationText.includes("question 1");

    const askedTrip =
      conversationText.includes("best memorable trip") ||
      conversationText.includes("question 2");

    const askedBestGift =
      conversationText.includes("best gift given by zafrul") ||
      conversationText.includes("question 3");

    const askedGoodBad =
      conversationText.includes("good and bad moment") ||
      conversationText.includes("question 4");

    if (isBirthdayMode) {
      if (isIntroMessage && !askedGift) {
        return NextResponse.json({
          answer:
            "Happy Birthday my beautiful Tona Darling ❤️\n\nI have been waiting for you. Today is your special day, and Zafrul prepared this little AI surprise only for you.\n\n**Question 1:** What is the gift you want on this special day?",
          sources: [],
        });
      }

      if (askedGift && !askedTrip) {
          const noGiftWords = ["nothing", "no", "none", "not needed", "no gift"];

          const isNoGiftAnswer = noGiftWords.some((word) =>
            latestLower.includes(word)
          );

          const giftReply = isNoGiftAnswer
            ? "No worries my beautiful Tona Darling ❤️\n\nEven if you say nothing, Zafrul will definitely bring something special for you, because you truly deserve the best."
            : `Sure ❤️ Zafrul will surely bring ${latestMessage} for you, my beautiful Tona Darling.`;

          return NextResponse.json({
            answer: `${giftReply}\n\n**Question 2:**\nWhat was your best memorable trip with Zafrul?`,
            sources: [],
          });
        }

      if (askedTrip && !askedBestGift) {
        let tripMessage =
          "That trip was also very special ❤️ Because wherever you are with Zafrul, the place becomes memorable.";

        if (latestLower.includes("ooty")) {
          tripMessage =
            "Ooty was really special ❤️ The beautiful weather, peaceful moments, and your smile made that trip unforgettable for Zafrul.";
        } else if (latestLower.includes("munnar")) {
          tripMessage =
            "Munnar was such a beautiful memory ❤️ The greenery, calm atmosphere, and the time spent together made it very special.";
        } else if (latestLower.includes("bahrain")) {
          tripMessage =
            "Bahrain has a very special place in your journey together ❤️ Those moments, memories, and experiences will always stay close to Zafrul’s heart.";
        }

        return NextResponse.json({
          answer: `${tripMessage}\n\n**Question 3:** What was the best gift given by Zafrul on your birthday?`,
          sources: [],
        });
      }

      if (askedBestGift && !askedGoodBad) {
        let giftMessage =
          "That was also a beautiful memory ❤️ But for Zafrul, the biggest gift has always been your smile and your presence in his life.";

        if (
          latestLower.includes("photo") ||
          latestLower.includes("album")
        ) {
          giftMessage =
            "That memorable photo album was very special ❤️ But Tona, that was given on your Anniversary in Indore, not on your birthday. Still, it carried so many beautiful memories of your journey together.";
        } else if (
          latestLower.includes("gold") ||
          latestLower.includes("ring")
        ) {
          giftMessage =
            "Yes ❤️ Great, you still remember that moment. Zafrul gave you that gold ring after just marriage in 2018 in Hyderabad. That moment was very close to his heart.";
        } else if (
          latestLower.includes("rose") ||
          latestLower.includes("flower")
        ) {
          giftMessage =
            "Yes ❤️ For a beautiful wife, a beautiful flower was given. A rose for Zafrul’s beautiful Tona Darling.";
        }

        return NextResponse.json({
          answer: `${giftMessage}\n\n**Question 4:** What was your good and bad moment with Zafrul?`,
          sources: [],
        });
      }

      if (askedGoodBad) {
        return NextResponse.json({
          answer:
            "Yes Tona ❤️ Zafrul still remembers those good moments with a smile.\n\nAnd for the bad moments, he is really sorry. He always regrets the moments when he misbehaved with you, hurt you, or made you feel bad. He still remembers those moments and truly wishes to become better for you.\n\nHappy Birthday my beautiful Tona Darling ❤️ May Allah bless you with happiness, health, love, peace, and endless smiles.",
          sources: [],
        });
      }
    }

    const chunks = await searchRagContext(latestMessage);

    const context = chunks
      .map(
        (chunk: any, index: number) =>
          `Context ${index + 1}:\n${chunk.chunk_text}`
      )
      .join("\n\n");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are Zafrul Islam's AI portfolio assistant. Answer using the provided context. If context is missing, say the information is not available in the knowledge base.",
        },
        {
          role: "user",
          content: `Question:\n${latestMessage}\n\nRelevant Context:\n${context}`,
        },
      ],
    });

    return NextResponse.json({
      answer: response.choices[0]?.message?.content || "No answer generated.",
      sources: chunks,
    });
  } catch (error) {
    console.error("AI chat error:", error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI chat failed" },
      { status: 500 }
    );
  }
}