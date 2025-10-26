import { Browser, Page } from "puppeteer";
import puppeteer from "puppeteer-extra";
import { getRandomUserAgent, randomDelay } from "./utils.js";
import StealthPlugin = require("puppeteer-extra-plugin-stealth");

// Add stealth plugin
puppeteer.use(StealthPlugin());

export interface StealthScraperConfig {
  headless?: boolean;
  slowMo?: number;
  timeout?: number;
  maxRetries?: number;
  delayBetweenRequests?: number;
  useProxy?: boolean;
  proxyConfig?: {
    server: string;
    username?: string;
    password?: string;
  };
}

export class StealthLinkedInScraper {
  private browser: Browser | null = null;
  private config: StealthScraperConfig;

  constructor(config: StealthScraperConfig = {}) {
    this.config = {
      headless: true,
      slowMo: 1000,
      timeout: 60000,
      maxRetries: 3,
      delayBetweenRequests: 2000,
      useProxy: false,
      ...config,
    };
  }

  async initialize(): Promise<void> {
    const launchOptions: any = {
      headless: this.config.headless,
      slowMo: this.config.slowMo,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
        "--disable-web-security",
        "--disable-features=VizDisplayCompositor",
        "--disable-blink-features=AutomationControlled",
        "--disable-extensions",
        "--disable-plugins",
        "--disable-images", // Faster loading
        "--disable-javascript", // We'll enable it selectively
        "--disable-default-apps",
        "--disable-sync",
        "--disable-translate",
        "--hide-scrollbars",
        "--mute-audio",
        "--no-default-browser-check",
        "--no-pings",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
      ],
    };

    // Add proxy configuration if enabled
    if (this.config.useProxy && this.config.proxyConfig) {
      launchOptions.args.push(
        `--proxy-server=${this.config.proxyConfig.server}`
      );
    }

