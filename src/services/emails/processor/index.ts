import { createClient } from "@supabase/supabase-js";
import { convertEmailIdToDecimal } from "../../../lib/emails/helpers";
import { determineCompanyName, determineJobRole, determineRecruitmentStatus } from "../../ai";
import { createApplicationWithEmail } from "../../applications";
import { EncryptionService } from "../../encryption";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
const encryptionService = new EncryptionService(process.env.EMAIL_ENCRYPTION_KEY!);

export async function processAndStoreEmails(userId: string, emails: any[]) {
	console.log(`Processing ${emails.length} emails for user ${userId}`);
	let processedCount = 0;
	let errorCount = 0;

	// First get existing applications for this user
	const { data: existingApplications } = await supabase.from("applications").select("*").eq("user_id", userId);

	for (const email of emails) {
		try {
			const emailIdForDb = convertEmailIdToDecimal(email.id);

			// Check if email already processed
			const { data: existingEmail } = await supabase
				.from("processed_emails")
				.select("id")
				.eq("id", emailIdForDb)
				.single();

			if (existingEmail) {
				console.log(`Email ${email.id} already processed, skipping`);
				processedCount++;
				continue;
			}

			// Get company name and status from unencrypted data first
			const company = await determineCompanyName(email.subject, email.body, email.senderEmail, email.receiverEmail);
			const statusResult = await determineRecruitmentStatus(email.body, false);
			const jobRole = await determineJobRole(email.subject + " " + email.body);

			if (!company?.companyName) {
				console.log(`No company name found for email`);
				continue;
			}

			// Determine the company contact (from company domain)
			const companyDomain = company.companyName.toLowerCase().replace(/[^a-z0-9]/g, "");
			const contact = email.senderEmail.toLowerCase().includes(companyDomain) ? email.senderEmail : email.receiverEmail;

			// Find existing application with exact or fuzzy match
			let applicationId = undefined;
			if (existingApplications) {
				for (const app of existingApplications) {
					const decryptedAppCompany = await encryptionService.decrypt(app.company);
					if (decryptedAppCompany?.toLowerCase().trim() === company.companyName.toLowerCase().trim()) {
						applicationId = app.id;
						break;
					}
				}

				// Fuzzy matching if no exact match
				if (!applicationId) {
					for (const app of existingApplications) {
						const decryptedAppCompany = await encryptionService.decrypt(app.company);
						const appCompany = decryptedAppCompany?.toLowerCase().trim() || "";
						const emailCompany = company.companyName.toLowerCase().trim();
						if (appCompany?.includes(emailCompany) || emailCompany.includes(appCompany)) {
							applicationId = app.id;
							console.log(`Found fuzzy match for company [REDACTED]`);
							break;
						}
					}
				}
			}

			// Encrypt all sensitive data
			const encryptedEmail = {
				subject: (await encryptionService.encrypt(email.subject)) || "",
				body: (await encryptionService.encrypt(email.body)) || "",
				senderEmail: (await encryptionService.encrypt(email.senderEmail)) || "",
				receiverEmail: (await encryptionService.encrypt(email.receiverEmail)) || "",
				date: email.date,
				threadId: (await encryptionService.encrypt(email.threadId)) || "",
				snippet: (await encryptionService.encrypt(email.snippet || "")) || "" || "",
			};

			if (!applicationId) {
				// Create new application with encrypted data
				const result = await createApplicationWithEmail(
					userId,
					encryptedEmail,
					{ companyName: (await encryptionService.encrypt(company.companyName)) || "" },
					statusResult.status || "applied",
					{ jobRole: (await encryptionService.encrypt(jobRole?.jobRole || "")) || "" },
					(await encryptionService.encrypt(contact)) || "",
					emailIdForDb
				);
				applicationId = result.data?.id;
				processedCount++;
				console.log(`Created new application for company [REDACTED]`);
			} else {
				// If application exists, just add the encrypted email
				const { error: emailError } = await supabase.from("processed_emails").insert({
					id: emailIdForDb,
					user_id: userId,
					application_id: applicationId,
					context: "jobs",
					created_at: new Date().toISOString(),
					email_subject: await encryptionService.encrypt(email.subject),
					email_body: await encryptionService.encrypt(email.body),
					email_sender_email: await encryptionService.encrypt(email.senderEmail),
					email_receiver_email: await encryptionService.encrypt(email.receiverEmail),
					date: email.date,
					company: await encryptionService.encrypt(company.companyName),
					thread_id: await encryptionService.encrypt(email.threadId),
				});

				if (emailError) {
					console.error("Error storing processed email:", emailError);
					errorCount++;
					continue;
				}
				processedCount++;
			}
		} catch (error) {
			console.error(`Error processing email:`, error);
			errorCount++;
		}
	}

	return { processedCount, errorCount };
}
