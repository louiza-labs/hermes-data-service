import { JobRoleResult, RecruitmentStatusResult } from "../../types/emails";
import { COMPANY_NAME_BLACKLIST, INITIAL_BACKOFF, RELEVANT_HEADERS } from "../constants";

// Helper functions for email processing
export const sanitizeAndTruncate = (text: string, maxLength: number): string => {
	return text.replace(/[\u0000-\u001F\u007F-\u009F]/g, "").substring(0, maxLength);
};

export const extractEmail = (str: string): string | null => {
	const match = str.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
	return match ? match[0] : null;
};

export const parseDate = (dateString: string): string | null => {
	try {
		const cleanedDate = dateString.trim();
		const date = new Date(cleanedDate);

		// Check if the date is valid
		if (isNaN(date.getTime())) {
			console.warn(`Invalid date string received: ${dateString}`);
			return null;
		}

		return date.toISOString();
	} catch (error) {
		console.error(`Error parsing date string: ${dateString}`, error);
		return null;
	}
};

export const cleanCompanyName = (name: string): string => {
	if (!name) return "";
	return name
		.split(/[\s,.-]+/)
		.filter((word) => word.length > 1 && !COMPANY_NAME_BLACKLIST.includes(word.toLowerCase()))
		.join(" ")
		.trim();
};

export const extractCompany = (body: string, subject: string, from: string): string | null => {
	// ... existing imports and other code ...

	const attempts = [
		// 1. Try structured email signature first (most reliable)
		(text: string) => {
			const signaturePattern =
				/(?:\r?\n|\r)(?:regards|best|sincerely|thank you)[,\s\n]+(?:[\w\s]+\n)?([\w\s&.-]+?)(?:\.|,|\n|$)/i;
			const match = text.match(signaturePattern);
			return match ? cleanCompanyName(match[1]) : null;
		},

		// 2. Try email domain (if not common provider)
		(text: string, fromEmail: string) => {
			const commonProviders = new Set([
				"gmail",
				"yahoo",
				"hotmail",
				"outlook",
				"aol",
				"mail",
				"proton",
				"icloud",
				"me",
				"live",
				"protonmail",
			]);

			const emailMatch = fromEmail.match(/<(.+?)>/) || [null, fromEmail];
			const domain = emailMatch[1]?.split("@")[1]?.split(".")[0];

			if (domain && !commonProviders.has(domain.toLowerCase())) {
				return domain.charAt(0).toUpperCase() + domain.slice(1);
			}
			return null;
		},

		// 3. Try common recruiting patterns
		(text: string) => {
			const recruitingPatterns = [
				/(?:welcome to|joining|position at|opportunity with) ([\w\s&.-]+?)(?=\.|,|\n|$)/i,
				/(?:behalf of|representing) ([\w\s&.-]+?)(?=\.|,|\n|$)/i,
				/([\w\s&.-]+?) (?:is hiring|team) /i,
				/apply(?:ing)? (?:at|to|with) ([\w\s&.-]+?)(?=\.|,|\n|$)/i,
				/(?:your|the) interest in ([\w\s&.-]+?)(?=\.|,|\n|$)/i,
			];

			for (const pattern of recruitingPatterns) {
				const match = text.match(pattern);
				if (match) {
					const cleaned = cleanCompanyName(match[1]);
					if (cleaned && cleaned.length >= 2) return cleaned;
				}
			}
			return null;
		},
	];

	// Combine subject and body for text analysis
	const fullText = `${subject}\n${body}`;

	// Try each extraction method in priority order
	for (const attempt of attempts) {
		const result = attempt(fullText, from);
		if (result && result.length >= 2) {
			return result;
		}
	}

	return null;
};

export const isJobApplicationRelated = (subject: string, body: string, from: string): boolean => {
	const lowercaseSubject = subject.toLowerCase();
	const lowercaseBody = body.toLowerCase();

	const jobRelatedKeywords = [
		"job",
		"application",
		"interview",
		"position",
		"opportunity",
		"career",
		"resume",
		"cv",
		"recruitment",
		"interest in",
		"applying to",
		"regarding",
		"hiring",
		"employment",
		"offer",
	];

	return jobRelatedKeywords.some((keyword) => lowercaseSubject.includes(keyword) || lowercaseBody.includes(keyword));
};

export const chunkArray = <T>(array: T[], size: number): T[][] => {
	return Array.from({ length: Math.ceil(array.length / size) }, (_, i) => array.slice(i * size, i * size + size));
};

export const exponentialBackoff = async (retryCount: number) => {
	const waitTime = INITIAL_BACKOFF * Math.pow(2, retryCount);
	await new Promise((resolve) => setTimeout(resolve, waitTime));
};

// Header Processing
export function filterHeaders(headers: any[] | undefined): any[] {
	if (!headers) return [];
	return headers.filter((header) => RELEVANT_HEADERS.includes(header.name));
}

// Message Body Processing
export function getMessageBody(message: any): string {
	if (message.payload.body.data) {
		return Buffer.from(message.payload.body.data, "base64").toString("utf-8");
	}

	if (message.payload.parts) {
		for (let part of message.payload.parts) {
			if (part.mimeType === "text/plain" && part.body.data) {
				return Buffer.from(part.body.data, "base64").toString("utf-8");
			}
		}
	}

	return "No readable message body found";
}

// Email Context
export function determineEmailContext(subject: string, body: string): string {
	// For now, we'll assume all emails are job-related
	return "job";
}

