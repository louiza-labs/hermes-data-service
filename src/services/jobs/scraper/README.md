# LinkedIn Jobs Scraper - In-House Implementation

This directory contains a custom in-house LinkedIn jobs scraper built with Puppeteer, designed to replace the external `linkedin-jobs-scraper` library with more control and better stealth capabilities.

## Features

- **Custom Implementation**: Built from scratch using Puppeteer for full control
- **Stealth Capabilities**: Advanced anti-detection measures using puppeteer-extra and stealth plugins
- **Rate Limiting**: Built-in rate limiting and request throttling
- **Error Handling**: Robust error handling with retry mechanisms
- **Batch Processing**: Support for scraping multiple locations/positions
- **Job Descriptions**: Optional job description scraping
- **Backward Compatibility**: Maintains compatibility with existing code

## Architecture

### Core Components

1. **CustomLinkedInScraper** (`custom-scraper.ts`): Basic scraper implementation
2. **EnhancedLinkedInScraper** (`enhanced-scraper.ts`): Enhanced version with retry logic and rate limiting
3. **StealthLinkedInScraper** (`stealth-scraper.ts`): Advanced stealth implementation
4. **Utils** (`utils.ts`): Utility functions for delays, user agents, and data validation

### Main Interface (`index.ts`)

- `runJobScraper()`: Legacy function for backward compatibility
- `runEnhancedJobScraper()`: New enhanced scraper with additional features
- `runBatchJobScraper()`: Batch scraping for multiple searches

## Usage

### Basic Usage (Legacy Compatible)

```typescript
import { runJobScraper } from "./scraper";

const jobs = await runJobScraper({
  position: "software engineer",
  location: "San Francisco, CA",
  offset: 1,
});
```

### Enhanced Scraper

```typescript
import { runEnhancedJobScraper } from "./scraper";

const jobs = await runEnhancedJobScraper({
  position: "data scientist",
  location: "New York, NY",
  offset: 1,
  enableDescriptions: false,
  limit: 20,
});
```

### Batch Scraping

```typescript
import { runBatchJobScraper } from "./scraper";

const searchParams = [
  { position: "frontend developer", location: "Austin, TX", limit: 10 },
  { position: "backend developer", location: "Denver, CO", limit: 10 },
  { position: "full stack developer", location: "Portland, OR", limit: 10 },
];

const allJobs = await runBatchJobScraper(searchParams);
```

### Stealth Scraper

```typescript
import { createStealthScraper } from "./stealth-scraper";

const scraper = await createStealthScraper({
  headless: true,
  slowMo: 1000,
  timeout: 60000,
  delayBetweenRequests: 3000,
});

const jobs = await scraper.scrapeJobs({
  position: "product manager",
  location: "Chicago, IL",
  limit: 15,
});

await scraper.close();
```

## Configuration Options

### Enhanced Scraper Config

```typescript
interface EnhancedScraperConfig {
  headless?: boolean; // Run in headless mode
  slowMo?: number; // Delay between actions (ms)
  timeout?: number; // Page load timeout (ms)
  maxRetries?: number; // Maximum retry attempts
  enableRateLimiting?: boolean; // Enable rate limiting
  maxConcurrentRequests?: number; // Max concurrent requests
  requestDelay?: number; // Delay between requests (ms)
  enableJobDescriptionScraping?: boolean; // Scrape job descriptions
  enableRetryMechanism?: boolean; // Enable retry on failure
}
```

### Stealth Scraper Config

```typescript
interface StealthScraperConfig {
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
```

## Data Structure

### Job Data Format

```typescript
interface JobData {
  id: string; // LinkedIn job ID
  title: string; // Job title
  company: string; // Company name
  companyLink: string; // Company LinkedIn URL
  companyImgLink: string; // Company logo URL
  location: string; // Job location
  date: string; // Posted date
  link: string; // Job posting URL
  applyLink: string; // Apply URL
  description?: string; // Job description (if enabled)
  salary?: string; // Salary information
  jobType?: string; // Job type (full-time, etc.)
  experienceLevel?: string; // Experience level
}
```

## Testing

Run the test suite to verify the scraper functionality:

```typescript
import { runAllTests, runSingleTest } from "./test-scraper";

// Run all tests
const results = await runAllTests();

// Run specific test
const jobs = await runSingleTest("enhanced");
```

Available tests:

- `legacy`: Test backward compatibility
- `enhanced`: Test enhanced scraper
- `stealth`: Test stealth scraper
- `batch`: Test batch scraping
- `descriptions`: Test with job descriptions

## Installation

The scraper requires the following dependencies (already added to package.json):

```json
{
  "puppeteer": "^21.11.0",
  "puppeteer-extra": "^3.3.6",
  "puppeteer-extra-plugin-stealth": "^2.11.2"
}
```

Install dependencies:

```bash
bun install
```

## Best Practices

### Rate Limiting

- Use appropriate delays between requests (2-3 seconds minimum)
- Implement exponential backoff for retries
- Monitor for rate limit responses (429 status codes)

### Stealth Measures

- Use the stealth scraper for production environments
- Rotate user agents and browser fingerprints
- Implement proxy rotation if needed
- Block unnecessary resources (images, CSS, fonts)

### Error Handling

- Always wrap scraper calls in try-catch blocks
- Implement retry logic for transient failures
- Log errors for debugging and monitoring
- Gracefully handle LinkedIn's anti-bot measures

### Performance

- Use headless mode for production
- Limit concurrent requests
- Implement proper cleanup (close browsers)
- Monitor memory usage for long-running processes

## Troubleshooting

### Common Issues

1. **Rate Limiting**: Increase delays between requests
2. **Detection**: Use stealth scraper with proxy rotation
3. **Timeouts**: Increase timeout values for slow networks
4. **Memory Issues**: Ensure proper browser cleanup

### Debug Mode

Enable debug logging by setting environment variables:

```bash
DEBUG=linkedin-scraper bun run src/index.ts
```

## Migration from External Library

The new scraper maintains backward compatibility with the existing `runJobScraper` function. No changes are required to existing code, but you can gradually migrate to the enhanced features:

1. **Phase 1**: Use existing `runJobScraper()` calls (no changes needed)
2. **Phase 2**: Migrate to `runEnhancedJobScraper()` for better reliability
3. **Phase 3**: Use `runBatchJobScraper()` for multiple searches
4. **Phase 4**: Implement stealth scraper for production environments

## Monitoring and Metrics

The scraper provides built-in metrics:

```typescript
const metrics = await scraper.getJobMetrics();
console.log(`Total jobs: ${metrics.totalJobs}`);
console.log(`Successful: ${metrics.successfulJobs}`);
console.log(`Failed: ${metrics.failedJobs}`);
console.log(`Avg response time: ${metrics.averageResponseTime}ms`);
```

## Security Considerations

- Never hardcode credentials in the scraper
- Use environment variables for sensitive configuration
- Implement proper proxy authentication
- Monitor for LinkedIn's terms of service compliance
- Implement proper data sanitization and validation
