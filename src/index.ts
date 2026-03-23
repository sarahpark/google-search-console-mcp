#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { google } from "googleapis";
import { z } from "zod";
import { readFileSync } from "fs";

// --- Auth ---

function getAuthClient() {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsPath) {
    throw new Error(
      "GOOGLE_APPLICATION_CREDENTIALS environment variable is not set. " +
        "Point it to your service account JSON key file."
    );
  }

  const credentials = JSON.parse(readFileSync(credentialsPath, "utf-8"));

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });

  return auth;
}

// --- Server setup ---

const server = new McpServer({
  name: "google-search-console-mcp-server",
  version: "1.0.0",
});

const auth = getAuthClient();
const searchconsole = google.searchconsole({ version: "v1", auth });

// --- Tool: list_sites ---

server.tool(
  "list_sites",
  "List all sites (properties) you have access to in Google Search Console.",
  {},
  async () => {
    try {
      const res = await searchconsole.sites.list();
      const sites = res.data.siteEntry || [];

      if (sites.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No sites found. Make sure the service account has been added to your Search Console properties.",
            },
          ],
        };
      }

      const formatted = sites
        .map(
          (site) =>
            `${site.siteUrl} (${site.permissionLevel})`
        )
        .join("\n");

      return {
        content: [{ type: "text", text: `Sites:\n${formatted}` }],
      };
    } catch (error: any) {
      return {
        content: [
          { type: "text", text: `Error listing sites: ${error.message}` },
        ],
      };
    }
  }
);

// --- Tool: search_analytics ---

