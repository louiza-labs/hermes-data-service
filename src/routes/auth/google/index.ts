// routes/auth.ts
import { Hono } from "hono";

import { handleGoogleCallback, initiateGoogleAuth } from "../../../handlers/auth/google";
type Variables = {
	jwtPayload: {
		sub: string; // User ID
		exp: number; // Token expiration
	};
};
const auth = new Hono();

auth.get("/auth/google", initiateGoogleAuth);
auth.get("/auth/google/callback", handleGoogleCallback);
// New route for fetching emails, using the refreshTokenMiddleware

export default auth;
