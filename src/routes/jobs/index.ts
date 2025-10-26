import { Hono } from "hono";
import {
  getRelevantJobsByConnectionsAndPreferences,
  getScrapedJobsDebugHandler,
  getScrapedJobsHandler,
} from "../../handlers/jobs";

const jobsRoute = new Hono();

jobsRoute.get(
  "/jobs/relevant_jobs",
  getRelevantJobsByConnectionsAndPreferences
);
jobsRoute.get("/jobs/get_and_upload", getScrapedJobsHandler);
jobsRoute.get("/jobs/debug", getScrapedJobsDebugHandler);

export default jobsRoute;
