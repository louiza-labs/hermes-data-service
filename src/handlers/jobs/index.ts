import { generateMatchingJobsForConnections } from "../../lib/intros";
import { normalizeJobData } from "../../lib/normalization";
import { getPreferences } from "../../services/account/verify/preferences";
import { getLinkedinConnectionsFromDB } from "../../services/connections/linkedin";
import {
  getJobsFromLinkedin,
  getJobsFromLinkedinFromDB,
  uploadJobsFromLinkedInToDB,
} from "../../services/jobs";
import {
  runAuthenticatedJobScraper,
  runJobScraper,
} from "../../services/jobs/scraper";

export async function getJobs(c: any) {
  const { page, keyword, location, dateSincePosted, limit } =
    await c.req.query();
  const { data: jobsFetchedFromLinkedin } = await getJobsFromLinkedin({
    page,
    keyword,
    location,
    dateSincePosted,
    limit,
  });

  const { data: jobsFromDB } = await getJobsFromLinkedinFromDB();

  if (jobsFromDB?.length && jobsFetchedFromLinkedin?.length) {
    // Filter jobs that are not already in the DB
    const filteredJobsFromLinkedin = jobsFetchedFromLinkedin.filter(
      (job: any) =>
        !jobsFromDB.find((jobFromDB: any) => job.jobUrl === jobFromDB.jobUrl)
    );

    if (filteredJobsFromLinkedin.length) {
      // Upload new jobs
      const res = await uploadJobsFromLinkedInToDB(filteredJobsFromLinkedin);
      return c.json([...filteredJobsFromLinkedin, jobsFromDB]);
    }
  } else if (jobsFetchedFromLinkedin?.length) {
    // No jobs in DB, upload all fetched jobs
    const res = await uploadJobsFromLinkedInToDB(jobsFetchedFromLinkedin);
    return c.json(jobsFetchedFromLinkedin);
  }

  // If no jobs were fetched or uploaded, return an empty response
  return c.json({ message: "No new jobs to upload" });
}

export async function getRelevantJobsByConnectionsAndPreferences(c: any) {
  const { user_id, showAllJobs } = await c.req.query();

  const { data: jobsFromDB } = await getJobsFromLinkedinFromDB();
  const { data: preferences } = await getPreferences({ user_id });
  const { data: connections } = await getLinkedinConnectionsFromDB({ user_id });

  const filteredConnections = connections.filter((connection) => {
    return connection.Company;
  });
  const filteredJobs = generateMatchingJobsForConnections(
    filteredConnections,
    preferences as any,
    jobsFromDB,
    showAllJobs
  );

  // If no jobs were fetched or uploaded, return an empty response
  return c.json(filteredJobs);
}

export async function getScrapedJobsHandler(c: any) {
  const {
    position,
    location,
    offset,
    companyJobsUrl,
    authenticated,
    limit,
    startPage,
  } = await c.req.query();
  const { data: jobsFromDB } = await getJobsFromLinkedinFromDB();

  // Choose scraper based on authenticated flag
  const result =
    authenticated === "true"
      ? await runAuthenticatedJobScraper({
          position,
          location,
          offset,
          companyJobsUrl,
          limit: limit ? parseInt(limit) : undefined,
          startPage: startPage ? parseInt(startPage) : undefined,
        })
      : await runJobScraper({
          position,
          location,
          offset,
          companyJobsUrl,
        });
  const normalizedFetchedJobResults = normalizeJobData(result);

  // Deduplicate jobs by job_id to prevent database conflicts
  const uniqueJobs = normalizedFetchedJobResults.filter(
    (job: any, index: number, self: any[]) =>
      index === self.findIndex((j: any) => j.job_id === job.job_id)
  );

  console.log(
    `📊 Scraped ${normalizedFetchedJobResults.length} jobs, ${uniqueJobs.length} unique jobs`
  );

  // Debug: Show first few jobs before upload
  if (uniqueJobs.length > 0) {
    console.log("🔍 Sample scraped jobs (first 3):");
    uniqueJobs.slice(0, 3).forEach((job: any, index: number) => {
      console.log(
        `  ${index + 1}. ${job.position} at ${job.company} (${job.location})`
      );
      console.log(`     ID: ${job.job_id}`);
      console.log(`     URL: ${job.jobUrl}`);
      console.log(`     Date: ${job.date}`);
    });
  }

  if (jobsFromDB?.length && uniqueJobs?.length) {
    // Filter jobs that are not already in the DB
    const filteredJobsFromLinkedin = uniqueJobs.filter(
      (job: any) =>
        !jobsFromDB.find((jobFromDB: any) => job.jobUrl === jobFromDB.jobUrl)
    );

    if (filteredJobsFromLinkedin.length) {
      // Upload new jobs
      const res = await uploadJobsFromLinkedInToDB(filteredJobsFromLinkedin);
      return c.json([...filteredJobsFromLinkedin, jobsFromDB]);
    }
  } else if (uniqueJobs?.length) {
    // No jobs in DB, upload all fetched jobs
    const res = await uploadJobsFromLinkedInToDB(uniqueJobs);
    return c.json(uniqueJobs);
  }

  // If no jobs were fetched or uploaded, return an empty response
  return c.json({ message: "No new jobs to upload" });
  // If no jobs were fetched or uploaded, return an empty response
}

// Debug endpoint to see scraped jobs without uploading
export async function getScrapedJobsDebugHandler(c: any) {
  const {
    position,
    location,
    offset,
    companyJobsUrl,
    authenticated,
    limit,
    startPage,
  } = await c.req.query();

  // Choose scraper based on authenticated flag
  const result =
    authenticated === "true"
      ? await runAuthenticatedJobScraper({
          position,
          location,
          offset,
          companyJobsUrl,
          limit: limit ? parseInt(limit) : undefined,
          startPage: startPage ? parseInt(startPage) : undefined,
        })
      : await runJobScraper({
          position,
          location,
          offset,
          companyJobsUrl,
        });
  const normalizedFetchedJobResults = normalizeJobData(result);

  // Deduplicate jobs by job_id to prevent database conflicts
  const uniqueJobs = normalizedFetchedJobResults.filter(
    (job: any, index: number, self: any[]) =>
      index === self.findIndex((j: any) => j.job_id === job.job_id)
  );

  console.log(
    `📊 Scraped ${normalizedFetchedJobResults.length} jobs, ${uniqueJobs.length} unique jobs`
  );

  // Return the jobs without uploading to database
  return c.json({
    message: "Debug mode - jobs not uploaded to database",
    totalScraped: normalizedFetchedJobResults.length,
    uniqueJobs: uniqueJobs.length,
    jobs: uniqueJobs,
  });
}
