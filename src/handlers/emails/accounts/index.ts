import { Context } from "hono";
import { ensureFreshTokens, getTokensFromSupabase } from "../../../services/auth/google";

export async function handleGetEmailAccounts(c: Context) {
	try {
		const userId = c.req.query("user_id");

		if (!userId) {
			return c.json({ error: "User ID is required" }, 400);
		}

		// First refresh tokens
		await ensureFreshTokens(userId);

		// Then get the updated tokens/accounts (they'll be automatically decrypted)
		const emailAccounts = await getTokensFromSupabase(userId);

		// Transform the response to only include necessary information
		// Note: emails are already decrypted at this point
		const sanitizedAccounts = emailAccounts.map((account: any) => ({
			email: account.email,
			isValid: !!account.access_token && !!account.refresh_token,
			lastRefreshed: new Date(account.expiry_date * 1000).toISOString(),
		}));

		return c.json({
			accounts: sanitizedAccounts,
			total: sanitizedAccounts.length,
		});
	} catch (error: any) {
		console.error("Error fetching email accounts:", error);
		return c.json(
			{
				error: "Failed to fetch email accounts",
				details: error.message,
			},
			500
		);
	}
}
