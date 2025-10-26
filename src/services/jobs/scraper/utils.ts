// Utility functions for the custom LinkedIn scraper

export function randomDelay(min: number, max: number): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

export function getRandomUserAgent(): string {
  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/121.0",
  ];

  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

export function generateRandomDelay(): number {
  // Generate random delay between 1-3 seconds
  return Math.floor(Math.random() * 2000) + 1000;
}

export function isValidJobData(job: any): boolean {
  return (
    job &&
    job.title &&
    job.company &&
    job.id &&
    job.title.trim() !== "" &&
    job.company.trim() !== ""
  );
}

export function sanitizeJobData(job: any): any {
  return {
    ...job,
    title: job.title?.trim() || "N/A",
    company: job.company?.trim() || "N/A",
    location: job.location?.trim() || "N/A",
    date: job.date?.trim() || "N/A",
    link: job.link || "N/A",
    companyLink: job.companyLink || "N/A",
    companyImgLink: job.companyImgLink || "N/A",
    applyLink: job.applyLink || "N/A",
    description: job.description?.trim() || "N/A",
    salary: job.salary?.trim() || "N/A",
    jobType: job.jobType?.trim() || "N/A",
    experienceLevel: job.experienceLevel?.trim() || "N/A",
  };
}

export function extractJobIdFromUrl(url: string): string {
  const match = url.match(/\/jobs\/view\/(\d+)/);
  return match ? match[1] : "";
}

export function buildLinkedInJobUrl(jobId: string): string {
  return `https://www.linkedin.com/jobs/view/${jobId}`;
}

export function isRateLimited(error: any): boolean {
  return (
    error?.message?.includes("429") ||
    error?.message?.includes("rate limit") ||
    error?.message?.includes("too many requests")
  );
}

export function shouldRetry(
  error: any,
  attempt: number,
  maxRetries: number
): boolean {
  if (attempt >= maxRetries) return false;

  return (
    isRateLimited(error) ||
    error?.message?.includes("timeout") ||
    error?.message?.includes("network") ||
    error?.message?.includes("502") ||
    error?.message?.includes("503") ||
    error?.message?.includes("Target page") ||
    error?.message?.includes("browser") ||
    error?.message?.includes("context has been closed") ||
    error?.message?.includes("TargetClosedError") ||
    error?.message?.includes("Protocol error") ||
    error?.message?.includes("Connection closed") ||
    error?.name === "TargetClosedError" ||
    error?.name === "ProtocolError"
  );
}

export function calculateRetryDelay(attempt: number): number {
  // Exponential backoff with jitter
  const baseDelay = 1000; // 1 second
  const maxDelay = 30000; // 30 seconds
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  const jitter = Math.random() * 1000; // Add up to 1 second of jitter

  return delay + jitter;
}
