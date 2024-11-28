import { Hono } from "hono";
import { fetchAllCompaniesHandler, fetchCompaniesHandler } from "../../handlers/companies";
import { cacheMiddleware } from "../../middleware/cache";

const companiesRoute = new Hono();

companiesRoute.use("/companies", cacheMiddleware("/companies"));
companiesRoute.get("/companies", fetchCompaniesHandler);
companiesRoute.get("/all_companies", fetchAllCompaniesHandler);

export default companiesRoute;