// Concurrent Execution
export async function executeWithConcurrencyLimit<T>(
	tasks: (() => Promise<T>)[],
	maxConcurrent: number,
	processingDelay: number
): Promise<T[]> {
	const results: T[] = [];
	const chunks = chunkArray(tasks, maxConcurrent);

	for (const chunk of chunks) {
		const chunkResults = await Promise.all(chunk.map((task) => task()));
		results.push(...chunkResults);
		await new Promise((resolve) => setTimeout(resolve, processingDelay));
	}

	return results;
}

// Cache Management
export interface EmailCacheEntry {
	jobRole?: string;
	status?: string;
	timestamp: number;
}

export class EmailCache {
	private cache = new Map<string, EmailCacheEntry>();
	private cacheDuration: number;

	constructor(cacheDuration: number) {
		this.cacheDuration = cacheDuration;
	}

	get(key: string, type: keyof Omit<EmailCacheEntry, "timestamp">) {
		const cached = this.cache.get(key);
		if (cached && cached[type] && Date.now() - cached.timestamp < this.cacheDuration) {
			return cached[type];
		}
		return null;
	}

	set(key: string, type: keyof Omit<EmailCacheEntry, "timestamp">, value: string) {
		const existing = this.cache.get(key) || { timestamp: Date.now() };
		this.cache.set(key, { ...existing, [type]: value, timestamp: Date.now() });
	}
}

export const getDummyJobRole = async (text: string): Promise<JobRoleResult> => {
	const lowercaseText = text.toLowerCase();

	// Common job title patterns
	const patterns = [
		// Position: Role pattern
		/(?:position|role|title)(?:\s+is)?(?:\s*:\s*|\s+for\s+|\s+as\s+)([\w\s]+?)(?:\sin\s|at|\.|,|$)/i,

		// Applying for Role pattern
		/(?:applied|applying|application)(?:\s+for\s+(?:the|a|an)\s+)([\w\s]+?)(?:\s+(?:position|role)|at|\.|,|$)/i,

		// Opening for Role pattern
		/(?:opening|opportunity|hiring)(?:\s+for\s+(?:the|a|an)\s+)([\w\s]+?)(?:\s+(?:position|role)|at|\.|,|$)/i,

		// Role - Company pattern
		/^([\w\s]+?)(?:\s+(?:position|role|opportunity)|\s+-\s+[\w\s]+|\.|,|$)/im,

		// Consider Role pattern
		/consider(?:ing)? you for(?: the)?([\w\s]+?)(?:position|role|opportunity|\.|,|$)/i,
	];

	// Try each pattern
	for (const pattern of patterns) {
		const match = text.match(pattern);
		if (match && match[1]) {
			let role = match[1].trim();

			// Clean up the extracted role
			role = role
				// Remove common prefixes
				.replace(/^(?:senior|jr|junior|lead|principal|staff|associate)\s+/i, "")
				// Remove common suffixes
				.replace(/\s+(?:position|role|opportunity)$/i, "")
				// Clean up extra whitespace
				.replace(/\s+/g, " ")
				.trim();

			// Validate the role is reasonable (between 3 and 50 chars)
			if (role.length >= 3 && role.length <= 50) {
				return {
					jobRole: role,
					// Higher confidence for roles that match earlier patterns
					confidence: 0.9 - patterns.indexOf(pattern) * 0.1,
				};
			}
		}
	}

	// Fallback: Look for sentences containing job-related keywords
	const jobKeywords = ["engineer", "developer", "manager", "analyst", "designer", "architect"];
	const sentences = text.split(/[.!?]+/);

	for (const sentence of sentences) {
		if (jobKeywords.some((keyword) => sentence.toLowerCase().includes(keyword))) {
			// Extract a window of words around the keyword
			const words = sentence.split(/\s+/);
			for (let i = 0; i < words.length; i++) {
				if (jobKeywords.some((keyword) => words[i].toLowerCase().includes(keyword))) {
					// Take up to 3 words before and after the keyword
					const start = Math.max(0, i - 3);
					const end = Math.min(words.length, i + 4);
					const role = words.slice(start, end).join(" ").trim();

					if (role.length >= 3 && role.length <= 50) {
						return {
							jobRole: role,
							confidence: 0.6, // Lower confidence for this fallback method
						};
					}
				}
			}
		}
	}

	// Last resort: Return "Unknown Position" with very low confidence
	return {
		jobRole: "Unknown Position",
		confidence: 0.3,
	};
};

export const getDummyRecruitmentStatus = async (text: string): Promise<RecruitmentStatusResult> => {
	const lowercaseText = text.toLowerCase();

	// Define keyword mappings for different statuses
	const statusPatterns = {
		offer_received: ["offer", "compensation", "salary", "package", "pleased to offer"],
		rejected: ["unfortunately", "other candidates", "not moving forward", "not successful"],
		interview_scheduled: ["schedule", "interview", "meet", "discuss your application"],
		technical_assessment: ["coding challenge", "technical assessment", "take-home", "assignment"],
		screening: ["initial call", "phone screen", "preliminary discussion"],
		onsite_interview: ["onsite", "on-site", "office", "in person interview"],
		accepted: ["welcome aboard", "start date", "looking forward to having you"],
		withdrawn: ["withdraw", "cancelled", "postpone"],
		applied: ["received your application", "thank you for applying", "application received"],
	};

	// Find matching status based on keywords
	for (const [status, patterns] of Object.entries(statusPatterns)) {
		if (patterns.some((pattern) => lowercaseText.includes(pattern))) {
			return {
				status: status,
				confidence: 0.9,
			};
		}
	}

	// Default to 'applied' with lower confidence if no clear matches
	return {
		status: "applied",
		confidence: 0.7,
	};
};
