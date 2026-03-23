# Google Search Console MCP Server

A Model Context Protocol (MCP) server that gives AI agents direct access to your Google Search Console data.

- **Search analytics** — query clicks, impressions, CTR, and average position by page, query, country, device, or date range
- **Compare periods** — week-over-week, month-over-month trends
- **Find opportunities** — high-impression/low-click queries, ranking keywords you didn't know about
- **Track specific pages** — see which URLs are gaining or losing traction
- **Index coverage** — check which pages are indexed, excluded, or erroring
- **Sitemap status** — verify sitemaps are being read and how many URLs are indexed

Read-only access — this server cannot submit URLs, modify settings, or make any changes to your Search Console properties.

> [!IMPORTANT]
> This server uses service account authentication. The service account must be added as a user on each Search Console property you want to access.

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

### Quick setup via agent

Already have your [service account key](#google-cloud-setup-service-account-key)? Paste this prompt into Claude Code or Claude Desktop and it will configure everything for you:

> Clone and build the Google Search Console MCP server from https://github.com/sarahpark/google-search-console-mcp, then add it to my global MCP config. My service account key is at `/path/to/service-account-key.json`. After setup, call `list_sites` to verify it works.

Replace the key path with your actual file location.

### Build from source

```bash
git clone https://github.com/sarahpark/google-search-console-mcp.git
cd google-search-console-mcp
npm install
npm run build
```

## Configuration

### Google Cloud setup: service account key

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a new project (or select an existing one)
2. Open the [Search Console API page](https://console.cloud.google.com/marketplace/product/google/searchconsole.googleapis.com) and click **Enable**
3. In the sidebar, go to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **Service account**
5. Give it a name (e.g. "search-console-mcp"), then click **Create and Continue**
6. You can skip the optional role/access steps — click **Done**
7. On the Credentials page, click on the service account you just created
8. Go to the **Keys** tab → **Add Key** → **Create new key** → select **JSON** → click **Create**
9. A `.json` key file will download — save it somewhere safe (e.g. `~/.config/gcloud/service-account-key.json`)

> [!CAUTION]
> Treat this key file like a secret key. Do **not** save it inside your project repo or commit it to git. Store it outside your project directory and reference it by absolute path in your MCP config.

### Google Search Console access

1. Copy the service account's email address (it looks like `name@project-id.iam.gserviceaccount.com` — you can find it on the service account details page)
2. Go to [Google Search Console](https://search.google.com/search-console)
3. Select your property, then go to **Settings** → **Users and permissions**
4. Click **Add user**, paste the service account email, set the permission to **Restricted**, and click **Add**

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "gsc": {
      "command": "node",
      "args": ["/absolute/path/to/google-search-console-mcp/build/index.js"],
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "/absolute/path/to/service-account-key.json"
      }
    }
  }
}
```

### Claude Code (VS Code)

Add to the `"mcpServers"` object in `~/.claude.json`:

```json
{
  "mcpServers": {
    "gsc": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/google-search-console-mcp/build/index.js"],
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "/absolute/path/to/service-account-key.json"
      }
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
