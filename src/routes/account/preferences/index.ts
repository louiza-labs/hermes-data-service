// src/routes/alertsRoute.ts
import { Hono } from "hono";
import {
	addPreferenceForUser,
	getPreferenceForUser,
	removePreferenceForUser,
} from "../../../handlers/account/preferences";
import { cacheMiddleware } from "../../../middleware/cache";
const preferencesRoute = new Hono();

preferencesRoute.use("/", cacheMiddleware("/preferences"));
preferencesRoute.get("/", getPreferenceForUser);
preferencesRoute.post("/add_preference", addPreferenceForUser);
preferencesRoute.delete("/remove_preference/:preference_name/:preference_value/:user_id", removePreferenceForUser);

export default preferencesRoute;
