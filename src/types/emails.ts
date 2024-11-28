export interface EmailHeaders {
	name: string;
	value: string;
}

export interface ProcessedEmail {
	id: string;
	threadId: string;
	snippet: string;
	headers: EmailHeaders[];
	body: string;
	subject: string;
	senderEmail: string | null;
	receiverEmail: string | null;
	date: string;
	company: string | null;
	position: string | null;
	status: string;
	context: string;
}

export interface GmailOptions {
	pageSize: number;
	pageToken?: string;
	maxPages: number;
	maxEmails: number;
}

export interface JobRoleResult {
	jobRole: string;
	confidence: number;
}

export interface RecruitmentStatusResult {
	status: string;
	confidence: number;
}

export interface CacheEntry {
	jobRole?: string;
	status?: string;
	timestamp: number;
}
