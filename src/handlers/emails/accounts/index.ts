import { Context } from "hono";
import {
  ensureFreshTokens,
  getTokensFromSupabase,
} from "../../../services/auth/google";

// Test endpoint to get decrypted access token for manual testing
export async function handleGetTestToken(c: Context) {
  try {
    const userId = c.req.query("user_id");
    const email = c.req.query("email"); // Optional: specific email to test

    if (!userId) {
      return c.json({ error: "User ID is required" }, 400);
    }

    // First refresh tokens
    await ensureFreshTokens(userId);

    // Get decrypted tokens
    const emailAccounts = await getTokensFromSupabase(userId);

    // Filter by email if provided
    const accountsToReturn = email
      ? emailAccounts.filter((acc: any) => acc.email === email)
      : emailAccounts;

    if (accountsToReturn.length === 0) {
      return c.json({ error: "No accounts found" }, 404);
    }

    // Return tokens for testing (WARNING: Only use in development!)
    const testTokens = accountsToReturn.map((account: any) => ({
      email: account.email,
      access_token: account.access_token, // Decrypted - for testing only!
      expires_at: new Date(account.expiry_date * 1000).toISOString(),
    }));

    return c.json({
      tokens: testTokens,
      curlExample: `# Test Gmail API with this token:
curl -H "Authorization: Bearer ${testTokens[0].access_token}" \\
  "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1"
      
# Check token info:
curl -H "Authorization: Bearer ${testTokens[0].access_token}" \\
  "https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${testTokens[0].access_token}"
      `,
    });
  } catch (error: any) {
    console.error("Error fetching test token:", error);
    return c.json(
      {
        error: "Failed to fetch test token",
        details: error.message,
      },
      500
    );
  }
}

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
