import { type LoaderFunctionArgs } from "react-router";
import { getJson } from "serpapi";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const jobTitle = url.searchParams.get("jobTitle");
  const location = url.searchParams.get("location");
  const radius = url.searchParams.get("radius") || "10";
  const timeFrame = url.searchParams.get("timeFrame") || "any";
  const jobLevel = url.searchParams.get("jobLevel") || "any";
  const limit = parseInt(url.searchParams.get("limit") || "10", 10);

  if (!jobTitle || !location) {
    return Response.json(
      { error: "Job title and location are required" },
      { status: 400 }
    );
  }

  const apiKey = process.env.SERPAPI_API_KEY;

  if (!apiKey) {
    return Response.json(
      { error: "SerpAPI key not configured" },
      { status: 500 }
    );
  }

  try {
    // Check if location is remote
    const isRemote = location.toLowerCase().includes("remote");

    // Mapping time frame to SerpAPI chips
    let chips = "";
    if (timeFrame === "24h") {
      chips = "date_posted:today";
    } else if (timeFrame === "week") {
      chips = "date_posted:week";
    } else if (timeFrame === "month") {
      chips = "date_posted:month";
    }

    if (jobLevel !== "any") {
      // Only use the chip for mid_level and senior_level as they are more reliable
      // For internship and entry_level, adding it to the query is often better
      if (jobLevel === "mid_level" || jobLevel === "senior_level") {
        const levelChip = `experience_level:${jobLevel}`;
        chips = chips ? `${chips},${levelChip}` : levelChip;
      }
    }

    // SerpAPI Google Jobs search parameters
    let searchParams: any = {
      engine: "google_jobs",
      api_key: apiKey,
    };

    if (chips) {
      searchParams.chips = chips;
    }

    // For internship, we also append it to the query for better results
    let enhancedJobTitle = jobTitle;
    if (jobLevel === "internship" && !jobTitle.toLowerCase().includes("intern")) {
      enhancedJobTitle = `${jobTitle} internship`;
    } else if (jobLevel === "entry_level" && !jobTitle.toLowerCase().includes("entry")) {
      enhancedJobTitle = `${jobTitle} entry level`;
    }

    if (isRemote) {
      searchParams.q = enhancedJobTitle;
      searchParams.location = "Remote";
    } else {
      searchParams.location = location;
      // If the user wants exact location (radius=0), we include it in the query too
      if (radius === "0") {
        searchParams.q = `${enhancedJobTitle} near "${location}"`;
      } else {
        // For other radius values, we can try using SerpAPI's 'chips' if we knew the exact chip for radius.
        // Since we don't, we can try to append 'within X miles' to the query as a hint to Google.
        searchParams.q = `${enhancedJobTitle} within ${radius} miles of ${location}`;
      }
    }

    let allJobs = [];
    let nextToken = null;
    const maxResults = Math.min(limit, 10);

    // Fetch jobs until we reach the limit or no more results
    while (allJobs.length < maxResults) {
      const currentParams = { ...searchParams };
      
      if (nextToken) {
        currentParams.next_page_token = nextToken;
        // When using next_page_token, we should not send 'q', 'location', 'chips' etc.
        delete currentParams.q;
        delete currentParams.location;
        delete currentParams.chips;
        delete currentParams.start;
      }
      
      const results = await getJson(currentParams);

      if (!results.jobs_results || results.jobs_results.length === 0) {
        break;
      }

      // Format and add the job results
      const jobs = results.jobs_results.map((job: any) => {
        // Collect all possible links
        const allLinks = [];
        
        if (job.apply_options) {
          allLinks.push(...job.apply_options.map((opt: any) => opt.link));
        }
        
        if (job.related_links) {
          allLinks.push(...job.related_links.map((l: any) => l.link));
        }
        if (job.share_url) {
          allLinks.push(job.share_url);
        }
        if (job.registration_form) {
          allLinks.push(job.registration_form);
        }

        // Try to find a link that looks like a direct application or job board
        let primaryLink = job.link || job.related_links?.[0]?.link || job.apply_options?.[0]?.link || job.share_url;

        return {
          title: job.title,
          company: job.company_name,
          location: job.location,
          description: job.description,
          link: primaryLink,
          allLinks: [...new Set(allLinks.filter(l => !!l))], // Unique links
          postedAt: job.detected_extensions?.posted_at,
          salary: job.detected_extensions?.salary,
          jobType: job.detected_extensions?.schedule_type,
          thumbnail: job.thumbnail,
        };
      });

      allJobs.push(...jobs);
      
      // Google Jobs returns results in batches
      nextToken = results.serpapi_pagination?.next_page_token;
      
      // If we don't have a next token or we reached the limit, break
      if (!nextToken || allJobs.length >= maxResults) {
        break;
      }
    }

    if (allJobs.length === 0) {
      return Response.json({
        success: true,
        jobs: [],
        message: "No jobs found for the given criteria",
      });
    }

    return Response.json({
      success: true,
      jobs: allJobs.slice(0, maxResults),
      totalResults: allJobs.length,
      searchInfo: {
        query: jobTitle,
        location: isRemote ? "Remote" : location,
        radius: radius,
        timeFrame: timeFrame,
        jobLevel: jobLevel,
      },
    });
  } catch (error) {
    console.error("SerpAPI Error:", error);
    return Response.json(
      {
        error: "Failed to fetch jobs from SerpAPI",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
