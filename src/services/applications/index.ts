import { createClient } from "@supabase/supabase-js";
import { EncryptionService } from "../encryption";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
const encryptionService = new EncryptionService(process.env.EMAIL_ENCRYPTION_KEY!);

export interface ProcessedEmail {
	id: string;
	user_id: string;
	application_id: string;
	email_subject: string;
	email_body: string;
	email_sender_email: string;
	email_receiver_email: string;
	date: string;
	company: string;
	context: string;
	thread_id: string;
	created_at: string;
}

export interface Application {
	id: string;
	user_id: string;
	context: string;
	company: string;
	position?: string;
	status: string;
	created_at: string;
	updated_at: string;
	contact: string;
	email_thread?: ProcessedEmail[];
}

export async function createApplicationWithEmail(
	userId: string,
	email: {
		subject: string;
		body: string;
		senderEmail: string;
		receiverEmail: string;
		date: string;
		threadId: string;
	},
	company: { companyName: string },
	status: string,
	jobRole: { jobRole?: string },
	contact: string,
	emailIdForDb: string
): Promise<{ success: boolean; data?: Application; error?: any }> {
	try {
		// Data is already encrypted, just pass it through
		const encryptedData = {
			p_user_id: userId,
			p_context: "jobs",
			p_company: company.companyName,
			p_position: jobRole?.jobRole || null,
			p_status: status,
			p_contact: contact,
			p_email_id: emailIdForDb,
			p_email_subject: email.subject,
			p_email_body: email.body,
			p_email_sender: email.senderEmail,
			p_email_receiver: email.receiverEmail,
			p_email_date: email.date,
			p_thread_id: email.threadId,
		};

		const { data, error } = await supabase.rpc("create_application_with_email", encryptedData);

		if (error) throw error;
		return { success: true, data };
	} catch (error) {
		console.error("Error creating application with email:", error);
		return { success: false, error };
	}
}

export async function updateApplicationStatus(
	applicationId: string,
	newStatus: string
): Promise<{ success: boolean; data?: Application; error?: any }> {
	try {
		const { data, error } = await supabase
			.from("applications")
			.update({
				status: newStatus,
				updated_at: new Date().toISOString(),
			})
			.eq("id", applicationId)
			.select()
			.single();

		if (error) throw error;

		// Decrypt data before returning
		const decryptedData = data
			? {
					...data,
					company: await encryptionService.decrypt(data.company),
					position: data.position ? await encryptionService.decrypt(data.position) : null,
					contact: data.contact ? await encryptionService.decrypt(data.contact) : null,
			  }
			: undefined;

		return { success: true, data: decryptedData };
	} catch (error) {
		console.error("Error updating application status:", error);
		return { success: false, error };
	}
}

export async function updateApplication(
	applicationId: string,
	updates: {
		company?: string;
		position?: string;
		status?: string;
		contact?: string;
	}
): Promise<{ success: boolean; data?: Application; error?: any }> {
	try {
		// Encrypt sensitive fields before update
		const encryptedUpdates: any = {
			updated_at: new Date().toISOString(),
		};

		if (updates.company) {
			encryptedUpdates.company = await encryptionService.encrypt(updates.company);
		}
		if (updates.position) {
			encryptedUpdates.position = await encryptionService.encrypt(updates.position);
		}
		if (updates.status) {
			encryptedUpdates.status = updates.status; // Status remains unencrypted for filtering
		}
		if (updates.contact) {
			encryptedUpdates.contact = await encryptionService.encrypt(updates.contact);
		}

		const { data, error } = await supabase
			.from("applications")
			.update(encryptedUpdates)
			.eq("id", applicationId)
			.select()
			.single();

		if (error) throw error;

		// Decrypt data before returning
		const decryptedData = data
			? {
					...data,
					company: await encryptionService.decrypt(data.company),
					position: data.position ? await encryptionService.decrypt(data.position) : null,
					contact: data.contact ? await encryptionService.decrypt(data.contact) : null,
			  }
			: undefined;

		return { success: true, data: decryptedData };
	} catch (error) {
		console.error("Error updating application:", error);
		return { success: false, error };
	}
}

export async function getApplications(
	userId: string
): Promise<{ success: boolean; data?: Application[]; error?: any }> {
	try {
		const { data: applications, error: fetchError } = await supabase
			.from("applications")
			.select("*")
			.eq("user_id", userId);

		if (fetchError) throw fetchError;

		// Debug log
		console.log("Raw application:", applications[0]);

		// Get and decrypt email threads
		const { data: emailThreads } = await supabase
			.from("processed_emails")
			.select("*")
			.eq("user_id", userId)
			.in(
				"application_id",
				applications.map((app) => app.id)
			);

		// Debug log
		console.log("Raw email thread:", emailThreads?.[0]);

		// Try decrypting a single field to test the encryption service
		const testDecrypt = await encryptionService.decrypt(applications[0].company);
		console.log("Test decrypt of company:", testDecrypt);

		// Decrypt applications first
		const decryptedApplications = await Promise.all(
			applications.map(async (app) => {
				const decryptedApp = await encryptionService.decryptApplicationData(app);
				return {
					...app,
					...decryptedApp,
				};
			})
		);

		// Then decrypt email threads
		const decryptedThreads = await Promise.all(
			(emailThreads ?? []).map(async (thread) => encryptionService.decryptProcessedEmail(thread))
		);

		// Combine them
		const finalData = decryptedApplications.map((app) => ({
			...app,
			email_thread: decryptedThreads.filter((thread) => thread.application_id === app.id),
		}));

		// Debug log
		console.log("Final decrypted application:", finalData[0]);

		return { success: true, data: finalData };
	} catch (error) {
		console.error("Error fetching applications:", error);
		return { success: false, error };
	}
}
