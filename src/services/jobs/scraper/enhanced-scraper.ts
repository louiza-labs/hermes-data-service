import {
  CustomLinkedInScraper,
  JobData,
  ScraperConfig,
} from "./custom-scraper";
import {
  calculateRetryDelay,
  isRateLimited,
  isValidJobData,
  randomDelay,
  sanitizeJobData,
  shouldRetry,
} from "./utils";

export interface EnhancedScraperConfig extends ScraperConfig {
  enableRateLimiting?: boolean;
  maxConcurrentRequests?: number;
  requestDelay?: number;
  enableJobDescriptionScraping?: boolean;
  enableRetryMechanism?: boolean;
}

export class EnhancedLinkedInScraper {
  private scraper: CustomLinkedInScraper;
  private config: EnhancedScraperConfig;
  private requestQueue: Array<() => Promise<any>> = [];
  private activeRequests = 0;

  constructor(config: EnhancedScraperConfig = {}) {
    this.config = {
      enableRateLimiting: true,
      maxConcurrentRequests: 3,
      requestDelay: 2000,
      enableJobDescriptionScraping: false,
      enableRetryMechanism: true,
      maxRetries: 3,
      ...config,
    };

    this.scraper = new CustomLinkedInScraper(config);
  }

  async initialize(): Promise<void> {
    await this.scraper.initialize();
  }

  async scrapeJobsWithRetry(params: {
    position?: string;
    location: string;
    offset?: number;
    companyJobsUrl?: string;
    limit?: number;
  }): Promise<JobData[]> {
    let attempt = 0;
    const maxRetries = this.config.maxRetries || 3;

    while (attempt <= maxRetries) {
      try {
        console.log(`Scraping attempt ${attempt + 1}/${maxRetries + 1}`);

        // Reinitialize scraper if connection is lost
        if (attempt > 0) {
          console.log("Reinitializing scraper for retry...");
          await this.scraper.close();
          // Add delay before reinitializing to avoid rapid reconnection
          await new Promise((resolve) => setTimeout(resolve, 2000));
          this.scraper = new CustomLinkedInScraper(this.config);
          await this.scraper.initialize();
        }

        const jobs = await this.scraper.scrapeJobs(params);

        // Validate and sanitize job data
        const validJobs = jobs.filter(isValidJobData).map(sanitizeJobData);

        console.log(`Successfully scraped ${validJobs.length} jobs`);
        return validJobs;
      } catch (error) {
        console.error(`Scraping attempt ${attempt + 1} failed:`, error);

        if (isRateLimited(error)) {
          console.log("Rate limited detected, waiting before retry...");
          await randomDelay(5000, 10000);
        }

        if (!shouldRetry(error, attempt, maxRetries)) {
          throw error;
        }

        attempt++;
        if (attempt <= maxRetries) {
          const delay = calculateRetryDelay(attempt);
          console.log(`Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`Failed to scrape jobs after ${maxRetries + 1} attempts`);
  }

  async scrapeJobsWithDescriptions(params: {
    position?: string;
    location: string;
    offset?: number;
    companyJobsUrl?: string;
    limit?: number;
  }): Promise<JobData[]> {
    if (!this.config.enableJobDescriptionScraping) {
      return this.scrapeJobsWithRetry(params);
    }

    // First, get the basic job listings
    const jobs = await this.scrapeJobsWithRetry(params);

    // Then, scrape descriptions for each job
    const jobsWithDescriptions: JobData[] = [];

    for (const job of jobs) {
      try {
        if (this.config.enableRateLimiting) {
          await this.waitForRateLimit();
        }

        const description = await this.scraper.getJobDescription(job.link);
        jobsWithDescriptions.push({
          ...job,
          description,
        });

        // Add delay between requests
        if (this.config.requestDelay) {
          await randomDelay(
            this.config.requestDelay,
            this.config.requestDelay + 1000
          );
        }
      } catch (error) {
        console.error(`Failed to get description for job ${job.id}:`, error);
        // Add job without description
        jobsWithDescriptions.push(job);
      }
    }

    return jobsWithDescriptions;
  }

  private async waitForRateLimit(): Promise<void> {
    if (this.activeRequests >= (this.config.maxConcurrentRequests || 3)) {
      // Wait for a request to complete
      await new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (this.activeRequests < (this.config.maxConcurrentRequests || 3)) {
            clearInterval(checkInterval);
            resolve(void 0);
          }
        }, 100);
      });
    }
  }

  async batchScrapeJobs(
    jobParams: Array<{
      position?: string;
      location: string;
      offset?: number;
      companyJobsUrl?: string;
      limit?: number;
    }>
  ): Promise<JobData[]> {
    const allJobs: JobData[] = [];

    for (const params of jobParams) {
      try {
        console.log(
          `Scraping jobs for: ${params.position || "All positions"} in ${
            params.location
          }`
        );

        const jobs = await this.scrapeJobsWithRetry(params);
        allJobs.push(...jobs);

        // Add delay between different search queries
        if (this.config.requestDelay) {
          await randomDelay(
            this.config.requestDelay,
            this.config.requestDelay + 2000
          );
        }
      } catch (error) {
        console.error(`Failed to scrape jobs for ${params.location}:`, error);
        // Continue with next search
      }
    }

    return allJobs;
  }

  async getJobMetrics(): Promise<{
    totalJobs: number;
    successfulJobs: number;
    failedJobs: number;
    averageResponseTime: number;
  }> {
    // This would be implemented to track scraping metrics
    return {
      totalJobs: 0,
      successfulJobs: 0,
      failedJobs: 0,
      averageResponseTime: 0,
    };
  }

  async close(): Promise<void> {
    await this.scraper.close();
  }
}

// Factory function for easy usage
export async function createEnhancedScraper(
  config?: EnhancedScraperConfig
): Promise<EnhancedLinkedInScraper> {
  const scraper = new EnhancedLinkedInScraper(config);
  await scraper.initialize();
  return scraper;
}
