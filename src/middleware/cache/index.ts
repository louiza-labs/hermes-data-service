import { Context } from "hono";
import { redisClient } from "../redis/client";

// Middleware to check cache
export const cacheMiddleware = (keyPrefix: string) => {
	return async (c: Context, next: () => Promise<void>) => {
		const key = `${keyPrefix}:${JSON.stringify(c.req.query())}`;
		try {
			const cachedData = await redisClient.get(key);
			if (cachedData) {
				console.log("Serving from cache");
				return c.json(JSON.parse(cachedData));
			} else {
				c.set("cacheKey", key); // Store the key in context for the handler to use
				await next(); // Proceed to handler if no cache
			}
		} catch (err) {
			console.error("Redis error:", err);
			await next();
		}
	};
};
