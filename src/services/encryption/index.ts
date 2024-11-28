import { createCipheriv, createDecipheriv, randomBytes, scrypt } from "crypto";
import { promisify } from "util";

const algorithm = "aes-256-gcm";
const scryptAsync = promisify(scrypt);

export class EncryptionService {
	private encryptionKey!: Buffer;

	constructor(private readonly secretKey: string) {
		if (!secretKey) {
			throw new Error("Encryption secret key is required");
		}
		this.initializeKey();
	}

	private async initializeKey(): Promise<void> {
		this.encryptionKey = (await scryptAsync(this.secretKey, "salt", 32)) as Buffer;
	}

	async encrypt(value: string | null): Promise<string | null> {
		if (value === null) return null;

		if (!this.encryptionKey) {
			await this.initializeKey();
		}

		const iv = randomBytes(16);
		const cipher = createCipheriv(algorithm, this.encryptionKey, iv);

		let encrypted = cipher.update(value, "utf8", "hex");
		encrypted += cipher.final("hex");

		const authTag = cipher.getAuthTag();

		return `${iv.toString("hex")}:${encrypted}:${authTag.toString("hex")}`;
	}

	async decrypt(value: string | null): Promise<string | null> {
		if (value === null) return null;

		try {
			let currentValue = value;
			let attempts = 0;
			const maxAttempts = 2; // Handle both single and double encrypted data

			while (attempts < maxAttempts && this.isEncryptedFormat(currentValue)) {
				const [ivHex, encrypted, authTagHex] = currentValue.split(":");

				const iv = Buffer.from(ivHex, "hex");
				const authTag = Buffer.from(authTagHex, "hex");

				const decipher = createDecipheriv(algorithm, this.encryptionKey, iv);
				decipher.setAuthTag(authTag);

				let decrypted = decipher.update(encrypted, "hex", "utf8");
				decrypted += decipher.final("utf8");

				currentValue = decrypted;
				attempts++;
			}

			return currentValue;
		} catch (error) {
			console.error("Decryption error:", error);
			throw new Error(`Failed to decrypt value: ${error.message}`);
		}
	}

	private isEncryptedFormat(value: string): boolean {
		const parts = value.split(":");
		return parts.length === 3 && parts.every((part) => /^[0-9a-f]+$/i.test(part));
	}

	// Helper for encrypting email data
	async encryptEmailData(email: {
		subject: string;
		body: string;
		senderEmail: string;
		receiverEmail: string;
		date: string;
		threadId: string;
	}) {
		return {
			subject: await this.encrypt(email.subject),
			body: await this.encrypt(email.body),
			senderEmail: await this.encrypt(email.senderEmail),
			receiverEmail: await this.encrypt(email.receiverEmail),
			date: email.date, // Keep date unencrypted for sorting/filtering
			threadId: await this.encrypt(email.threadId),
		};
	}

	// Helper for decrypting email data
	async decryptEmailData(email: any) {
		return {
			subject: await this.decrypt(email.subject),
			body: await this.decrypt(email.body),
			senderEmail: await this.decrypt(email.senderEmail),
			receiverEmail: await this.decrypt(email.receiverEmail),
			date: email.date,
			threadId: await this.decrypt(email.threadId),
		};
	}

	// Helper for encrypting application data
	async encryptApplicationData(application: { company: string; position?: string; contact?: string; status: string }) {
		return {
			company: await this.encrypt(application.company),
			position: await this.encrypt(application.position ?? ""),
			contact: await this.encrypt(application.contact ?? ""),
			status: application.status, // Keep status unencrypted for filtering
		};
	}

	// Helper for decrypting application data
	async decryptApplicationData(application: any) {
		return {
			company: await this.decrypt(application.company),
			position: await this.decrypt(application.position),
			contact: await this.decrypt(application.contact),
			status: application.status,
		};
	}

	async encryptProcessedEmail(email: any) {
		return {
			id: email.id,
			user_id: email.user_id,
			application_id: email.application_id,
			email_subject: await this.encrypt(email.email_subject),
			email_body: await this.encrypt(email.email_body),
			email_sender_email: await this.encrypt(email.email_sender_email),
			email_receiver_email: await this.encrypt(email.email_receiver_email),
			date: email.date,
			company: await this.encrypt(email.company),
			context: email.context,
			thread_id: await this.encrypt(email.thread_id),
			created_at: email.created_at,
		};
	}

	async decryptGmailEmail(email: any) {
		return {
			...email,
			subject: await this.decrypt(email.subject),
			body: await this.decrypt(email.body),
			senderEmail: await this.decrypt(email.senderEmail),
			receiverEmail: await this.decrypt(email.receiverEmail),
			threadId: await this.decrypt(email.threadId),
			snippet: email.snippet ? await this.decrypt(email.snippet) : "",
		};
	}

	async decryptProcessedEmail(email: any) {
		return {
			...email,
			email_subject: await this.decrypt(email.email_subject),
			email_body: await this.decrypt(email.email_body),
			email_sender_email: await this.decrypt(email.email_sender_email),
			email_receiver_email: await this.decrypt(email.email_receiver_email),
			company: await this.decrypt(email.company),
			thread_id: await this.decrypt(email.thread_id),
		};
	}
}
