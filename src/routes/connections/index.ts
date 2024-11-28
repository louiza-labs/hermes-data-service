import { Hono } from "hono";
import { cacheMiddleware } from "../../middleware/cache";
import icebreakerRoutes from "./icebreaker";
import linkedInRoutes from "./linkedin";
import twitterRoutes from "./twitter";
const connectionsRoute = new Hono();

connectionsRoute.use("/connections/icebreaker", cacheMiddleware("/connections/icebreaker"));
connectionsRoute.route("/connections/icebreaker", icebreakerRoutes);

connectionsRoute.use("/connections/linkedin", cacheMiddleware("/connections/linkedin"));
connectionsRoute.route("/connections/linkedin", linkedInRoutes);

connectionsRoute.use("/connections/twitter", cacheMiddleware("/connections/twitter"));
connectionsRoute.route("/connections/twitter", twitterRoutes);

export default connectionsRoute;
