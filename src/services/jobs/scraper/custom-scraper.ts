import { Browser, BrowserContext, chromium, Page } from "playwright";
import { getRandomUserAgent, randomDelay } from "./utils.js"; // Assuming utils exists

// Renaming for clarity based on context-only usage
type BrowserOrContext = Browser | BrowserContext;

export interface JobData {
  id: string;
  title: string;
  company: string;
  companyLink: string;
  companyImgLink: string;
  location: string;
  date: string;
  link: string;
  applyLink: string;
  description?: string;
  salary?: string;
  jobType?: string;
  experienceLevel?: string;
}

export interface ScraperConfig {
  headless?: boolean;
  slowMo?: number;
  timeout?: number;
  maxRetries?: number;
  delayBetweenRequests?: number;
}

export class CustomLinkedInScraper {
  // 1. FIX: Removed private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private config: ScraperConfig;

  constructor(config: ScraperConfig = {}) {
    this.config = {
      headless: true,
      slowMo: 400,
      timeout: 60000,
      maxRetries: 3,
      delayBetweenRequests: 2000,
      ...config,
    };
  }

  /** ------------------ INITIALIZATION ------------------ */
  async initialize(): Promise<void> {
    await this.close();
    console.log("🟡 Launching Chromium persistent context...");

    try {
      this.context = await chromium.launchPersistentContext(
        "/tmp/chrome-data",
        {
          headless: false,
          slowMo: this.config.slowMo,
          timeout: 30000,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--disable-accelerated-2d-canvas",
            "--disable-web-security",
            "--disable-blink-features=AutomationControlled",
            "--disable-features=VizDisplayCompositor",
            "--disable-features=site-per-process",
            "--no-first-run",
            "--disable-background-timer-throttling",
            "--disable-backgrounding-occluded-windows",
            "--disable-renderer-backgrounding",
            "--disable-extensions",
            "--disable-plugins",
            "--disable-default-apps",
            "--disable-sync",
            "--disable-translate",
            "--hide-scrollbars",
            "--mute-audio",
            "--no-default-browser-check",
            "--no-pings",
            "--disable-background-networking",
            "--disable-component-extensions-with-background-pages",
            "--disable-ipc-flooding-protection",
          ],
          userAgent: getRandomUserAgent(),
          viewport: { width: 1366, height: 768 },
          ignoreHTTPSErrors: true,
          javaScriptEnabled: true,
          extraHTTPHeaders: {
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Cache-Control": "max-age=0",
          },
        }
      );

      // 2. FIX: Attach disconnected listener to the BrowserContext
      // Note: context.on('close') is also useful for explicit closure
      this.context.on("close", () => {
        console.warn("⚠️ Browser context disconnected unexpectedly.");
        this.context = null; // Clear context to trigger re-initialization
      });

      console.log("✅ Browser initialized successfully.");
    } catch (error) {
      console.error("❌ Failed to initialize browser:", error);
      throw error;
    }
  }

  private async ensureBrowserReady(): Promise<void> {
    // 3. FIX: Only check the context
    if (!this.context) {
      console.log("Browser context not ready — restarting...");
      await this.initialize();
    }
  }

  /** ------------------ MAIN SCRAPE ------------------ */
  async scrapeJobs(params: {
    position?: string;
    location: string;
    offset?: number;
    companyJobsUrl?: string;
    limit?: number;
  }): Promise<JobData[]> {
    await this.ensureBrowserReady();
    let page: Page | null = null;

    try {
      // It's crucial to check this.context! here as ensureBrowserReady guarantees it.
      page = await this.context!.newPage();
      await this.setupStealth(page);

      const searchUrl = this.buildSearchUrl(params);
      console.log(`🌐 Navigating to: ${searchUrl}`);

      await page.goto(searchUrl, {
        waitUntil: "domcontentloaded",
        timeout: this.config.timeout,
      });

      console.log(`📄 Page title: "${await page.title()}"`);
      console.log(`🔗 URL: ${page.url()}`);

      // Handle LinkedIn sign-in modal popup
      try {
        const dismissButton = await page.$(
          'button[aria-label="Dismiss"][data-tracking-control-name="public_jobs_contextual-sign-in-modal_modal_dismiss"]'
        );
        if (dismissButton) {
          console.log("🚫 Found sign-in modal, dismissing...");
          await dismissButton.click();
          await page.waitForTimeout(1000); // Wait for modal to close
          console.log("✅ Sign-in modal dismissed");
        }
      } catch (error) {
        console.log("ℹ️ No sign-in modal found or already dismissed");
      }

      // Detect login wall (remains as is)
      const title = await page.title();
      if (/sign.?in|login/i.test(title)) {
        console.warn("⚠️ Hit LinkedIn login wall — no jobs visible.");
        await page.screenshot({
          path: "linkedin-loginwall.png",
          fullPage: true,
        });
        return [];
      }

      // Wait for job container to appear
      try {
        await page.waitForSelector(".base-search-card.job-search-card", {
          state: "attached",
          timeout: 20000,
        });
        console.log("✅ Job elements attached to DOM.");
      } catch {
        console.warn(
          "⚠️ Job list not detected immediately — scrolling manually..."
        );
      }

      // Initial scroll to load some jobs
      console.log("📜 Initial scroll to load jobs...");
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(3000);

      // Count visible jobs (remains as is)
      const jobCount = await page.evaluate(
        () =>
          document.querySelectorAll(".base-search-card.job-search-card").length
      );
      console.log(`🧩 Found ${jobCount} job elements after scroll.`);

      if (jobCount === 0) {
        console.warn("⚠️ No jobs found — saving debug screenshot...");
        await page.screenshot({ path: "linkedin-no-jobs.png", fullPage: true });
      }

      const jobs: JobData[] = [];
      const targetLimit = params.limit || 100;
      let scrollAttempts = 0;
      const maxScrollAttempts = 20; // Prevent infinite scrolling

      while (jobs.length < targetLimit && scrollAttempts < maxScrollAttempts) {
        console.log(
          `🔍 Scraping attempt ${scrollAttempts + 1} (${
            jobs.length
          }/${targetLimit} jobs so far)...`
        );

        // 5. FIX: Wrap extraction/navigation in try/catch to handle crashes mid-loop
        try {
          const newJobs = await this.extractJobsFromPage(page);
          console.log(`✅ Extracted ${newJobs.length} jobs from current view.`);

          // Debug: Show sample of extracted jobs
          if (newJobs.length > 0) {
            console.log("📋 Sample extracted jobs:");
            newJobs.slice(0, 2).forEach((job, index) => {
              console.log(
                `  ${index + 1}. ${job.title} at ${job.company} (${
                  job.location
                })`
              );
              console.log(`     ID: ${job.id}`);
              console.log(`     Link: ${job.link}`);
            });
          }

          jobs.push(...newJobs);

          // Check if we've reached our limit
          if (jobs.length >= targetLimit) {
            console.log(`🎯 Reached job limit of ${targetLimit}, stopping.`);
            break;
          }

          // Try to load more jobs via infinite scroll
          const hasMoreJobs = await this.loadMoreJobs(page);
          if (!hasMoreJobs) {
            console.log("❌ No more jobs to load - reached end of results.");
            break;
          }

          scrollAttempts++;
          await randomDelay(
            this.config.delayBetweenRequests || 2000,
            (this.config.delayBetweenRequests || 2000) * 2
          );
        } catch (innerErr: any) {
          // Check if the error is related to browser/page closure
          const isInnerCrashError =
            innerErr.message?.includes("Target page") ||
            innerErr.message?.includes("browser") ||
            innerErr.message?.includes("context has been closed") ||
            innerErr.message?.includes("TargetClosedError") ||
            innerErr.message?.includes("Protocol error") ||
            innerErr.message?.includes("Connection closed") ||
            innerErr.name === "TargetClosedError" ||
            innerErr.name === "ProtocolError";

          if (isInnerCrashError) {
            console.error(
              `💥 Playwright crash detected during scraping. Breaking loop.`
            );
            // Rethrow to be caught by the outer catch, which handles re-initialization
            throw innerErr;
          }
          // Log other errors but continue or break based on severity
          console.error(`❌ Scraping failed:`, innerErr.message);
          // Optionally, break the loop if a non-crash error is critical
          break;
        }
      }

      return jobs.slice(0, targetLimit);
    } catch (err: any) {
      // 6. IMPROVEMENT: Refine crash check.
      const isCrashError =
        err.message?.includes("Target page") ||
        err.message?.includes("browser") ||
        err.message?.includes("context has been closed") ||
        err.message?.includes("TargetClosedError") ||
        err.message?.includes("Protocol error") ||
        err.message?.includes("Connection closed") ||
        err.name === "TargetClosedError" ||
        err.name === "ProtocolError";

      if (isCrashError) {
        console.error(
          "💥 Browser crash or closure detected. Restarting browser..."
        );
        // Ensure context is nullified if not already (from disconnected listener)
        this.context = null;
        await this.initialize();
      } else {
        console.error("❌ Scraping failed:", err);
      }
      throw err;
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }

  /** ------------------ HELPERS ------------------ */
  private async setupStealth(page: Page): Promise<void> {
    await page.addInitScript(() => {
      // Remove webdriver property
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });

      // Mock plugins
      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5],
      });

      // Mock languages
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en"],
      });

      // Mock permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (p: any) =>
        p.name === "notifications"
          ? Promise.resolve({ state: Notification.permission } as any)
          : originalQuery(p);

      // Remove automation indicators
      delete (window as any).chrome;
      delete (window as any).__nightmare;
      delete (window as any).__phantomas;
      delete (window as any).callPhantom;
      delete (window as any)._phantom;
      delete (window as any).phantom;

      // Mock screen properties
      Object.defineProperty(screen, "availHeight", { get: () => 1040 });
      Object.defineProperty(screen, "availWidth", { get: () => 1920 });
      Object.defineProperty(screen, "colorDepth", { get: () => 24 });
      Object.defineProperty(screen, "height", { get: () => 1080 });
      Object.defineProperty(screen, "width", { get: () => 1920 });
    });
  }

  private buildSearchUrl(params: {
    position?: string;
    location: string;
    offset?: number;
    companyJobsUrl?: string;
  }): string {
    const base = "https://www.linkedin.com/jobs/search";
    const sp = new URLSearchParams();
    if (params.position) sp.append("keywords", params.position);
    sp.append("location", params.location);
    if (params.offset && params.offset > 1)
      sp.append("start", String((params.offset - 1) * 25));
    sp.append("f_TPR", "r604800");
    sp.append("f_JT", "F");
    sp.append("f_WT", "2,1,3");
    return params.companyJobsUrl || `${base}?${sp.toString()}`;
  }

  /** ------------------ DATA EXTRACTION ------------------ */
  private async extractJobsFromPage(page: Page): Promise<JobData[]> {
    return await page.evaluate(() => {
      const jobs: JobData[] = [];
      const seenIds = new Set<string>();
      const els = document.querySelectorAll(
        ".base-search-card.job-search-card"
      );
      els.forEach((el) => {
        try {
          // Extract job ID from data-entity-urn
          const entityUrn = el.getAttribute("data-entity-urn") || "";
          const id = entityUrn.replace("urn:li:jobPosting:", "") || "";

          // Skip if we've already seen this job ID
          if (!id || seenIds.has(id)) {
            return;
          }
          seenIds.add(id);

          // Extract title
          const titleEl = el.querySelector(".base-search-card__title");

          // Extract company
          const companyEl = el.querySelector(".base-search-card__subtitle a");

          // Extract location
          const locEl = el.querySelector(".job-search-card__location");

          // Extract date
          const dateEl = el.querySelector(".job-search-card__listdate");

          // Extract company image
          const imgEl = el.querySelector(".artdeco-entity-image");

          // Extract job link
          const linkEl = el.querySelector(".base-card__full-link");
          const rawLink = linkEl?.getAttribute("href") || "";
          const link = rawLink.startsWith("http")
            ? rawLink
            : `https://www.linkedin.com${rawLink}`;

          const job: JobData = {
            id,
            title: titleEl?.textContent?.trim() || "",
            company: companyEl?.textContent?.trim() || "",
            companyLink: companyEl?.getAttribute("href") || "",
            companyImgLink: imgEl?.getAttribute("src") || "",
            location: locEl?.textContent?.trim() || "",
            date: dateEl?.textContent?.trim() || "",
            link,
            applyLink: "",
            description: "",
            salary: "",
            jobType: "",
            experienceLevel: "",
          };
          if (job.title) jobs.push(job);
        } catch (e) {
          console.error("Error parsing job:", e);
        }
      });
      return jobs;
    });
  }

  private async loadMoreJobs(page: Page): Promise<boolean> {
    try {
      console.log("📜 Loading more jobs via infinite scroll...");

      // Get current job count
      const currentJobCount = await page.evaluate(
        () =>
          document.querySelectorAll(".base-search-card.job-search-card").length
      );
      console.log(`📊 Current job count: ${currentJobCount}`);

      // Scroll down to trigger loading more jobs
      const scrollAttempts = 5;
      let newJobCount = currentJobCount;

      for (let i = 0; i < scrollAttempts; i++) {
        console.log(`📜 Scroll attempt ${i + 1}/${scrollAttempts}...`);

        // Scroll to bottom of page
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });

        // Wait for new content to load
        await page.waitForTimeout(3000);

        // Check if new jobs were loaded
        newJobCount = await page.evaluate(
          () =>
            document.querySelectorAll(".base-search-card.job-search-card")
              .length
        );

        console.log(`📊 Job count after scroll: ${newJobCount}`);

        // If we got new jobs, we're still loading
        if (newJobCount > currentJobCount) {
          console.log(`✅ Loaded ${newJobCount - currentJobCount} new jobs`);
          return true;
        }

        // If no new jobs after multiple scrolls, we might be at the end
        if (i === scrollAttempts - 1) {
          console.log("❌ No more jobs to load - reached end of results");
          return false;
        }

        // Wait a bit before next scroll attempt
        await page.waitForTimeout(2000);
      }

      return newJobCount > currentJobCount;
    } catch (error: any) {
      console.error("❌ Failed to load more jobs:", error.message);
      return false;
    }
  }

  /** ------------------ CLEANUP ------------------ */
  async close(): Promise<void> {
    if (this.context) {
      try {
        await this.context.close();
        console.log("✅ Browser context closed.");
      } catch (e) {
        console.error("Error closing context:", e);
      }
      this.context = null;
      // 7. FIX: Removed this.browser = null;
    }
  }
}

/** ------------------ FACTORY ------------------ */
export async function createCustomScraper(
  config?: ScraperConfig
): Promise<CustomLinkedInScraper> {
  const scraper = new CustomLinkedInScraper(config);
  await scraper.initialize();
  return scraper;
}
