import { Context } from "hono";
import { ensureFreshTokens } from "../../../services/auth/google";
import { getAllGmailEmails, getGmailEmails } from "../../../services/emails/gmail";
import { processAndStoreEmails } from "../../../services/emails/processor";
import { BatchResult } from "../../../services/emails/types";
import { EncryptionService } from "../../../services/encryption";

const TIMEOUT = 30000; // 30 seconds timeout
const encryptionService = new EncryptionService(process.env.EMAIL_ENCRYPTION_KEY!);
export const refreshTokenMiddleware = async (c: Context, next: () => Promise<void>) => {
	try {
		const { user_id } = c.req.query();
		await ensureFreshTokens(user_id);
		await next();
	} catch (error) {
		return c.json({ error: "Failed to refresh token" }, 401);
	}
};

export const handleGetEmails = async (c: Context) => {
	try {
		const userId = c.req.query("user_id");
		const pageToken = c.req.query("pageToken");
		const pageSize = parseInt(c.req.query("pageSize") || "20");

		if (!userId) {
			return c.json({ error: "User ID is required" }, 400);
		}

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

		try {
			const emailsResult = await getGmailEmails(userId, {
				pageSize,
				pageToken,
				specificEmail: c.req.query("specificEmail"),
			});

			if (emailsResult.emails?.length > 0) {
				const { processedCount, errorCount } = await processAndStoreEmails(userId, emailsResult.emails);
				console.log(`Processed ${processedCount} emails with ${errorCount} errors`);
			}

			// Decrypt emails before sending response
			const decryptedEmails = await Promise.all(
				emailsResult.emails.map(async (email) => ({
					...email,
					subject: await encryptionService.decrypt(email.subject),
					body: await encryptionService.decrypt(email.body),
					senderEmail: await encryptionService.decrypt(email.senderEmail),
					receiverEmail: await encryptionService.decrypt(email.receiverEmail),
					threadId: await encryptionService.decrypt(email.threadId),
					snippet: email.snippet ? await encryptionService.decrypt(email.snippet) : "",
				}))
			);

			clearTimeout(timeoutId);
			return c.json({
				emails: decryptedEmails,
				pagination: {
					nextPageToken: emailsResult.nextPageToken,
					hasMore: emailsResult.hasMore,
				},
			});
		} catch (error: any) {
			clearTimeout(timeoutId);
			if (error.name === "AbortError") {
				return c.json({ error: "Request timed out" }, 504);
			}
			throw error;
		}
	} catch (error: any) {
		console.error("Error in handleGetEmails:", error);
		return c.json({ error: "Failed to process request", details: error.message }, 500);
	}
};

export const handleGetAllEmails = async (c: Context) => {
	try {
		const userId = c.req.query("user_id");
		const maxEmails = parseInt(c.req.query("maxEmails") || "10000");
		const maxPages = parseInt(c.req.query("maxPages") || "20");
		const batchSize = parseInt(c.req.query("batchSize") || "50");

		if (!userId) {
			return c.json({ error: "User ID is required" }, 400);
		}

		// For non-SSE requests, collect all results
		const allResults: BatchResult[] = [];
		let totalProcessed = 0;
		let totalErrors = 0;

		const result = await getAllGmailEmails(
			userId,
			{ maxEmails, maxPages, batchSize, specificEmail: c.req.query("specificEmail") },
			async (batchResult) => {
				if (batchResult.emails.length > 0) {
					// Decrypt before processing
					const decryptedEmails = await Promise.all(
						batchResult.emails.map(async (email) => ({
							...email,
							subject: await encryptionService.decrypt(email.subject),
							body: await encryptionService.decrypt(email.body),
							senderEmail: await encryptionService.decrypt(email.senderEmail),
							receiverEmail: await encryptionService.decrypt(email.receiverEmail),
							threadId: await encryptionService.decrypt(email.threadId),
							snippet: email.snippet ? await encryptionService.decrypt(email.snippet) : "",
						}))
					);

					const { processedCount, errorCount } = await processAndStoreEmails(userId, decryptedEmails);
					totalProcessed += processedCount;
					totalErrors += errorCount;
				}
				allResults.push(batchResult);
			}
		);

		// Return final results
		return c.json({
			totalProcessed,
			totalErrors,
			isComplete: result.isComplete,
			reason: result.reason,
			processedCount: result.processedCount,
			errorCount: result.errorCount,
		});
	} catch (error) {
		console.error("Error in handleGetAllEmails:", error);
		return c.json({ error: "Failed to process request" }, 500);
	}
};
