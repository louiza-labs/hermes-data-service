import { MiddlewareHandler } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { initializeRedis, redisClient } from "../redis/client";
import RedisStore from "../redis/store";

// Initialize Redis client
initializeRedis();

// Extend Hono's request to include the 'session' property
declare module "hono" {
	interface HonoRequest {
		session?: Record<string, any>;
	}
}

interface SessionOptions {
	secret: string;
	store: RedisStore;
	cookie?: {
		secure?: boolean;
		httpOnly?: boolean;
		maxAge?: number;
		path?: string;
		sameSite?: "Strict" | "Lax" | "None";
	};
}

// Helper function to generate a session ID
const generateSessionId = (): string => {
	return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

const createSessionMiddleware = (opts: SessionOptions): MiddlewareHandler => {
	const { store, cookie } = opts;

	return async (c, next) => {
		// Retrieve session ID from cookies or generate a new one
		const sid = getCookie(c, "sid") || generateSessionId();
		let sessionData = await store.get(sid);

		// Initialize session if not present
		if (!sessionData) {
			sessionData = {};
		}

		// Attach session to the request object
		c.req.session = sessionData;

		// Proceed with the next middleware/handler
		await next();

		// Save the updated session
		if (c.req.session) {
			await store.set(sid, c.req.session);
		}

		// Set the session cookie using Hono's cookie helper
		setCookie(c, "sid", sid, {
			path: cookie?.path || "/",
			secure: cookie?.secure ?? false,
			httpOnly: cookie?.httpOnly ?? true,
			maxAge: cookie?.maxAge ?? 86400, // 1 day in seconds
			sameSite: cookie?.sameSite || "Lax",
		});
	};
};

// Define session middleware options
const sessionMiddleware = createSessionMiddleware({
	store: new RedisStore({ client: redisClient }),
	secret: process.env.SESSION_SECRET || "mysecret",
	cookie: {
		secure: process.env.NODE_ENV === "production",
		httpOnly: true,
		maxAge: 24 * 60 * 60, // 1 day in seconds
		path: "/",
		sameSite: "Lax",
	},
});

export default sessionMiddleware;
