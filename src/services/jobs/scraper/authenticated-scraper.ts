// src/services/jobs/scraper/authenticated-scraper.ts
import { BrowserContext, chromium, Page } from "playwright";
import { getRandomUserAgent, randomDelay } from "./utils.js";

export interface AuthenticatedScraperConfig {
  headless?: boolean;
  slowMo?: number;
  timeout?: number;
  maxRetries?: number;
  delayBetweenRequests?: number;
  email?: string;
  password?: string;
  pageSize?: number; // default 25 for LinkedIn
}

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

export class AuthenticatedLinkedInScraper {
  private context: BrowserContext | null = null;
  private config: AuthenticatedScraperConfig;
  private isInitializing = false;

  constructor(config: AuthenticatedScraperConfig = {}) {
    this.config = {
      headless: false,
      slowMo: 300,
      timeout: 45000,
      maxRetries: 3,
      delayBetweenRequests: 2000,
      pageSize: 25,
      email: process.env.LINKEDIN_EMAIL,
      password: process.env.LINKEDIN_PASSWORD,
      ...config,
    };
  }

  /** ------------------ INITIALIZATION ------------------ */
  private contextAlive(): boolean {
    return !!(
      this.context &&
      this.context.browser() &&
      this.context.browser()!.isConnected()
    );
  }

  async initialize(): Promise<void> {
    if (this.isInitializing) return;
    this.isInitializing = true;

    await this.close();
    console.log("🟡 Launching authenticated Chromium...");

    try {
      this.context = await chromium.launchPersistentContext(
        "/tmp/chrome-data-auth",
        {
          headless: false,
          slowMo: this.config.slowMo,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-blink-features=AutomationControlled",
            "--disable-web-security",
          ],
          userAgent: getRandomUserAgent(),
          viewport: { width: 1366, height: 768 },
          ignoreHTTPSErrors: true,
        }
      );

      this.context.on("close", () => {
        console.warn("⚠️ Browser context disconnected unexpectedly.");
        this.context = null;
      });

      console.log("✅ Browser initialized successfully.");
    } catch (error) {
      console.error("❌ Failed to initialize browser:", error);
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  private async ensureBrowserReady(): Promise<void> {
    if (this.contextAlive()) return;
    console.warn("Browser context not ready — reinitializing...");
    await this.initialize();
  }

  /** ------------------ AUTHENTICATION ------------------ */
  async login(searchParams?: {
    position?: string;
    location: string;
    offset?: number;
  }): Promise<boolean> {
    if (!this.config.email || !this.config.password) {
      console.error("❌ Missing LinkedIn credentials.");
      return false;
    }

    await this.ensureBrowserReady();
    const page = await this.context!.newPage();
    await this.setupStealth(page);

    try {
      console.log("🔍 Checking login status...");
      await page.goto("https://www.linkedin.com/feed/", {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });

      const currentUrl = page.url();
      if (currentUrl.includes("/feed") || currentUrl.includes("/jobs")) {
        console.log("✅ Already logged in.");
        if (searchParams) await this.gotoJobsPage(page, searchParams);
        return true;
      }

      // Check if we're on a session redirect page
      if (currentUrl.includes("/uas/login?session_redirect")) {
        console.log(
          "🔄 Detected session redirect page, attempting to click user profile..."
        );
        try {
          // Wait for the member profile block to appear
          await page.waitForSelector(".member-profile-block", {
            timeout: 10000,
          });

          // Click the member profile button to continue with existing session
          await page.click(".member-profile-block .member-profile__details");
          console.log("✅ Clicked user profile button");

          // Wait for navigation to complete
          await page.waitForLoadState("domcontentloaded", { timeout: 15000 });

          // Check if we're now on the feed page
          const newUrl = page.url();
          if (newUrl.includes("/feed") || newUrl.includes("/jobs")) {
            console.log("✅ Successfully logged in via session redirect");
            if (searchParams) await this.gotoJobsPage(page, searchParams);
            return true;
          }
        } catch (error) {
          console.warn(
            "⚠️ Failed to handle session redirect, falling back to normal login:",
            error
          );
        }
      }

      console.log("🔐 Not logged in, proceeding...");
      await page.goto("https://www.linkedin.com/login", {
        waitUntil: "domcontentloaded",
        timeout: this.config.timeout,
      });

      // Debug: Log page title and URL
      console.log(`📄 Login page title: "${await page.title()}"`);
      console.log(`🔗 Login page URL: ${page.url()}`);

      // Wait for visible login form with multiple fallback strategies
      try {
        await page.waitForSelector(
          'input[name="session_key"]:not([type="hidden"])',
          {
            timeout: 10000,
          }
        );
        console.log("✅ Found visible login form");
      } catch (error) {
        console.log(
          "⚠️ Primary login form not found, trying alternative selectors..."
        );
        try {
          // Try alternative selectors for different LinkedIn login forms
          await page.waitForSelector('input[type="text"][name="session_key"]', {
            timeout: 5000,
          });
          console.log("✅ Found alternative login form (text input)");
        } catch (error2) {
          try {
            // Try email input field
            await page.waitForSelector('input[type="email"]', {
              timeout: 5000,
            });
            console.log("✅ Found email input field");
          } catch (error3) {
            console.log("⚠️ No visible login form found, proceeding anyway...");
          }
        }
      }
      // Fill login form with fallback selectors
      try {
        await page.fill(
          'input[name="session_key"]:not([type="hidden"])',
          this.config.email
        );
      } catch (error) {
        try {
          await page.fill(
            'input[type="text"][name="session_key"]',
            this.config.email
          );
        } catch (error2) {
          await page.fill('input[type="email"]', this.config.email);
        }
      }

      try {
        await page.fill('input[name="session_password"]', this.config.password);
      } catch (error) {
        await page.fill('input[type="password"]', this.config.password);
      }

      await page.click('button[type="submit"]');

      try {
        await page.waitForLoadState("networkidle", { timeout: 15000 });
      } catch {
        await page.waitForLoadState("domcontentloaded", { timeout: 10000 });
      }
      await page.waitForTimeout(3000);

      const finalUrl = page.url();
      const success = finalUrl.includes("/feed") || finalUrl.includes("/jobs");

      if (success) {
        console.log("✅ Login successful.");
        if (searchParams) await this.gotoJobsPage(page, searchParams);
        return true;
      }

      console.warn("⚠️ Could not verify login, continuing anyway.");
      return true;
    } catch (error) {
      console.error("❌ Login failed:", error);
      return false;
    } finally {
      if (!page.isClosed()) await page.close();
    }
  }

  private async gotoJobsPage(
    page: Page,
    params: { position?: string; location: string; offset?: number }
  ) {
    const jobsUrl = this.buildSearchUrl(params);
    console.log(`🔗 Navigating to jobs: ${jobsUrl}`);
    try {
      await page.goto(jobsUrl, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });
    } catch {
      console.warn("⚠️ Navigation timeout, continuing...");
    }
    await page.waitForTimeout(1500);
  }

