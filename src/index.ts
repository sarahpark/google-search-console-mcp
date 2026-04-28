#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { google } from "googleapis";
import { z } from "zod";

// --- Auth ---

const ADC_SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/cloud-platform",
];

const ADC_LOGIN_COMMAND = `gcloud auth application-default login --scopes=${ADC_SCOPES.join(",")}`;
const QUOTA_PROJECT_COMMAND =
  "gcloud auth application-default set-quota-project <GCP_PROJECT_ID>";

function getAuthClient() {
  const auth = new google.auth.GoogleAuth({
    scopes: ADC_SCOPES,
  });
  return auth;
}

/**
 * Detect common Google API auth/config errors and return actionable fix
 * instructions. Returns null if the error is not a recognized auth issue.
 */
function diagnoseAuthError(error: unknown): string | null {
  const message =
    error instanceof Error ? error.message : JSON.stringify(error);

  const RECONNECT_INSTRUCTION =
    "IMPORTANT: After running the above, you MUST reconnect this MCP server for the new credentials to take effect. In Claude Code, type /mcp and select the server to reconnect it.";

  // RAPT (Re-Auth Proof Token) expired — Google Workspace requires browser re-auth
  if (
    message.includes("invalid_rapt") ||
    message.includes("reauth related error")
  ) {
    return [
      "AUTHENTICATION ERROR: Google requires re-authentication (RAPT token expired).",
      "",
      "Tell the user to run the following command (must be a single line, do not add line breaks):",
      "",
      `  ${ADC_LOGIN_COMMAND}`,
      "",
      RECONNECT_INSTRUCTION,
    ].join("\n");
  }

  // Missing quota project
  if (
    message.includes("quota project") ||
    message.includes("quota_project") ||
    message.includes("billing/quota")
  ) {
    return [
      "CONFIGURATION ERROR: No quota project is set for Application Default Credentials.",
      "",
      "Tell the user to run the following command:",
      "",
      `  ${QUOTA_PROJECT_COMMAND}`,
      "",
      "Replace <GCP_PROJECT_ID> with the Google Cloud project that has the Search Console API enabled.",
      "To list available projects, run: gcloud projects list",
      "",
      RECONNECT_INSTRUCTION,
    ].join("\n");
  }

  // Generic invalid_grant (refresh token revoked, expired, or wrong scopes)
  if (message.includes("invalid_grant")) {
    return [
      "AUTHENTICATION ERROR: The stored credentials are invalid or expired.",
      "",
      "Tell the user to run these two commands (each must be a single line, do not add line breaks):",
      "",
      `  1. ${ADC_LOGIN_COMMAND}`,
      `  2. ${QUOTA_PROJECT_COMMAND}`,
      "",
      "Replace <GCP_PROJECT_ID> with the Google Cloud project that has the Search Console API enabled.",
      "",
      RECONNECT_INSTRUCTION,
    ].join("\n");
  }

  // ADC not found at all
  if (
    message.includes("Could not load the default credentials") ||
    message.includes("default credentials")
  ) {
    return [
      "AUTHENTICATION ERROR: No Application Default Credentials found.",
      "",
      "Tell the user to run these two commands (each must be a single line, do not add line breaks):",
      "",
      `  1. ${ADC_LOGIN_COMMAND}`,
      `  2. ${QUOTA_PROJECT_COMMAND}`,
      "",
      "Replace <GCP_PROJECT_ID> with the Google Cloud project that has the Search Console API enabled.",
      "To list available projects, run: gcloud projects list",
      "",
      RECONNECT_INSTRUCTION,
    ].join("\n");
  }

  // API not enabled
  if (
    message.includes("has not been used in project") ||
    message.includes("is not enabled") ||
    message.includes("accessNotConfigured")
  ) {
    return [
      "CONFIGURATION ERROR: The Search Console API is not enabled in your Google Cloud project.",
      "",
      "Tell the user to enable it at:",
      "  https://console.cloud.google.com/marketplace/product/google/searchconsole.googleapis.com",
      "",
      "Select the correct project and click 'Enable'.",
      "",
      RECONNECT_INSTRUCTION,
    ].join("\n");
  }

  // Permission denied
  if (message.includes("forbidden") || message.includes("403")) {
    return [
      "PERMISSION ERROR: Access denied to the Search Console API.",
      "",
      "Possible causes:",
      "  - The authenticated Google account does not have access to the requested Search Console property",
      "  - The API quota project does not have the Search Console API enabled",
      "",
      "Tell the user to verify the correct Google account is authenticated:",
      "",
      "  gcloud auth list",
    ].join("\n");
  }

  return null;
}

/**
 * Format an error for tool output. Returns actionable instructions for
 * auth/config issues, or the raw error message for other failures.
 */
function formatToolError(toolName: string, error: unknown): string {
  const diagnosis = diagnoseAuthError(error);
  if (diagnosis) {
    return diagnosis;
  }
  const message =
    error instanceof Error ? error.message : JSON.stringify(error);
  return `Error in ${toolName}: ${message}`;
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
              text: "No sites found. Make sure you have access to at least one Search Console property.",
            },
          ],
        };
      }

      const formatted = sites
        .map((site) => `${site.siteUrl} (${site.permissionLevel})`)
        .join("\n");

      return {
        content: [{ type: "text", text: `Sites:\n${formatted}` }],
      };
    } catch (error: unknown) {
      return {
        content: [{ type: "text", text: formatToolError("list_sites", error) }],
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
      const filters: Array<{
        dimension: string;
        operator: string;
        expression: string;
      }> = [];

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

      const requestBody: Record<string, unknown> = {
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

      const dataRows = rows.map((row) => {
        const keys = (row.keys || []).join(" | ");
        const ctr = ((row.ctr ?? 0) * 100).toFixed(2) + "%";
        const position = (row.position ?? 0).toFixed(1);
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
    } catch (error: unknown) {
      return {
        content: [
          {
            type: "text",
            text: formatToolError("search_analytics", error),
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
    } catch (error: unknown) {
      return {
        content: [
          {
            type: "text",
            text: formatToolError("inspect_url", error),
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

      const lines = sitemaps.map((sm) => {
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
    } catch (error: unknown) {
      return {
        content: [
          {
            type: "text",
            text: formatToolError("list_sitemaps", error),
          },
        ],
      };
    }
  }
);

// --- Connect ---

const transport = new StdioServerTransport();
await server.connect(transport);