    this.browser = await puppeteer.launch(launchOptions);
  }

  async scrapeJobs(params: {
    position?: string;
    location: string;
    offset?: number;
    companyJobsUrl?: string;
    limit?: number;
  }): Promise<any[]> {
    if (!this.browser) {
      throw new Error("Browser not initialized. Call initialize() first.");
    }

    const page = await this.browser.newPage();

    try {
      // Set up enhanced stealth measures
      await this.setupEnhancedStealth(page);

      // Navigate to LinkedIn jobs
      const searchUrl = this.buildSearchUrl(params);
      console.log(`Navigating to: ${searchUrl}`);

      await page.goto(searchUrl, {
        waitUntil: "networkidle2",
        timeout: this.config.timeout,
      });

      // Wait for jobs to load
      await page.waitForSelector("[data-job-id]", { timeout: 15000 });

      const jobs: any[] = [];
      let currentPage = 1;
      const maxPages = Math.ceil((params.limit || 100) / 25);

      while (currentPage <= maxPages && jobs.length < (params.limit || 100)) {
        console.log(`Scraping page ${currentPage}`);

        const pageJobs = await this.extractJobsFromPage(page);
        jobs.push(...pageJobs);

        // Navigate to next page if needed
        if (currentPage < maxPages && jobs.length < (params.limit || 100)) {
          const hasNextPage = await this.navigateToNextPage(page);
          if (!hasNextPage) break;
          currentPage++;
        } else {
          break;
        }
      }

      return jobs.slice(0, params.limit || 100);
    } finally {
      try {
        if (!page.isClosed()) {
          await page.close();
        }
      } catch (error) {
        console.log("Page already closed or error closing page:", error);
      }
    }
  }

  private async setupEnhancedStealth(page: Page): Promise<void> {
    // Set random user agent
    await page.setUserAgent(getRandomUserAgent());

    // Set viewport
    await page.setViewport({ width: 1366, height: 768 });

    // Enhanced stealth measures
    await page.evaluateOnNewDocument(() => {
      // Remove webdriver property
      Object.defineProperty(navigator, "webdriver", {
        get: () => undefined,
      });

      // Override the plugins property
      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5],
      });

      // Override the languages property
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en"],
      });

      // Override the permissions property
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) =>
        parameters.name === "notifications"
          ? Promise.resolve({ state: Notification.permission } as any)
          : originalQuery(parameters);

      // Override chrome property
      Object.defineProperty(navigator, "chrome", {
        get: () => ({
          runtime: {},
          loadTimes: function () {},
          csi: function () {},
          app: {},
        }),
      });

      // Override the getParameter method
      const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function (parameter) {
        if (parameter === 37445) {
          return "Intel Inc.";
        }
        if (parameter === 37446) {
          return "Intel Iris OpenGL Engine";
        }
        return originalGetParameter(parameter);
      };

      // Override the toString method
      const originalToString = Function.prototype.toString;
      Function.prototype.toString = function () {
        if (this === window.navigator.permissions.query) {
          return "function query() { [native code] }";
        }
        return originalToString.call(this);
      };
    });

    // Set extra headers
    await page.setExtraHTTPHeaders({
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      DNT: "1",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
    });

    // Block unnecessary resources
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const resourceType = req.resourceType();
      if (["image", "stylesheet", "font", "media"].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });
  }

  private buildSearchUrl(params: {
    position?: string;
    location: string;
    offset?: number;
    companyJobsUrl?: string;
  }): string {
    const baseUrl = "https://www.linkedin.com/jobs/search";
    const searchParams = new URLSearchParams();

    if (params.position) {
      searchParams.append("keywords", params.position);
    }

    searchParams.append("location", params.location);

    if (params.offset && params.offset > 1) {
      searchParams.append("start", String((params.offset - 1) * 25));
    }

    // Add filters
    searchParams.append("f_TPR", "r604800"); // Past week
    searchParams.append("f_JT", "F"); // Full-time
    searchParams.append("f_WT", "2,1,3"); // On-site, Remote, Hybrid

    if (params.companyJobsUrl) {
      return params.companyJobsUrl;
    }

    return `${baseUrl}?${searchParams.toString()}`;
  }

  private async extractJobsFromPage(page: Page): Promise<any[]> {
    return await page.evaluate(() => {
      const jobs: any[] = [];
      const jobElements = document.querySelectorAll("[data-job-id]");

      jobElements.forEach((element) => {
        try {
          const jobId = element.getAttribute("data-job-id") || "";
          const titleElement = element.querySelector(
            ".job-search-card__title a"
          );
          const companyElement = element.querySelector(
            ".job-search-card__subtitle a"
          );
          const locationElement = element.querySelector(
            ".job-search-card__location"
          );
          const dateElement = element.querySelector(
            ".job-search-card__listdate"
          );
          const linkElement = element.querySelector(
            ".job-search-card__title a"
          );
          const companyImgElement = element.querySelector(
            ".job-search-card__logo img"
          );

          if (titleElement && companyElement) {
            const job = {
              id: jobId,
              title: titleElement.textContent?.trim() || "",
              company: companyElement.textContent?.trim() || "",
              companyLink: companyElement.getAttribute("href") || "",
              companyImgLink: companyImgElement?.getAttribute("src") || "",
              location: locationElement?.textContent?.trim() || "",
              date: dateElement?.textContent?.trim() || "",
              link: linkElement?.getAttribute("href") || "",
              applyLink: "",
              description: "",
              salary: "",
              jobType: "",
              experienceLevel: "",
            };

            jobs.push(job);
          }
        } catch (error) {
          console.error("Error extracting job data:", error);
        }
      });

      return jobs;
    });
  }

  private async navigateToNextPage(page: Page): Promise<boolean> {
    try {
      const nextButton = await page.$('button[aria-label="Next"]');
      if (nextButton) {
        await nextButton.click();
        await page.waitForSelector("[data-job-id]", { timeout: 15000 });
        await randomDelay(3000, 5000); // Longer delay between pages
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error navigating to next page:", error);
      return false;
    }
  }

  async getJobDescription(jobUrl: string): Promise<string> {
    if (!this.browser) {
      throw new Error("Browser not initialized. Call initialize() first.");
    }

    const page = await this.browser.newPage();

    try {
      await this.setupEnhancedStealth(page);
      await page.goto(jobUrl, { waitUntil: "networkidle2" });

      const description = await page.evaluate(() => {
        const descriptionElement = document.querySelector(".jobs-description");
        return (
          descriptionElement?.textContent?.replace(/[\s\n\r]+/g, " ").trim() ||
          ""
        );
      });

      return description;
    } finally {
      try {
        if (!page.isClosed()) {
          await page.close();
        }
      } catch (error) {
        console.log("Page already closed or error closing page:", error);
      }
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

// Factory function for easy usage
export async function createStealthScraper(
  config?: StealthScraperConfig
): Promise<StealthLinkedInScraper> {
  const scraper = new StealthLinkedInScraper(config);
  await scraper.initialize();
  return scraper;
}
