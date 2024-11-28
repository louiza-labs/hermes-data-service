import { generateMatchingJobsForConnections } from "../../lib/intros";
import { normalizeJobData } from "../../lib/normalization";
import { getPreferences } from "../../services/account/verify/preferences";
import { getLinkedinConnectionsFromDB } from "../../services/connections/linkedin";
import { getJobsFromLinkedin, getJobsFromLinkedinFromDB, uploadJobsFromLinkedInToDB } from "../../services/jobs";
import { runJobScraper } from "../../services/jobs/scraper";

export async function getJobs(c: any) {
	const { page, keyword, location, dateSincePosted, limit } = await c.req.query();
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
			(job: any) => !jobsFromDB.find((jobFromDB: any) => job.jobUrl === jobFromDB.jobUrl)
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
	const { position, location, offset, companyJobsUrl } = await c.req.query();
	const { data: jobsFromDB } = await getJobsFromLinkedinFromDB();

	const result = await runJobScraper({ position, location, offset, companyJobsUrl });
	const normalizedFetchedJobResults = normalizeJobData(result);
	if (jobsFromDB?.length && normalizedFetchedJobResults?.length) {
		// Filter jobs that are not already in the DB
		const filteredJobsFromLinkedin = normalizedFetchedJobResults.filter(
			(job: any) => !jobsFromDB.find((jobFromDB: any) => job.jobUrl === jobFromDB.jobUrl)
		);

		if (filteredJobsFromLinkedin.length) {
			// Upload new jobs
			const res = await uploadJobsFromLinkedInToDB(filteredJobsFromLinkedin);
			return c.json([...filteredJobsFromLinkedin, jobsFromDB]);
		}
	} else if (normalizedFetchedJobResults?.length) {
		// No jobs in DB, upload all fetched jobs
		const res = await uploadJobsFromLinkedInToDB(normalizedFetchedJobResults);
		return c.json(normalizedFetchedJobResults);
	}

	// If no jobs were fetched or uploaded, return an empty response
	return c.json({ message: "No new jobs to upload" });
	// If no jobs were fetched or uploaded, return an empty response
}
