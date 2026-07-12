import { RagToolResult } from "@/types/tool-result";

export function isRagToolResult(
    result: unknown
): result is RagToolResult {

    return (

        typeof result === "object" &&

        result !== null &&

        "context" in result

    );

}