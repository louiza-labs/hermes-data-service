import { Context } from "hono";
import { getApplications, updateApplicationStatus } from "../../services/applications";

export async function updateApplicationStatusHandler(c: Context) {
	const applicationId = c.req.param("applicationId");
	const userId = c.req.query("user_id");
	const { newStatus } = await c.req.json();

	if (!applicationId || !newStatus) {
		return c.json({ error: "Application ID and new status are required" }, 400);
	}

	const result = await updateApplicationStatus(applicationId, newStatus);

	if (!result.success) {
		return c.json({ error: "Failed to update application status", details: result.error }, 500);
	}

	return c.json(result.data);
}

export async function getApplicationsHandler(c: Context) {
	const userId = c.req.query("user_id");
	const context = c.req.query("context") || "jobs";

	if (!userId) {
		return c.json({ error: "User ID is required" }, 400);
	}
	console.log("user_id", userId);
	console.log("context", context);

	const result = await getApplications(userId);
	console.log("result", result.data);

	if (!result.success) {
		return c.json({ error: "Failed to fetch applications", details: result.error }, 500);
	}
	// if (c.req.locals && c.req.locals.cacheKey) {
	// 	console.log("storing data in redis");
	// 	await redisClient.set(c.req.locals.cacheKey, JSON.stringify(result.data), {
	// 		EX: 3600, // 1-hour expiration
	// 	});
	// }

	return c.json(result.data);
}
