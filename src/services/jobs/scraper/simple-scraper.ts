import { Browser, BrowserContext, chromium } from "playwright";

export interface SimpleJobData {
  id: string;
  title: string;
  company: string;
  location: string;
  date: string;
  link: string;
}

export class SimpleLinkedInScraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  async initialize(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-web-security",
        "--disable-features=VizDisplayCompositor",
        "--disable-blink-features=AutomationControlled",
      ],
    });

    this.context = await this.browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: { width: 1366, height: 768 },
    });
  }

  async scrapeJobs(params: {
    position?: string;
    location: string;
    limit?: number;
  }): Promise<SimpleJobData[]> {
    if (!this.browser) {
      throw new Error("Browser not initialized");
    }

    const page = await this.context!.newPage();

    try {
      // Build search URL
      const searchUrl = this.buildSearchUrl(params);
      console.log(`Navigating to: ${searchUrl}`);

      // Navigate with shorter timeout
      await page.goto(searchUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // Wait a bit for content to load
      await page.waitForTimeout(3000);

      // Extract jobs with simpler selectors
      const jobs = await page.evaluate(() => {
        const jobElements = document.querySelectorAll(
          "[data-job-id], .job-search-card, .jobs-search-results__list-item"
        );
        const jobs: SimpleJobData[] = [];

        jobElements.forEach((element) => {
          try {
            const titleEl =
              element.querySelector('a[data-control-name="job_card_click"]') ||
              element.querySelector(".job-search-card__title a") ||
              element.querySelector("h3 a");

            const companyEl =
              element.querySelector(".job-search-card__subtitle a") ||
              element.querySelector(".job-search-card__subtitle") ||
              element.querySelector(
                '[data-control-name="job_card_company_link"]'
              );

            const locationEl =
              element.querySelector(".job-search-card__location") ||
              element.querySelector(".job-search-card__metadata-item");

            const dateEl =
              element.querySelector(".job-search-card__listdate") ||
              element.querySelector(".job-search-card__metadata-item--bullet");

            if (titleEl) {
              const job: SimpleJobData = {
                id:
                  element.getAttribute("data-job-id") ||
                  Math.random().toString(36).substr(2, 9),
                title: titleEl.textContent?.trim() || "",
                company: companyEl?.textContent?.trim() || "",
                location: locationEl?.textContent?.trim() || "",
                date: dateEl?.textContent?.trim() || "",
                link: titleEl.getAttribute("href") || "",
              };

              if (job.title && job.company) {
                jobs.push(job);
              }
            }
          } catch (error) {
            console.log("Error extracting job:", error);
          }
        });

        return jobs;
      });

      console.log(`Found ${jobs.length} jobs`);
      return jobs.slice(0, params.limit || 100);
    } catch (error) {
      console.error("Scraping error:", error);
      throw error;
    } finally {
      if (page) {
        try {
          await page.close();
        } catch (error) {
          console.log("Error closing page:", error);
        }
      }
    }
  }

  private buildSearchUrl(params: {
    position?: string;
    location: string;
  }): string {
    const baseUrl = "https://www.linkedin.com/jobs/search";
    const searchParams = new URLSearchParams();

    if (params.position) {
      searchParams.append("keywords", params.position);
    }

    searchParams.append("location", params.location);
    searchParams.append("f_TPR", "r604800"); // Past week
    searchParams.append("f_JT", "F"); // Full-time

    return `${baseUrl}?${searchParams.toString()}`;
  }

  async close(): Promise<void> {
    if (this.context) {
      try {
        await this.context.close();
      } catch (error) {
        console.log("Error closing context:", error);
      }
      this.context = null;
    }

    if (this.browser) {
      try {
        await this.browser.close();
      } catch (error) {
        console.log("Error closing browser:", error);
      }
      this.browser = null;
    }
  }
}

// Factory function
export async function createSimpleScraper(): Promise<SimpleLinkedInScraper> {
  const scraper = new SimpleLinkedInScraper();
  await scraper.initialize();
  return scraper;
}
