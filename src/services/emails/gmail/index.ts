import { google } from "googleapis";
import { extractEmail, filterHeaders, getMessageBody, parseDate, sanitizeAndTruncate } from "../../../lib/emails";
import { determineEmailTypeWithoutAI } from "../../../lib/emails/helpers";
import { ensureFreshTokens, getTokensFromSupabase } from "../../auth/google";
import { BatchResult, GetAllEmailsOptions } from "../types";

const gmail = google.gmail("v1");

export const getGmailEmails = async (
	userId: string,
	options = {
		pageSize: 50,
		pageToken: undefined as string | undefined,
		specificEmail: undefined as string | undefined,
	}
) => {
	try {
		console.log("Getting Gmail emails for user:", userId);
		const tokens = await getTokensFromSupabase(userId);
		console.log(`Found ${tokens.length} email accounts to process`);

		const tokensToProcess = options.specificEmail
			? tokens.filter((t: any) => t.email === options.specificEmail)
			: tokens;

		console.log(`Processing ${tokensToProcess.length} email account(s)`);

		const allEmailResults = await Promise.all(
			tokensToProcess.map(async (tokenData: any) => {
				try {
					const oauth2ClientForAccount = new google.auth.OAuth2(
						process.env.GOOGLE_CLIENT_ID,
						process.env.GOOGLE_CLIENT_SECRET,
						process.env.REDIRECT_URI
					);

					// Ensure we have fresh tokens
					const freshTokens = await ensureFreshTokens(userId);
					const currentToken = freshTokens.find((t) => t.email === tokenData.email);

					if (!currentToken?.access_token || !currentToken?.refresh_token) {
						console.error(`Invalid tokens for email: [REDACTED]`);
						return { emails: [], nextPageToken: null, hasMore: false, email: tokenData.email };
					}

					oauth2ClientForAccount.setCredentials({
						access_token: currentToken.access_token,
						refresh_token: currentToken.refresh_token,
						expiry_date: currentToken.expiry_date,
					});

					// Verify token validity
					try {
						await oauth2ClientForAccount.getAccessToken();
					} catch (tokenError) {
						console.error(`Token validation failed for email: [REDACTED]`);
						return { emails: [], nextPageToken: null, hasMore: false, email: tokenData.email };
					}

					// If looking for a specific email
					if (options.specificEmail) {
						const message = await gmail.users.messages.get({
							auth: oauth2ClientForAccount,
							userId: "me",
							id: options.specificEmail,
							format: "full",
						});

						if (!message.data) return { emails: [], nextPageToken: null };

						const headers = filterHeaders(message.data.payload?.headers);
						const subject = headers.find((h) => h.name === "Subject")?.value || "";
						const from = headers.find((h) => h.name === "From")?.value || "";
						const to = headers.find((h) => h.name === "To")?.value || "";
						const date = headers.find((h) => h.name === "Date")?.value || "";
						const body = getMessageBody(message.data);
						const senderEmail = extractEmail(from);
						const receiverEmail = extractEmail(to);

						// Skip if the email is from the current account
						if (senderEmail === tokenData.email) {
							return { emails: [], nextPageToken: null };
						}

						return {
							emails: [
								{
									id: message.data.id,
									threadId: message.data.threadId,
									snippet: sanitizeAndTruncate(message.data.snippet || "", 255),
									headers,
									body: sanitizeAndTruncate(body, 65535),
									subject: sanitizeAndTruncate(subject, 255),
									senderEmail,
									receiverEmail,
									date: parseDate(date),
								},
							],
							nextPageToken: null,
						};
					}

					// Regular email fetching
					const response = await gmail.users.messages.list({
						auth: oauth2ClientForAccount,
						userId: "me",
						maxResults: options.pageSize,
						pageToken: options.pageToken,
					});

					if (!response.data.messages) {
						return { emails: [], nextPageToken: response.data.nextPageToken };
					}

					const messages = await Promise.all(
						response.data.messages.map((message: any) =>
							gmail.users.messages.get({
								auth: oauth2ClientForAccount,
								userId: "me",
								id: message.id!,
								format: "full",
							})
						)
					);

					// Process and filter emails
					const processedEmails = [];
					for (const message of messages) {
						const headers = filterHeaders(message.data.payload?.headers);
						const subject = headers.find((h) => h.name === "Subject")?.value || "";
						const from = headers.find((h) => h.name === "From")?.value || "";
						const to = headers.find((h) => h.name === "To")?.value || "";
						const date = headers.find((h) => h.name === "Date")?.value || "";
						const body = getMessageBody(message.data);
						const senderEmail = extractEmail(from);
						const receiverEmail = extractEmail(to);

						if (senderEmail === tokenData.email) {
							continue;
						}

						// Check if email is recruitment-related
						const emailTypeResult = determineEmailTypeWithoutAI(subject, body, senderEmail || "", receiverEmail || "");

						// Only include recruitment-related emails
						if (emailTypeResult.isRecruitmentEmail) {
							processedEmails.push({
								id: message.data.id,
								threadId: message.data.threadId,
								snippet: sanitizeAndTruncate(message.data.snippet || "", 255),
								headers,
								body: sanitizeAndTruncate(body, 65535),
								subject: sanitizeAndTruncate(subject, 255),
								senderEmail,
								receiverEmail,
								date: parseDate(date),
								emailType: emailTypeResult.emailType,
								confidence: emailTypeResult.confidence,
							});
						}
					}

					return {
						emails: processedEmails,
						nextPageToken: response.data.nextPageToken,
					};
				} catch (error) {
					console.error(`Error processing email account ${tokenData.email}:`, error);
					return { emails: [], nextPageToken: null, error };
				}
			})
		);

		// Combine results from all email accounts
		const allEmails = allEmailResults.flatMap((result) => result.emails);
		const hasMore = allEmailResults.some((result) => result.nextPageToken);
		const nextPageToken = allEmailResults.find((result) => result.nextPageToken)?.nextPageToken;

		return {
			emails: allEmails,
			nextPageToken,
			hasMore,
		};
	} catch (error) {
		console.error("Error in getGmailEmails:", error);
		throw error;
	}
};

