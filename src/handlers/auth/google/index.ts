import { Context } from "hono";
import { ensureFreshTokens, exchangeCodeForTokens, getGoogleAuthUrl } from "../../../services/auth/google";

// Initiates Google OAuth
export const initiateGoogleAuth = async (c: Context) => {
	try {
		const userId = c.req.query("user_id");
		if (!userId) {
			return c.json({ error: "User ID is required" }, 400);
		}

		const state = encodeURIComponent(JSON.stringify({ userId }));
		const authUrl = getGoogleAuthUrl(state);
		console.log("Generated auth URL:", authUrl);
		return c.redirect(authUrl);
	} catch (error) {
		console.error("Failed to generate auth URL:", error);
		return c.json({ error: "Failed to initiate Google Auth" }, 500);
	}
};

// Handles the OAuth callback
export const handleGoogleCallback = async (c: Context) => {
	const code = c.req.query("code");
	const state = c.req.query("state");

	if (!code || !state) {
		return c.json({ error: "Missing required parameters" }, 400);
	}

	try {
		const { userId } = JSON.parse(decodeURIComponent(state));
		if (!userId) {
			return c.json({ error: "Invalid state" }, 400);
		}

		const { tokens, email } = await exchangeCodeForTokens(code, userId);

		// Redirect with both success and email info
		const redirectUrl = new URL("http://localhost:3000/tracker/");
		redirectUrl.searchParams.set("success", "true");
		redirectUrl.searchParams.set("email", email);

		return c.redirect(redirectUrl.toString());
	} catch (error) {
		console.error("OAuth callback failed:", error);
		return c.json({ error: "OAuth callback failed" }, 500);
	}
};

export const refreshTokenMiddleware = async (c: Context, next: () => Promise<void>) => {
	try {
		const { user_id } = c.req.query();
		await ensureFreshTokens(user_id);
		await next();
	} catch (error) {
		return c.json({ error: "Failed to refresh token" }, 401);
	}
};
