import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import { EncryptionService } from "../../encryption";

const oauth2Client = new google.auth.OAuth2(
	process.env.GOOGLE_CLIENT_ID,
	process.env.GOOGLE_CLIENT_SECRET,
	process.env.REDIRECT_URI
);

const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_ANON_KEY as string);

const encryptionService = new EncryptionService(process.env.EMAIL_ENCRYPTION_KEY!);

// Generates the Google OAuth URL
export const getGoogleAuthUrl = (state: string): string => {
	return oauth2Client.generateAuthUrl({
		access_type: "offline",
		scope: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/userinfo.email"],
		prompt: "consent",
		state: state,
	});
};

// Exchanges code for tokens and saves them in Supabase
export const exchangeCodeForTokens = async (code: string, userId: string) => {
	try {
		const { tokens } = await oauth2Client.getToken(code);
		oauth2Client.setCredentials(tokens);

		// Get user's email from Google
		const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
		const { data } = await oauth2.userinfo.get();
		const email = data.email;

		if (!email) {
			throw new Error("No email found in Google response");
		}

		const expiryDate = tokens.expiry_date as number;

		// Create account object and encrypt sensitive data
		const newEmailAccount = {
			email: await encryptionService.encrypt(email),
			access_token: await encryptionService.encrypt(tokens.access_token!),
			refresh_token: await encryptionService.encrypt(tokens.refresh_token!),
			expiry_date: expiryDate,
		};

		// Check if user already has a row in user_tokens
		const { data: existingData } = await supabase
			.from("user_tokens")
			.select("email_accounts")
			.eq("user_id", userId)
			.single();

		if (existingData) {
			// Update existing accounts
			const existingAccounts = existingData.email_accounts?.accounts || [];
			const accountIndex = await Promise.all(
				existingAccounts.map(async (acc: any, index: number) => {
					const decryptedEmail = await encryptionService.decrypt(acc.email);
					return decryptedEmail === email ? index : -1;
				})
			).then((indices) => indices.find((index) => index !== -1) ?? -1);

			if (accountIndex >= 0) {
				existingAccounts[accountIndex] = newEmailAccount;
			} else {
				existingAccounts.push(newEmailAccount);
			}

			await supabase
				.from("user_tokens")
				.update({ email_accounts: { accounts: existingAccounts } })
				.eq("user_id", userId);
		} else {
			// Create new row
			await supabase.from("user_tokens").insert({
				user_id: userId,
				email_accounts: {
					accounts: [newEmailAccount],
				},
			});
		}

		return { tokens, email };
	} catch (error) {
		console.error("Error exchanging code for tokens:", error);
		throw new Error("Failed to exchange code for tokens");
	}
};

// Fetch tokens from Supabase
export const getTokensFromSupabase = async (userId: string) => {
	console.log("Fetching tokens for user:", userId);
	const { data, error } = await supabase.from("user_tokens").select("email_accounts").eq("user_id", userId).single();

	if (error) {
		console.error("Error retrieving tokens from Supabase:", error);
		throw new Error("Failed to retrieve tokens");
	}

	const encryptedAccounts = data?.email_accounts?.accounts || [];

	// Decrypt all accounts
	const decryptedAccounts = await Promise.all(
		encryptedAccounts.map(async (account: any) => ({
			...account,
			email: await encryptionService.decrypt(account.email),
			access_token: await encryptionService.decrypt(account.access_token),
			refresh_token: await encryptionService.decrypt(account.refresh_token),
		}))
	);

	console.log(`Found ${decryptedAccounts.length} email accounts for user ${userId}`);
	return decryptedAccounts;
};

// Update tokens in Supabase
export const updateTokensInSupabase = async (userId: string, accounts: any[]) => {
	try {
		// Encrypt all accounts before storing
		const encryptedAccounts = await Promise.all(
			accounts.map(async (account) => ({
				...account,
				email: await encryptionService.encrypt(account.email),
				access_token: await encryptionService.encrypt(account.access_token),
				refresh_token: await encryptionService.encrypt(account.refresh_token),
			}))
		);

		await supabase
			.from("user_tokens")
			.update({ email_accounts: { accounts: encryptedAccounts } })
			.eq("user_id", userId);
	} catch (error) {
		console.error("Error updating tokens in Supabase:", error);
		throw new Error("Failed to update tokens");
	}
};

// Refresh tokens using Supabase data
export const refreshAccessToken = async (refreshToken: string, userId: string, email: string) => {
	try {
		oauth2Client.setCredentials({ refresh_token: refreshToken });
		const { credentials } = await oauth2Client.refreshAccessToken();

		const emailAccounts = await getTokensFromSupabase(userId);
		const updatedAccounts = emailAccounts.map((account: any) => {
			if (account.email === email) {
				return {
					...account,
					access_token: credentials.access_token,
					refresh_token: credentials.refresh_token || refreshToken,
					expiry_date: credentials.expiry_date,
				};
			}
			return account;
		});

		await updateTokensInSupabase(userId, updatedAccounts);
		return credentials;
	} catch (error) {
		console.error("Error refreshing access token:", error);
		throw new Error("Failed to refresh access token");
	}
};

// Check if the access token needs refreshing
export const isTokenExpired = (expiryDate: number): boolean => {
	if (!expiryDate) return true;
	const currentTime = Math.floor(Date.now() / 1000);
	return currentTime >= expiryDate - 300; // Refresh 5 minutes before expiration
};

// Ensure fresh tokens are available
export const ensureFreshTokens = async (userId: string) => {
	try {
		const tokens = await getTokensFromSupabase(userId);
		console.log(`Refreshing tokens for ${tokens.length} email accounts`);

		const refreshedTokens = await Promise.all(
			tokens.map(async (tokenData: any) => {
				if (isTokenExpired(tokenData.expiry_date)) {
					console.log(`Refreshing token for email: ${tokenData.email}`);
					try {
						const newCredentials = await refreshAccessToken(tokenData.refresh_token, userId, tokenData.email);
						return {
							...tokenData,
							access_token: newCredentials.access_token,
							refresh_token: newCredentials.refresh_token || tokenData.refresh_token,
							expiry_date: newCredentials.expiry_date,
						};
					} catch (error) {
						console.error(`Error refreshing token for ${tokenData.email}:`, error);
						throw error;
					}
				}
				return tokenData;
			})
		);

		await updateTokensInSupabase(userId, refreshedTokens);
		return refreshedTokens;
	} catch (error) {
		console.error("Error in ensureFreshTokens:", error);
		throw error;
	}
};
