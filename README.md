# Google Search Console MCP Server

A Model Context Protocol (MCP) server that gives AI agents direct access to your Google Search Console data.

- **Search analytics** — query clicks, impressions, CTR, and average position by page, query, country, device, or date range
- **Compare periods** — week-over-week, month-over-month trends
- **Find opportunities** — high-impression/low-click queries, ranking keywords you didn't know about
- **Track specific pages** — see which URLs are gaining or losing traction
- **Index coverage** — check which pages are indexed, excluded, or erroring
- **Sitemap status** — verify sitemaps are being read and how many URLs are indexed

Read-only access — this server cannot submit URLs, modify settings, or make any changes to your Search Console properties.

## Tools

<details>
<summary><code>list_sites</code></summary>

List all sites (properties) you have access to in Google Search Console.

No parameters required.
</details>

<details>
<summary><code>search_analytics</code></summary>

Query search analytics data — clicks, impressions, CTR, and position.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteUrl` | string | Yes | Site URL as it appears in Search Console (e.g. `https://example.com/` or `sc-domain:example.com`) |
| `startDate` | string | Yes | Start date in `YYYY-MM-DD` format |
| `endDate` | string | Yes | End date in `YYYY-MM-DD` format |
| `dimensions` | string | No | Comma-separated: `query`, `page`, `country`, `device`, `searchAppearance`, `date` |
| `rowLimit` | number | No | Max rows to return (default 100, max 25000) |
| `searchType` | string | No | `web`, `image`, `video`, `news`, `discover`, or `googleNews` (default `web`) |
| `queryFilter` | string | No | Filter by query. Prefix with `regex:` for regex matching |
| `pageFilter` | string | No | Filter by page URL. Prefix with `regex:` for regex matching |
| `countryFilter` | string | No | ISO 3166-1 alpha-3 country code (e.g. `USA`, `GBR`) |
| `deviceFilter` | string | No | `DESKTOP`, `MOBILE`, or `TABLET` |
</details>

<details>
<summary><code>inspect_url</code></summary>

Check indexing status, crawl info, and mobile usability for a URL.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteUrl` | string | Yes | Site URL as it appears in Search Console |
| `inspectionUrl` | string | Yes | The full URL to inspect (must belong to the site) |
</details>

<details>
<summary><code>list_sitemaps</code></summary>

List all submitted sitemaps and their status for a site.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteUrl` | string | Yes | Site URL as it appears in Search Console |
</details>


## Installation

### Build from source

```bash
git clone https://github.com/sarahpark/google-search-console-mcp.git
cd google-search-console-mcp
npm install
npm run build
```

## Configuration

### Google Cloud setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a new project (or select an existing one)
2. Open the [Search Console API page](https://console.cloud.google.com/marketplace/product/google/searchconsole.googleapis.com) and click **Enable**
3. Authenticate with Application Default Credentials:

```bash
gcloud auth application-default login \
  --scopes=https://www.googleapis.com/auth/webmasters.readonly,https://www.googleapis.com/auth/cloud-platform
```

4. Optionally, set a quota project so API usage is billed to your project:

```bash
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
```

This authenticates as your own Google account, so you automatically have access to any Search Console properties you own or have been granted access to — no service account or additional user setup needed.

### Claude Code

```bash
claude mcp add gsc --scope project -- node /absolute/path/to/google-search-console-mcp/build/index.js
```

`--scope project` adds it to `.mcp.json` in the current directory. Omit `--scope project` to add it globally to `~/.claude.json`.

Or add it manually to the `"mcpServers"` object in `.mcp.json` or `~/.claude.json`:

```json
{
  "mcpServers": {
    "gsc": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/google-search-console-mcp/build/index.js"]
    }
  }
}
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "gsc": {
      "command": "node",
      "args": ["/absolute/path/to/google-search-console-mcp/build/index.js"]
    }
  }
}
```

## Usage

Once configured, ask Claude naturally:

- "List my Search Console properties"
- "Show me the top 20 queries for my site over the last 28 days"
- "Check the indexing status of https://example.com/blog/my-post"
- "Compare mobile vs desktop performance this month"
- "What sitemaps are submitted for my site?"

## License

MIT
