import { Hono } from "hono";
import { logger } from "hono/logger";

import { configDotenv } from "dotenv";
import { bearerAuth } from "hono/bearer-auth";

import sessionMiddleware from "./middleware/session";
import accountRoute from "./routes/account";
import applicationsRoute from "./routes/applications";
import authRoute from "./routes/auth/google";
import companiesRoute from "./routes/companies";
import connectionsRoute from "./routes/connections";
import emailRoute from "./routes/email";
import emailsRoute from "./routes/emails";
import jobsRoute from "./routes/jobs";
import subscriptionRoute from "./routes/subscribe";

const app = new Hono();
configDotenv();

app.use(logger());
// NEEDS TO BE BEFORE BEARER AUTH
app.route("/api", authRoute);

app.use(bearerAuth({ token: process.env.VALID_API_KEY ?? "😭" }));

app.use(sessionMiddleware);

app.route("/api", emailsRoute);

// Use the routes
app.route("/api", subscriptionRoute);
app.route("/api", applicationsRoute);
app.route("/api", connectionsRoute);
app.route("/api", jobsRoute);
app.route("/api", accountRoute);
app.route("/api", emailRoute);
app.route("/api", companiesRoute);

export default app;
