import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

// Add rate limiting
const RATE_LIMIT_DELAY = 100; // 1 second between AI requests
let lastRequestTime = 0;

async function rateLimit() {
	const now = Date.now();
	const timeSinceLastRequest = now - lastRequestTime;
	if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
		await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY - timeSinceLastRequest));
	}
	lastRequestTime = Date.now();
}

export const determineEmailType = async (subject: string, body: string, senderEmail: string, receiverEmail: string) => {
	await rateLimit();

	const prompt = `Analyze this email and determine:
1. Is it related to job recruitment or employment process?
2. If yes, what specific type of recruitment communication is it?

Subject: "${subject}"
Body: "${body}"
Sender Email: "${senderEmail}"
Receiver Email: "${receiverEmail}"

Consider all aspects including job applications, interviews, offers, rejections, and any other recruitment communications. If the email is NOT related to job recruitment (e.g., marketing emails, personal communications, newsletters, etc.), classify it as 'non_recruitment'.`;

	const result = await generateObject({
		model: openai("gpt-4o"),
		prompt,
		maxRetries: 3,
		maxTokens: 100,
		schema: z.object({
			isRecruitmentEmail: z.boolean(),
			emailType: z.enum([
				"non_recruitment",
				"application",
				"application_confirmation",
				"interview_invitation",
				"interview_followup",
				"rejection",
				"offer",
				"offer_negotiation",
				"onboarding",
				"other_recruitment",
			]),
			confidence: z.number().min(0).max(1),
			stage: z.enum([
				"not_applicable",
				"pre_application",
				"application",
				"interviewing",
				"post_interview",
				"final_stage",
				"closed",
			]),
		}),
	});

	return result.object;
};

export const determineRecruitmentStatus = async (emailContent: string, isSubject: boolean) => {
	await rateLimit();

	const prompt = `Analyze the following email ${
		isSubject ? "subject" : "body"
	} and determine the status in the recruitment process it refers to (applied, interviewing, rejected, offer, or accepted). The email content is: "${emailContent}"`;

	const result = await generateObject({
		model: openai("gpt-4o"),
		prompt,
		maxRetries: 2,
		maxTokens: 80,
		schema: z.object({
			status: z.enum(["applied", "interviewing", "rejected", "offer", "accepted", "unknown"]),
			confidence: z.number().min(0).max(1),
		}),
	});

	return result.object;
};

export const determineJobRole = async (content: string) => {
	await rateLimit();

	const result = await generateObject({
		model: openai("gpt-4o"),
		prompt: `Extract the job role from this text: "${content}"`,
		maxRetries: 2,
		maxTokens: 100,
		schema: z.object({
			jobRole: z.string(),
			confidence: z.number().min(0).max(1),
		}),
	});

	return result.object;
};

export const determineCompanyName = async (
	subject: string,
	body: string,
	senderEmail: string,
	receiverEmail: string
) => {
	await rateLimit();

	const result = await generateObject({
		model: openai("gpt-4o"),
		prompt: `Extract the company name from this email related to a job application or recruitment process. If multiple companies are mentioned, return the most likely employer company.
		
Subject: "${subject}"
Body: "${body}"
Sender Email: "${senderEmail}"
Receiver Email: "${receiverEmail}"`,
		maxRetries: 2,
		maxTokens: 100,
		schema: z.object({
			companyName: z.string(),
			confidence: z.number().min(0).max(1),
		}),
	});

	return result.object;
};
