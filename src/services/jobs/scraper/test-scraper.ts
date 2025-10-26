import {
  runBatchJobScraper,
  runEnhancedJobScraper,
  runJobScraper,
} from "./index";
import { createStealthScraper } from "./stealth-scraper";

// Test the legacy scraper (backward compatibility)
export async function testLegacyScraper() {
  console.log("Testing legacy scraper...");

  try {
    const jobs = await runJobScraper({
      position: "software engineer",
      location: "San Francisco, CA",
      offset: 1,
    });

    console.log(`Legacy scraper found ${jobs.length} jobs`);
    console.log("Sample job:", jobs[0]);
    return jobs;
  } catch (error) {
    console.error("Legacy scraper failed:", error);
    throw error;
  }
}

// Test the enhanced scraper
export async function testEnhancedScraper() {
  console.log("Testing enhanced scraper...");

  try {
    const jobs = await runEnhancedJobScraper({
      position: "software engineer",
      location: "New York, NY",
      offset: 1,
      enableDescriptions: false,
      limit: 25,
    });

    console.log(`Enhanced scraper found ${jobs.length} jobs`);
    console.log("Sample job:", jobs[0]);
    return jobs;
  } catch (error) {
    console.error("Enhanced scraper failed:", error);
    throw error;
  }
}

// Test the stealth scraper
export async function testStealthScraper() {
  console.log("Testing stealth scraper...");

  const scraper = await createStealthScraper({
    headless: true,
    slowMo: 1000,
    timeout: 60000,
    delayBetweenRequests: 3000,
  });

  try {
    const jobs = await scraper.scrapeJobs({
      position: "data scientist",
      location: "Seattle, WA",
      offset: 1,
      limit: 25,
    });

    console.log(`Stealth scraper found ${jobs.length} jobs`);
    console.log("Sample job:", jobs[0]);
    return jobs;
  } catch (error) {
    console.error("Stealth scraper failed:", error);
    throw error;
  } finally {
    await scraper.close();
  }
}

// Test batch scraping
export async function testBatchScraper() {
  console.log("Testing batch scraper...");

  const searchParams = [
    {
      position: "frontend developer",
      location: "Austin, TX",
      limit: 25,
    },
    {
      position: "backend developer",
      location: "Denver, CO",
      limit: 25,
    },
    {
      position: "full stack developer",
      location: "Portland, OR",
      limit: 25,
    },
  ];

  try {
    const allJobs = await runBatchJobScraper(searchParams);

    console.log(
      `Batch scraper found ${allJobs.length} jobs across ${searchParams.length} searches`
    );
    console.log("Sample jobs by location:");

    // Group jobs by location
    const jobsByLocation = allJobs.reduce((acc, job) => {
      const location = job.location;
      if (!acc[location]) acc[location] = [];
      acc[location].push(job);
      return acc;
    }, {} as Record<string, any[]>);

    Object.entries(jobsByLocation).forEach(([location, jobs]) => {
      console.log(`${location}: ${jobs.length} jobs`);
    });

    return allJobs;
  } catch (error) {
    console.error("Batch scraper failed:", error);
    throw error;
  }
}

// Test with job descriptions
export async function testScraperWithDescriptions() {
  console.log("Testing scraper with descriptions...");

  try {
    const jobs = await runEnhancedJobScraper({
      position: "product manager",
      location: "Chicago, IL",
      offset: 1,
      enableDescriptions: true,
      limit: 5, // Smaller limit since descriptions take longer
    });

    console.log(`Scraper with descriptions found ${jobs.length} jobs`);

    // Show jobs with descriptions
    jobs.forEach((job, index) => {
      console.log(`\nJob ${index + 1}:`);
      console.log(`Title: ${job.title}`);
      console.log(`Company: ${job.company}`);
      console.log(
        `Description length: ${job.description?.length || 0} characters`
      );
      if (job.description) {
        console.log(
          `Description preview: ${job.description.substring(0, 200)}...`
        );
      }
    });

    return jobs;
  } catch (error) {
    console.error("Scraper with descriptions failed:", error);
    throw error;
  }
}

// Main test function
export async function runAllTests() {
  console.log("Starting LinkedIn scraper tests...\n");

  const results = {
    legacy: null as any,
    enhanced: null as any,
    stealth: null as any,
    batch: null as any,
    descriptions: null as any,
  };

  try {
    // Test 1: Legacy scraper
    console.log("=".repeat(50));
    results.legacy = await testLegacyScraper();
    console.log("Legacy scraper test completed\n");

    // Test 2: Enhanced scraper
    console.log("=".repeat(50));
    results.enhanced = await testEnhancedScraper();
    console.log("Enhanced scraper test completed\n");

    // Test 3: Stealth scraper
    console.log("=".repeat(50));
    results.stealth = await testStealthScraper();
    console.log("Stealth scraper test completed\n");

    // Test 4: Batch scraper
    console.log("=".repeat(50));
    results.batch = await testBatchScraper();
    console.log("Batch scraper test completed\n");

    // Test 5: Scraper with descriptions (optional - takes longer)
    console.log("=".repeat(50));
    console.log(
      "Note: Description scraping test is optional and takes longer..."
    );
    // Uncomment the line below to test description scraping
    // results.descriptions = await testScraperWithDescriptions();
    console.log("Description scraping test skipped\n");

    console.log("=".repeat(50));
    console.log("All tests completed successfully!");
    console.log(
      `Total jobs scraped across all tests: ${
        (results.legacy?.length || 0) +
        (results.enhanced?.length || 0) +
        (results.stealth?.length || 0) +
        (results.batch?.length || 0)
      }`
    );

    return results;
  } catch (error) {
    console.error("Test suite failed:", error);
    throw error;
  }
}

// Individual test runners
export async function runSingleTest(testName: string) {
  switch (testName) {
    case "legacy":
      return await testLegacyScraper();
    case "enhanced":
      return await testEnhancedScraper();
    case "stealth":
      return await testStealthScraper();
    case "batch":
      return await testBatchScraper();
    case "descriptions":
      return await testScraperWithDescriptions();
    default:
      throw new Error(`Unknown test: ${testName}`);
  }
}