export const getAllGmailEmails = async (
	userId: string,
	options: GetAllEmailsOptions,
	onBatchProcessed?: (batchResult: BatchResult) => Promise<void>
): Promise<BatchResult> => {
	try {
		let allEmails: any[] = [];
		let pageToken: string | undefined;
		let pageCount = 0;
		let isComplete = false;
		let reason: BatchResult["reason"];

		while (!isComplete) {
			const result = await getGmailEmails(userId, {
				pageSize: options.batchSize,
				pageToken,
				specificEmail: options.specificEmail,
			});

			if (result.emails.length > 0) {
				allEmails = allEmails.concat(result.emails);
			}

			// Create batch result for callback
			const batchResult: BatchResult = {
				emails: result.emails,
				isComplete: false,
				reason: undefined,
				processedCount: result.emails.length,
				errorCount: 0,
			};

			// Call the callback if provided
			if (onBatchProcessed) {
				await onBatchProcessed(batchResult);
			}

			// Check completion conditions
			if (!result.hasMore || !result.nextPageToken) {
				isComplete = true;
				reason = "COMPLETE";
			} else if (options.maxEmails && allEmails.length >= options.maxEmails) {
				isComplete = true;
				reason = "MAX_EMAILS_REACHED";
				allEmails = allEmails.slice(0, options.maxEmails);
			} else if (options.maxPages && pageCount >= options.maxPages) {
				isComplete = true;
				reason = "MAX_PAGES_REACHED";
			}

			if (!isComplete) {
				pageToken = result.nextPageToken;
				pageCount++;
			}
		}

		return {
			emails: allEmails,
			isComplete: true,
			reason,
			processedCount: allEmails.length,
			errorCount: 0,
		};
	} catch (error) {
		console.error("Error in getAllGmailEmails:", error);
		throw error;
	}
};
