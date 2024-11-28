export interface BatchResult {
	emails: any[];
	nextPageToken?: string;
	isComplete: boolean;
	reason?: "COMPLETE" | "MAX_EMAILS_REACHED" | "MAX_PAGES_REACHED" | "MAX_RETRIES_REACHED";
	processedCount: number;
	errorCount: number;
}

export interface GetAllEmailsOptions {
	batchSize: number;
	maxEmails?: number;
	maxPages?: number;
	specificEmail?: string;
}
