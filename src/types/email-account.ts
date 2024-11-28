export interface EmailAccount {
	email: string;
	access_token: string;
	refresh_token: string | null;
	expiry_date: number;
}

export interface EncryptedEmailAccount {
	email: string; // encrypted
	access_token: string; // encrypted
	refresh_token: string | null; // encrypted, can be null
	expiry_date: number;
}