  /** ------------------ MAIN SCRAPE ------------------ */
  async scrapeJobs(params: {
    // search-results style
    position?: string;
    location?: string;
    offset?: number;
    // direct URL (search or collections/recommended etc.)
    url?: string;
    // if you already have a companyJobsUrl
    companyJobsUrl?: string;
    // pagination controls
    pages?: number; // number of pages to fetch
    limit?: number; // total jobs desired (wins over pages if both set)
    pageSizeOverride?: number; // use if LinkedIn returns different page size for a given surface
    startPage?: number; // page to start from (1-based)
  }): Promise<JobData[]> {
    await this.ensureBrowserReady();

    let page: Page | null = null;
    try {
      // Ensure auth
      const loginSuccess = await this.login({
        position: params.position,
        location: params.location ?? "",
        offset: params.offset,
      });
      if (!loginSuccess) throw new Error("LinkedIn login failed.");

      page = await this.context!.newPage();
      await this.setupStealth(page);

      // Determine base URL and paging settings
      const baseUrl =
        params.url ||
        params.companyJobsUrl ||
        this.buildSearchUrl({
          position: params.position,
          location: params.location,
          offset: params.offset,
          companyJobsUrl: undefined,
        });

      const pageSize = params.pageSizeOverride ?? this.config.pageSize!;
      const targetLimit = params.limit ?? (params.pages ?? 1) * pageSize;
      const targetPages = Math.ceil(targetLimit / pageSize);
      const startPage = params.startPage ?? 1;

      // Calculate initial start parameter based on startPage
      const initialStart = (startPage - 1) * pageSize;
      let currentUrl = this.withStartParam(baseUrl, initialStart);

      console.log(`🌐 Navigating to: ${currentUrl}`);
      await page.goto(currentUrl, {
        waitUntil: "domcontentloaded",
        timeout: this.config.timeout,
      });
      await page.waitForSelector("[data-job-id]", { timeout: 20000 });
      console.log("✅ Job list detected.");

      const jobs: JobData[] = [];

      for (
        let currentPage = startPage;
        currentPage < startPage + targetPages;
        currentPage++
      ) {
        console.log(`🔍 Page ${currentPage}/${startPage + targetPages - 1}...`);

        // Wait for jobs to load on current page
        await page.waitForTimeout(5000);

        // Slow scroll to ensure all job elements load
        console.log("📜 Slowly scrolling to load all job elements...");
        await this.slowScrollToLoadJobs(page);

        const newJobs = await this.extractJobsFromPage(page);
        console.log(`✅ Extracted ${newJobs.length} jobs.`);

        // Debug: Show sample of extracted jobs
        if (newJobs.length > 0) {
          console.log("📋 Sample jobs from this page:");
          newJobs.slice(0, 3).forEach((job, index) => {
            console.log(
              `  ${index + 1}. ${job.title} at ${job.company} (${job.location})`
            );
          });
        }

        // Add jobs up to the limit
        const remainingSlots = targetLimit - jobs.length;
        if (remainingSlots > 0) {
          const jobsToAdd = newJobs.slice(0, remainingSlots);
          jobs.push(...jobsToAdd);
          console.log(`📊 Total jobs so far: ${jobs.length}/${targetLimit}`);
        }

        if (jobs.length >= targetLimit) {
          console.log(`🎯 Reached target limit of ${targetLimit} jobs.`);
          break;
        }

        // Move to next page by URL, not button (stable & works on collections)
        const currentStart = this.getStartParam(currentUrl) ?? 0;
        const nextStart = currentStart + pageSize;
        const nextUrl = this.withStartParam(currentUrl, nextStart);

        console.log(`➡️  Next page URL: ${nextUrl}`);
        try {
          await page.goto(nextUrl, {
            waitUntil: "domcontentloaded",
            timeout: this.config.timeout,
          });

          // Wait for jobs to load and ensure we have content
          await page.waitForSelector("[data-job-id]", { timeout: 20000 });

          // Additional wait to ensure all content is loaded
          await page.waitForTimeout(3000);

          currentUrl = nextUrl;
          console.log(`✅ Successfully navigated to page ${currentPage + 1}`);
        } catch (e) {
          console.warn(
            "⚠️ Next-page navigation failed, stopping pagination.",
            e
          );
          break;
        }

        await randomDelay(
          this.config.delayBetweenRequests!,
          this.config.delayBetweenRequests! * 2
        );
      }

      console.log(`🎯 Scraping complete. Total jobs: ${jobs.length}`);
      return jobs;
    } catch (err: any) {
      const crash =
        err?.message?.includes("Target page") ||
        err?.message?.includes("context has been closed") ||
        err?.message?.includes("Connection closed") ||
        err?.name === "TargetClosedError";

      if (crash) {
        console.error("💥 Browser crash detected. Restarting...");
        await this.initialize();
      } else {
        console.error("❌ Scraping failed:", err);
      }
      throw err;
    } finally {
      if (page && !page.isClosed()) await page.close();
    }
  }

