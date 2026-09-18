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
> Two authentication methods are supported — signing in as yourself with Application Default Credentials, or a service account key. See [Authentication](#authentication) for the trade-offs.

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

Already [signed in with gcloud](#option-a-sign-in-as-yourself-adc)? Paste this prompt into Claude Code or Claude Desktop and it will configure everything for you:

> Clone and build the Google Search Console MCP server from https://github.com/sarahpark/google-search-console-mcp, then add it to my global MCP config. After setup, call `list_sites` to verify it works.

If you are using a [service account key](#option-b-service-account-key) instead, add "My service account key is at `/path/to/service-account-key.json`" to the prompt and replace the path with your actual file location.

### Build from source

```bash
git clone https://github.com/sarahpark/google-search-console-mcp.git
cd google-search-console-mcp
npm install
npm run build
```

## Configuration

### Google Cloud project

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a new project (or select an existing one)
2. Open the [Search Console API page](https://console.cloud.google.com/marketplace/product/google/searchconsole.googleapis.com) and click **Enable**

### Authentication

Pick one of the two options below. The server uses the standard Google auth chain, so it picks up whichever you set up: the service account key at `GOOGLE_APPLICATION_CREDENTIALS` if that variable is set, otherwise your gcloud Application Default Credentials.

| | Option A — ADC | Option B — service account key |
|---|---|---|
| Who the API calls run as | You | The service account |
| Search Console access | Already have it for every property you own or were granted | Must be granted per property, which the Search Console UI currently rejects (see below) |
| Key file to manage | None | JSON key, must be stored outside the repo |
| Quota project | Required | Not needed (billed to the key's own project) |

#### Option A: sign in as yourself (ADC)

1. Sign in, requesting the Search Console scope:

```bash
gcloud auth application-default login \
  --scopes=https://www.googleapis.com/auth/webmasters.readonly,https://www.googleapis.com/auth/cloud-platform
```

2. Set the quota project:

```bash
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
```

Your credentials must end up with a quota project — with user credentials and no quota project attached, the Search Console API returns `403 PERMISSION_DENIED`:

> Your application is authenticating by using local Application Default Credentials. The searchconsole.googleapis.com API requires a quota project, which is not set by default.

Step 1 tries to attach your current `gcloud config` project automatically, but it silently skips that when the account you signed in as lacks the `serviceusage.services.use` permission on it (project Editor and Owner both include that permission), leaving you with credentials that get the 403 above:

> WARNING: Cannot add the project "YOUR_PROJECT_ID" to ADC as the quota project because the account in ADC does not have the "serviceusage.services.use" permission on this project.

Running step 2 explicitly is the reliable path, and it is also how you bill a project other than your configured one. The `cloud-platform` scope in step 1 is what allows the quota project to be attached.

You do **not** need to create your own OAuth client ID or pass `--client-id-file`: gcloud's built-in client grants `webmasters.readonly` (confirmed on Google Cloud SDK 557.0.0). The [gcloud reference](https://cloud.google.com/sdk/gcloud/reference/auth/application-default/login#--scopes) does say to create an OAuth client ID for scopes outside Google Cloud, so if a future version stops granting this one, that is the fallback:

```bash
gcloud auth application-default login \
  --client-id-file=client_id.json \
  --scopes=https://www.googleapis.com/auth/webmasters.readonly
```

Because the calls run as you, nothing needs to be added in Search Console — you already have access to every property you own or have been granted.

#### Option B: service account key

1. In the Google Cloud Console sidebar, go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **Service account**
3. Give it a name (e.g. "search-console-mcp"), then click **Create and Continue**
4. You can skip the optional role/access steps — click **Done**
5. On the Credentials page, click on the service account you just created
6. Go to the **Keys** tab → **Add Key** → **Create new key** → select **JSON** → click **Create**
7. A `.json` key file will download — save it somewhere safe (e.g. `~/.config/gcloud/service-account-key.json`)

> [!CAUTION]
> Treat this key file like a secret key. Do **not** save it inside your project repo or commit it to git. Store it outside your project directory and reference it by absolute path in your MCP config.

Then add the key path to the server's environment in whichever config you use below:

```json
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "/absolute/path/to/service-account-key.json"
      }
```

The service account also has to be granted access to each property you want to read:

1. Copy the service account's email address (it looks like `name@project-id.iam.gserviceaccount.com` — you can find it on the service account details page)
2. Go to [Google Search Console](https://search.google.com/search-console)
3. Select your property, then go to **Settings** → **Users and permissions**
4. Click **Add user**, paste the service account email, set the permission to **Restricted**, and click **Add**

> [!WARNING]
> Step 4 currently fails with "Failed to add user: email not found" for newly created service accounts — this is what motivated adding Option A. If you hit it, use Option A, or use an existing service account that was already added to the property.

### Claude Code

```bash
claude mcp add gsc --scope user -- node /absolute/path/to/google-search-console-mcp/build/index.js
```

`--scope user` makes the server available in all your projects. Use `--scope project` instead to write it to `.mcp.json` in the current directory and share it with your team. Omitting `--scope` defaults to `local`, which only enables it for you in the current project.

Or add it manually to the `"mcpServers"` object in `~/.claude.json` (user scope) or `.mcp.json` (project scope):

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