server.tool(
  "search_analytics",
  "Query search analytics data from Google Search Console. Returns clicks, impressions, CTR, and position for your site.",
  {
    siteUrl: z
      .string()
      .describe(
        "Site URL exactly as it appears in Search Console (e.g. https://example.com/ or sc-domain:example.com)"
      ),
    startDate: z.string().describe("Start date in YYYY-MM-DD format"),
    endDate: z.string().describe("End date in YYYY-MM-DD format"),
    dimensions: z
      .string()
      .optional()
      .describe(
        "Comma-separated dimensions: query, page, country, device, searchAppearance, date"
      ),
    rowLimit: z
      .number()
      .optional()
      .default(100)
      .describe("Max rows to return (default 100, max 25000)"),
    searchType: z
      .enum(["web", "image", "video", "news", "discover", "googleNews"])
      .optional()
      .default("web")
      .describe("Type of search results to query"),
    queryFilter: z
      .string()
      .optional()
      .describe(
        "Filter by search query. Prefix with regex: for regex matching."
      ),
    pageFilter: z
      .string()
      .optional()
      .describe("Filter by page URL. Prefix with regex: for regex matching."),
    countryFilter: z
      .string()
      .optional()
      .describe("Filter by country (ISO 3166-1 alpha-3, e.g. USA, GBR)"),
    deviceFilter: z
      .enum(["DESKTOP", "MOBILE", "TABLET"])
      .optional()
      .describe("Filter by device type"),
  },
  async ({
    siteUrl,
    startDate,
    endDate,
    dimensions,
    rowLimit,
    searchType,
    queryFilter,
    pageFilter,
    countryFilter,
    deviceFilter,
  }) => {
    try {
      const dimensionList = dimensions
        ? dimensions.split(",").map((d) => d.trim())
        : ["query"];

      // Build dimension filter groups
      const filters: any[] = [];

      if (queryFilter) {
        const isRegex = queryFilter.startsWith("regex:");
        filters.push({
          dimension: "query",
          operator: isRegex ? "includingRegex" : "contains",
          expression: isRegex ? queryFilter.slice(6) : queryFilter,
        });
      }

      if (pageFilter) {
        const isRegex = pageFilter.startsWith("regex:");
        filters.push({
          dimension: "page",
          operator: isRegex ? "includingRegex" : "contains",
          expression: isRegex ? pageFilter.slice(6) : pageFilter,
        });
      }

      if (countryFilter) {
        filters.push({
          dimension: "country",
          operator: "equals",
          expression: countryFilter,
        });
      }

      if (deviceFilter) {
        filters.push({
          dimension: "device",
          operator: "equals",
          expression: deviceFilter,
        });
      }

      const requestBody: any = {
        startDate,
        endDate,
        dimensions: dimensionList,
        rowLimit: Math.min(rowLimit || 100, 25000),
        type: searchType || "web",
        dataState: "all",
      };

      if (filters.length > 0) {
        requestBody.dimensionFilterGroups = [{ filters }];
      }

      const res = await searchconsole.searchanalytics.query({
        siteUrl,
        requestBody,
      });

      const rows = res.data.rows || [];

      if (rows.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No data found for the given parameters.",
            },
          ],
        };
      }

      // Format as a readable table
      const header = [
        ...dimensionList,
        "clicks",
        "impressions",
        "ctr",
        "position",
      ].join(" | ");
      const separator = header
        .split("|")
        .map(() => "---")
        .join(" | ");

      const dataRows = rows.map((row: any) => {
        const keys = (row.keys || []).join(" | ");
        const ctr = (row.ctr * 100).toFixed(2) + "%";
        const position = row.position.toFixed(1);
        return `${keys} | ${row.clicks} | ${row.impressions} | ${ctr} | ${position}`;
      });

      const table = [header, separator, ...dataRows].join("\n");

      return {
        content: [
          {
            type: "text",
            text: `Search Analytics (${startDate} to ${endDate})\n${rows.length} rows returned\n\n${table}`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error querying search analytics: ${error.message}`,
          },
        ],
      };
    }
  }
);

// --- Tool: inspect_url ---

server.tool(
  "inspect_url",
  "Inspect a URL to check its indexing status, crawl info, and any issues Google found.",
  {
    siteUrl: z
      .string()
      .describe("Site URL as it appears in Search Console"),
    inspectionUrl: z
      .string()
      .describe("The full URL to inspect (must belong to the site)"),
  },
  async ({ siteUrl, inspectionUrl }) => {
    try {
      const res = await searchconsole.urlInspection.index.inspect({
        requestBody: {
          inspectionUrl,
          siteUrl,
        },
      });

      const result = res.data.inspectionResult;
      if (!result) {
        return {
          content: [
            { type: "text", text: "No inspection result returned." },
          ],
        };
      }

      const indexStatus = result.indexStatusResult;
      const mobileUsability = result.mobileUsabilityResult;

      const lines: string[] = [];
      lines.push(`URL Inspection: ${inspectionUrl}`);
      lines.push("");

      if (indexStatus) {
        lines.push("## Indexing");
        lines.push(`Coverage state: ${indexStatus.coverageState || "Unknown"}`);
        lines.push(`Indexing state: ${indexStatus.indexingState || "Unknown"}`);
        if (indexStatus.lastCrawlTime) {
          lines.push(`Last crawled: ${indexStatus.lastCrawlTime}`);
        }
        if (indexStatus.crawledAs) {
          lines.push(`Crawled as: ${indexStatus.crawledAs}`);
        }
        if (indexStatus.robotsTxtState) {
          lines.push(`robots.txt: ${indexStatus.robotsTxtState}`);
        }
        if (indexStatus.pageFetchState) {
          lines.push(`Page fetch: ${indexStatus.pageFetchState}`);
        }
        if (indexStatus.verdict) {
          lines.push(`Verdict: ${indexStatus.verdict}`);
        }
      }

      if (mobileUsability) {
        lines.push("");
        lines.push("## Mobile Usability");
        lines.push(`Verdict: ${mobileUsability.verdict || "Unknown"}`);
        if (mobileUsability.issues && mobileUsability.issues.length > 0) {
          lines.push("Issues:");
          for (const issue of mobileUsability.issues) {
            lines.push(`  - ${issue.issueType}: ${issue.message || ""}`);
          }
        }
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error inspecting URL: ${error.message}`,
          },
        ],
      };
    }
  }
);

// --- Tool: list_sitemaps ---

server.tool(
  "list_sitemaps",
  "List all sitemaps submitted for a site in Google Search Console.",
  {
    siteUrl: z
      .string()
      .describe("Site URL as it appears in Search Console"),
  },
  async ({ siteUrl }) => {
    try {
      const res = await searchconsole.sitemaps.list({ siteUrl });
      const sitemaps = res.data.sitemap || [];

      if (sitemaps.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No sitemaps found for ${siteUrl}.`,
            },
          ],
        };
      }

      const lines = sitemaps.map((sm: any) => {
        const errors = sm.errors || 0;
        const warnings = sm.warnings || 0;
        const pending = sm.isPending ? " (pending)" : "";
        return `${sm.path} | ${sm.lastSubmitted || "never"} | errors: ${errors} | warnings: ${warnings}${pending}`;
      });

      return {
        content: [
          {
            type: "text",
            text: `Sitemaps for ${siteUrl}:\n\n${lines.join("\n")}`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error listing sitemaps: ${error.message}`,
          },
        ],
      };
    }
  }
);

// --- Connect ---

const transport = new StdioServerTransport();
await server.connect(transport);