  /** ------------------ HELPERS ------------------ */
  private async setupStealth(page: Page): Promise<void> {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3] });
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en"],
      });
      try {
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (p: any) =>
          p?.name === "notifications"
            ? Promise.resolve({ state: Notification.permission } as any)
            : originalQuery(p);
      } catch (_) {}
    });
  }

  private buildSearchUrl(params: {
    position?: string;
    location?: string;
    offset?: number;
    companyJobsUrl?: string;
  }): string {
    if (params.companyJobsUrl) return params.companyJobsUrl;
    const base = "https://www.linkedin.com/jobs/search-results";
    const sp = new URLSearchParams();
    if (params.position) sp.append("keywords", params.position);
    if (params.location) sp.append("location", params.location);
    if (params.offset && params.offset > 1)
      sp.append("start", String((params.offset - 1) * 25));
    sp.append("f_TPR", "r604800"); // past 7 days
    sp.append("f_JT", "F"); // full-time
    sp.append("f_WT", "2,1,3"); // on-site, remote, hybrid
    return `${base}/?${sp.toString()}`;
  }

  // Compute initial "start" value from params.offset or any start already present
  private initialStartFromParams(params: {
    offset?: number;
    url?: string;
    companyJobsUrl?: string;
  }): number {
    const rawUrl = params.url || params.companyJobsUrl;
    if (rawUrl) {
      const start = this.getStartParam(rawUrl);
      if (typeof start === "number") return start;
    }
    if (!params.offset || params.offset <= 1) return 0;
    return (params.offset - 1) * (this.config.pageSize ?? 25);
  }

  // Read ?start= from any LinkedIn jobs URL
  private getStartParam(url: string): number | null {
    try {
      const u = new URL(url);
      const s = u.searchParams.get("start");
      if (s == null) return null;
      const n = parseInt(s, 10);
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  }

  // Return the same URL with start set to `startVal` (adds the param if missing)
  private withStartParam(url: string, startVal: number): string {
    try {
      const u = new URL(url);
      u.searchParams.set("start", String(Math.max(0, startVal)));
      return u.toString();
    } catch {
      // If the caller passed a relative path for some reason
      const u = new URL(url, "https://www.linkedin.com");
      u.searchParams.set("start", String(Math.max(0, startVal)));
      return u.toString();
    }
  }

  private async extractJobsFromPage(page: Page): Promise<JobData[]> {
    const pageJobs = await page.evaluate(() => {
      const out: JobData[] = [];
      const seen = new Set<string>();
      const cards = document.querySelectorAll<HTMLElement>("[data-job-id]");
      cards.forEach((el) => {
        const id = el.getAttribute("data-job-id");
        if (!id || seen.has(id)) return;
        seen.add(id);

        const title =
          el.querySelector("strong")?.textContent?.trim() ||
          el
            .querySelector("[data-view-name='job-card-title']")
            ?.textContent?.trim() ||
          el.querySelector(".job-card-container__link")?.textContent?.trim() ||
          "";

        const company =
          el
            .querySelector(".artdeco-entity-lockup__subtitle")
            ?.textContent?.trim() ||
          el
            .querySelector("[data-view-name='job-card-subtitle']")
            ?.textContent?.trim() ||
          "";

        const location =
          el
            .querySelector(".artdeco-entity-lockup__caption")
            ?.textContent?.trim() || "";

        const date = el.querySelector("time")?.textContent?.trim() || "";

        const img =
          (el.querySelector<HTMLImageElement>(".ivm-view-attr__img--centered")
            ?.src ||
            el.querySelector<HTMLImageElement>("img")?.src ||
            "") ??
          "";

        const linkEl =
          el.querySelector<HTMLAnchorElement>("a[href*='/jobs/view/']") ||
          el.querySelector<HTMLAnchorElement>("a.job-card-container__link");

        // Build absolute link; fallback to /jobs/view/{id} if missing
        let link = "";
        if (linkEl) {
          const raw = linkEl.getAttribute("href") || "";
          try {
            link = new URL(raw, "https://www.linkedin.com").href;
          } catch {
            link = "";
          }
        }
        if (!link && id) {
          link = `https://www.linkedin.com/jobs/view/${id}`;
        }

        if (title) {
          out.push({
            id,
            title,
            company,
            companyLink: "",
            companyImgLink: img,
            location,
            date,
            link,
            applyLink: "",
          });
        }
      });
      return out;
    });
    return pageJobs;
  }

  private async scrollPage(page: Page) {
    console.log("📜 Scrolling to load more jobs...");

    // Get initial job count
    const initialCount = await page.evaluate(() => {
      return document.querySelectorAll("[data-job-id]").length;
    });
    console.log(`📊 Initial job count: ${initialCount}`);

    // Scroll multiple times to ensure we load all content
    for (let i = 0; i < 5; i++) {
      await page.evaluate(async () => {
        // Scroll to bottom
        window.scrollTo(0, document.body.scrollHeight);
        // Wait for content to load
        await new Promise((r) => setTimeout(r, 2000));
      });

      // Check if we've loaded more jobs
      const currentCount = await page.evaluate(() => {
        return document.querySelectorAll("[data-job-id]").length;
      });

      console.log(`📊 After scroll ${i + 1}: ${currentCount} jobs loaded`);

      // If no new jobs loaded, we might be at the end
      if (currentCount === initialCount && i > 0) {
        console.log("📄 No new jobs loaded, might be at end of results");
        break;
      }
    }

    // Final scroll to pagination area
    await page.evaluate(async () => {
      // Scroll to bottom to ensure pagination is visible
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((r) => setTimeout(r, 1000));
    });

    const finalCount = await page.evaluate(() => {
      return document.querySelectorAll("[data-job-id]").length;
    });
    console.log(`📊 Final job count after scrolling: ${finalCount}`);
  }

  private async slowScrollToLoadJobs(page: Page): Promise<void> {
    try {
      // Get initial job count
      let initialJobCount = await page.evaluate(() => {
        return document.querySelectorAll('[data-view-name="job-card"]').length;
      });

      console.log(`📊 Initial job count: ${initialJobCount}`);

      console.log("📜 Scrolling until pagination elements are visible...");

      // Keep scrolling until we see pagination elements
      let scrollAttempts = 0;
      const maxScrollAttempts = 50; // Increased for thorough scrolling
      const scrollStep = 300;

      while (scrollAttempts < maxScrollAttempts) {
        // Check if pagination elements are visible
        const paginationVisible = await page.evaluate(() => {
          // Look for common pagination selectors
          const paginationSelectors = [
            ".jobs-search-pagination",
            ".jobs-search-pagination__nav",
            ".jobs-search-pagination__nav-list",
            ".jobs-search-pagination__button",
            "[data-test-pagination-page-btn]",
            ".artdeco-pagination",
            ".jobs-search-pagination__page-number",
            'nav[aria-label="Pagination"]',
          ];

          return paginationSelectors.some((selector) => {
            const element = document.querySelector(selector);
            return element && element.offsetParent !== null; // Check if visible
          });
        });

        if (paginationVisible) {
          console.log("✅ Pagination elements found! Stopping scroll.");
          break;
        }

        // Scroll down by a small amount
        await page.evaluate((step) => {
          window.scrollBy(0, step);
        }, scrollStep);

        // Wait for content to load
        await page.waitForTimeout(1000);

        scrollAttempts++;

        // Check current job count for progress tracking
        const currentJobCount = await page.evaluate(() => {
          return document.querySelectorAll('[data-view-name="job-card"]')
            .length;
        });

        console.log(
          `📊 Scroll ${scrollAttempts}/${maxScrollAttempts}: ${currentJobCount} jobs, looking for pagination...`
        );

        // If we found new jobs, log it
        if (currentJobCount > initialJobCount) {
          console.log(
            `📈 Jobs loaded: ${currentJobCount} total (was ${initialJobCount})`
          );
          initialJobCount = currentJobCount;
        }
      }

      if (scrollAttempts >= maxScrollAttempts) {
        console.log(
          "⚠️ Reached max scroll attempts without finding pagination"
        );
      }

      // Final check for any remaining lazy-loaded content
      console.log("📜 Final scroll to ensure all content is loaded...");
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(3000);

      // Final job count
      const finalJobCount = await page.evaluate(() => {
        return document.querySelectorAll('[data-view-name="job-card"]').length;
      });

      console.log(`📊 Final job count after scrolling: ${finalJobCount}`);
    } catch (error) {
      console.warn("⚠️ Error during slow scroll:", error);
    }
  }

  /** ------------------ CLEANUP ------------------ */
  async close(): Promise<void> {
    if (this.contextAlive()) {
      try {
        await this.context!.close();
        console.log("✅ Browser context closed.");
      } catch (e) {
        console.error("Error closing context:", e);
      }
    }
    this.context = null;
  }
}

/** ------------------ FACTORY ------------------ */
export async function createAuthenticatedScraper(
  config?: AuthenticatedScraperConfig
): Promise<AuthenticatedLinkedInScraper> {
  const scraper = new AuthenticatedLinkedInScraper(config);
  await scraper.initialize();
  return scraper;
}
