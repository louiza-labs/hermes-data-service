import { BatchResult } from "../types";

export function createBatchResult(
	reason: "COMPLETE" | "MAX_EMAILS_REACHED" | "MAX_PAGES_REACHED" | "MAX_RETRIES_REACHED",
	totalProcessed: number,
	totalErrors: number,
	emails: any[] = [],
	nextPageToken?: string
): BatchResult {
	return {
		emails,
		nextPageToken,
		isComplete: reason === "COMPLETE",
		reason,
		processedCount: totalProcessed,
		errorCount: totalErrors,
	};
}

export function handleRetry(error: any, retries: number): boolean {
	const MAX_RETRIES = 3;

	if (retries >= MAX_RETRIES) {
		console.error("Max retries reached:", error);
		return false;
	}

	const backoffTime = 1000 * Math.pow(2, retries); // Exponential backoff
	console.log(`Retrying in ${backoffTime}ms... (Attempt ${retries + 1}/${MAX_RETRIES})`);
	return true;
}
