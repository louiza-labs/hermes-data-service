import { Hono } from "hono";
import { getApplicationsHandler, updateApplicationStatusHandler } from "../../handlers/applications";

const app = new Hono();

app.put("/applications/:applicationId/status", updateApplicationStatusHandler);
app.get("/applications", getApplicationsHandler);

export default app;
