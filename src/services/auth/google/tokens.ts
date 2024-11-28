import { EncryptionService } from "../../encryption";

const encryptionService = new EncryptionService(process.env.EMAIL_ENCRYPTION_KEY!);

export interface EmailAccount {
	email: string;
	access_token: string;
	refresh_token: string;
	expiry_date: number;
}

export async function encryptEmailAccount(account: EmailAccount): Promise<EmailAccount> {
	return {
		...account,
		email: (await encryptionService.encrypt(account.email)) ?? "",
		access_token: (await encryptionService.encrypt(account.access_token)) ?? "",
		refresh_token: (await encryptionService.encrypt(account.refresh_token)) ?? "",
	};
}

export async function decryptEmailAccount(account: EmailAccount): Promise<EmailAccount> {
	return {
		...account,
		email: (await encryptionService.decrypt(account.email)) ?? "",
		access_token: (await encryptionService.decrypt(account.access_token)) ?? "",
		refresh_token: (await encryptionService.decrypt(account.refresh_token)) ?? "",
	};
}
