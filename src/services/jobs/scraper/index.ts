import { createAuthenticatedScraper } from "./authenticated-scraper";
import { JobData } from "./custom-scraper";
import { createEnhancedScraper } from "./enhanced-scraper";
import { createSimpleScraper, SimpleJobData } from "./simple-scraper";

// Legacy function for backward compatibility
export const runJobScraper = async ({
  position,
  location,
  offset,
  companyJobsUrl,
}: {
  position?: string;
  location: string;
  offset?: number;
  companyJobsUrl?: string;
}) => {
  console.log("Using custom in-house LinkedIn scraper...");

  const scraper = await createEnhancedScraper({
    headless: true,
    slowMo: 500, // Faster
    timeout: 30000, // 30 seconds instead of 10 minutes
    enableRateLimiting: true,
    maxConcurrentRequests: 2,
    requestDelay: 1000, // Faster
    enableJobDescriptionScraping: false,
    enableRetryMechanism: true,
    maxRetries: 2, // Fewer retries for faster testing
  });

  try {
    const jobs = await scraper.scrapeJobsWithRetry({
      position,
      location,
      offset,
      companyJobsUrl,
      limit: 100,
    });

    // Transform to legacy format for backward compatibility
    const legacyJobs = jobs.map((job: JobData) => ({
      location: job.location,
      id: job.id,
      title: job.title,
      company: job.company || "N/A",
      companyLink: job.companyLink || "N/A",
      companyImgLink: job.companyImgLink || "N/A",
      place: job.location,
      date: job.date,
      link: job.link,
      applyLink: job.applyLink || "N/A",
    }));

    console.log(`Successfully scraped ${legacyJobs.length} jobs`);
    return legacyJobs;
  } catch (error) {
    console.error(
      "Enhanced scraper failed, trying simple scraper fallback:",
      error
    );

    // Fallback to simple scraper
    try {
      console.log("Attempting fallback with simple scraper...");
      const simpleScraper = await createSimpleScraper();

      const simpleJobs = await simpleScraper.scrapeJobs({
        position,
        location,
        limit: 100,
      });

      // Transform simple jobs to legacy format
      const fallbackJobs = simpleJobs.map((job: SimpleJobData) => ({
        location: job.location,
        id: job.id,
        title: job.title,
        company: job.company || "N/A",
        companyLink: "N/A",
        companyImgLink: "N/A",
        place: job.location,
        date: job.date,
        link: job.link,
        applyLink: "N/A",
      }));

      console.log(`Simple scraper found ${fallbackJobs.length} jobs`);
      await simpleScraper.close();
      return fallbackJobs;
    } catch (fallbackError) {
      console.error("Simple scraper also failed:", fallbackError);
      throw error; // Throw original error
    }
  } finally {
    await scraper.close();
  }
};

// New enhanced scraper function
export const runEnhancedJobScraper = async ({
  position,
  location,
  offset,
  companyJobsUrl,
  enableDescriptions = false,
  limit = 100,
}: {
  position?: string;
  location: string;
  offset?: number;
  companyJobsUrl?: string;
  enableDescriptions?: boolean;
  limit?: number;
}) => {
  const scraper = await createEnhancedScraper({
    headless: true,
    slowMo: 1000,
    timeout: 600000,
    enableRateLimiting: true,
    maxConcurrentRequests: 2,
    requestDelay: 2000,
    enableJobDescriptionScraping: enableDescriptions,
    enableRetryMechanism: true,
    maxRetries: 3,
  });

  try {
    const jobs = enableDescriptions
      ? await scraper.scrapeJobsWithDescriptions({
          position,
          location,
          offset,
          companyJobsUrl,
          limit,
        })
      : await scraper.scrapeJobsWithRetry({
          position,
          location,
          offset,
          companyJobsUrl,
          limit,
        });

    console.log(`Successfully scraped ${jobs.length} jobs`);
    return jobs;
  } catch (error) {
    console.error("Enhanced scraper failed:", error);
    throw error;
  } finally {
    await scraper.close();
  }
};

// Batch scraping function for multiple locations/positions
export const runBatchJobScraper = async (
  searchParams: Array<{
    position?: string;
    location: string;
    offset?: number;
    companyJobsUrl?: string;
    limit?: number;
  }>
) => {
  const scraper = await createEnhancedScraper({
    headless: true,
    slowMo: 1000,
    timeout: 600000,
    enableRateLimiting: true,
    maxConcurrentRequests: 1, // Be more conservative for batch operations
    requestDelay: 3000,
    enableJobDescriptionScraping: false,
    enableRetryMechanism: true,
    maxRetries: 3,
  });

  try {
    const allJobs = await scraper.batchScrapeJobs(searchParams);
    console.log(
      `Successfully scraped ${allJobs.length} jobs across ${searchParams.length} searches`
    );
    return allJobs;
  } catch (error) {
    console.error("Batch scraper failed:", error);
    throw error;
  } finally {
    await scraper.close();
  }
};

// Authenticated scraper function
export const runAuthenticatedJobScraper = async ({
  position,
  location,
  offset,
  companyJobsUrl,
  limit = 100,
}: {
  position?: string;
  location: string;
  offset?: number;
  companyJobsUrl?: string;
  limit?: number;
}) => {
  console.log("Using authenticated LinkedIn scraper...");

  const scraper = await createAuthenticatedScraper({
    headless: true,
    slowMo: 500,
    timeout: 30000,
    delayBetweenRequests: 1000,
    maxRetries: 2,
  });

  try {
    const jobs = await scraper.scrapeJobs({
      position,
      location,
      offset,
      companyJobsUrl,
      limit,
    });

    // Transform to legacy format for backward compatibility
    const legacyJobs = jobs.map((job: JobData) => ({
      location: job.location,
      id: job.id,
      title: job.title,
      company: job.company || "N/A",
      companyLink: job.companyLink || "N/A",
      companyImgLink: job.companyImgLink || "N/A",
      place: job.location,
      date: job.date,
      link: job.link,
      applyLink: job.applyLink || "N/A",
    }));

    console.log(
      `Successfully scraped ${legacyJobs.length} jobs with authentication`
    );
    return legacyJobs;
  } catch (error) {
    console.error("Authenticated scraper failed:", error);
    throw error;
  } finally {
    await scraper.close();
  }
};
