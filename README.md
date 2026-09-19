# Google Search Console MCP Server

A minimal MCP server for Google Search Console.

Give Codex, Claude Code, or Claude Desktop read-only access to your search analytics, URL indexing information, and sitemap status. Runs locally; cannot change your site or Search Console settings.

Once connected, ask your agent:

- "Which queries had the most impressions but few clicks over the last 28 days?"
- "Compare mobile vs desktop search performance this month."
- "Check the indexing status of https://example.com/blog/my-post."

[Setup](#setup) · [Tools](#tools) · [Limitations](#limitations) · [Troubleshooting](#troubleshooting)

## Setup

You need Node.js and npm, an MCP client, and access to a Search Console property. To sign in as yourself, also install the [Google Cloud CLI](https://cloud.google.com/sdk/docs/install). Server startup and tool discovery were checked with Node.js 22.

### 1. Enable the Google API

Create or select a project in [Google Cloud Console](https://console.cloud.google.com/), then [enable the Search Console API](https://console.cloud.google.com/marketplace/product/google/searchconsole.googleapis.com). Note the project ID for the next step.

### 2. Authenticate

**Recommended for new users: sign in as yourself.** Application Default Credentials (ADC) use your existing Search Console permissions, so you don't need to add another user to your properties.

> [!IMPORTANT]
> ADC requires the source build below. The published npm package **1.0.1 requires a service account key**; use that path if you already have a service account with property access.

Run both commands, replacing `YOUR_PROJECT_ID` with the project you enabled above:

```bash
gcloud auth application-default login \
  --scopes=https://www.googleapis.com/auth/webmasters.readonly,https://www.googleapis.com/auth/cloud-platform
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
```

The quota project is required. For permission or scope errors, see [troubleshooting](#troubleshooting).

<details>
<summary>Alternative: use a service account key</summary>

1. In Google Cloud Console, go to **APIs & Services → Credentials → Create Credentials → Service account**. Name it and finish creation; you can skip the optional role/access steps.
2. Open the service account, then **Keys → Add Key → Create new key → JSON** to download a key.
3. In [Search Console](https://search.google.com/search-console), open each property's **Settings → Users and permissions → Add user**. Add the service account email with **Restricted** access.

> [!CAUTION]
> Store the key outside your repo and never commit it. Use its absolute path in your client's configuration below.

If Search Console rejects the email with "Failed to add user: email not found," use ADC instead; see [troubleshooting](#troubleshooting).

The source build checks `GOOGLE_APPLICATION_CREDENTIALS` before local ADC. If switching to ADC, remove an old key-path setting from your client configuration and environment.

</details>

### 3. Install the server

**Using ADC:** build from source. **Using a service account:** the `npx` commands in the next step download and run version 1.0.1 for you.

<details>
<summary>Build from source (required for ADC)</summary>

```bash
git clone https://github.com/sarahpark/google-search-console-mcp.git
cd google-search-console-mcp
npm install
npm run build
```

Use the absolute path to the resulting `build/index.js` in your client configuration.

</details>

<details>
<summary>Let Codex or Claude Code handle installation and configuration</summary>

After completing authentication, paste this into your agent:

> Clone and build the Google Search Console MCP server from https://github.com/sarahpark/google-search-console-mcp, then add it as `gsc` to this client's user-level MCP config, preserving existing servers. Use my local Application Default Credentials. Tell me when setup is complete and whether I need to restart the client.

For a service account, replace "Use my local Application Default Credentials" with "Set `GOOGLE_APPLICATION_CREDENTIALS` to `/path/to/service-account-key.json`" and use your actual file location.

Once configured, skip to step 5.

</details>

### 4. Connect your client

Choose your client and run the command for your authentication method. Replace placeholder paths with your actual absolute paths; keep quotes around paths containing spaces. Preserve any existing server entries.

<details>
<summary>Codex</summary>

**Source build with ADC:**

```bash
codex mcp add gsc -- node "/absolute/path/to/google-search-console-mcp/build/index.js"
```

**npm package with a service account:**

```bash
codex mcp add gsc \
  --env "GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account-key.json" \
  -- npx -y @sarahpark/google-search-console-mcp@1.0.1
```

For manual configuration in `~/.codex/config.toml`, see the [Codex MCP documentation](https://developers.openai.com/codex/mcp).

</details>

<details>
<summary>Claude Code</summary>

**Source build with ADC:**

```bash
claude mcp add gsc --scope user -- node "/absolute/path/to/google-search-console-mcp/build/index.js"
```

**npm package with a service account:**

```bash
claude mcp add gsc --scope user \
  --env "GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account-key.json" \
  -- npx -y @sarahpark/google-search-console-mcp@1.0.1
```

`--scope user` makes the server available across your projects. Use `--scope project` to share configuration through the project's `.mcp.json` instead.

</details>

<details>
<summary>Claude Desktop</summary>

Add the appropriate entry to `claude_desktop_config.json`, merging it into any existing `mcpServers` object.

**Source build with ADC:**

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

**npm package with a service account:**

```json
{
  "mcpServers": {
    "gsc": {
      "command": "npx",
      "args": ["-y", "@sarahpark/google-search-console-mcp@1.0.1"],
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "/absolute/path/to/service-account-key.json"
      }
    }
  }
}
```

</details>

### 5. Verify the connection

Restart your client or start a new session, then ask:

> Use the gsc MCP server to list my Search Console properties.

A successful `list_sites` call verifies both the connection and Google access. Use the exact property URL it returns in later requests, such as `sc-domain:example.com` or `https://example.com/`.

## Tools

<details>
<summary>List your properties — <code>list_sites</code></summary>

List all sites (properties) you have access to in Google Search Console.

No parameters required.

</details>

<details>
<summary>Query search performance — <code>search_analytics</code></summary>

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
<summary>Inspect a URL — <code>inspect_url</code></summary>

Check indexing status, crawl info, and mobile usability for a URL.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteUrl` | string | Yes | Site URL as it appears in Search Console |
| `inspectionUrl` | string | Yes | The full URL to inspect (must belong to the site) |

</details>

<details>
<summary>Check sitemap status — <code>list_sitemaps</code></summary>

List all submitted sitemaps and their status for a site.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteUrl` | string | Yes | Site URL as it appears in Search Console |

</details>

## Limitations

- Search analytics returns at most 25,000 rows per call, without pagination. Results may omit pages or queries, and recent data may be incomplete.
- URL inspection checks one URL at a time; it does not export a site's full indexing coverage report.
- Your agent performs comparisons and opportunity analysis using the returned data. This is a local STDIO server, not a hosted ChatGPT web integration.

## License

[MIT](LICENSE)

## Troubleshooting

<details>
<summary>403 error: missing quota project or permission</summary>

If the error says the API "requires a quota project," rerun:

```bash
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
```

Your account needs `serviceusage.services.use` on that project. If permission is denied, ask a project administrator to grant it or use a project where you have it, with the Search Console API enabled.

Login attempts to attach your configured project automatically but can skip it when you lack permission. Setting it explicitly makes that failure visible. The `cloud-platform` scope in the setup command allows the quota project to be attached.

</details>

<details>
<summary>gcloud won't grant the Search Console scope</summary>

The built-in gcloud client was confirmed to grant `webmasters.readonly` with Google Cloud SDK 557.0.0. If it doesn't work in your version, follow the [gcloud guidance for additional scopes](https://cloud.google.com/sdk/gcloud/reference/auth/application-default/login#--scopes) to create your own OAuth client, then sign in with its downloaded client file:

```bash
gcloud auth application-default login \
  --client-id-file=client_id.json \
  --scopes=https://www.googleapis.com/auth/webmasters.readonly,https://www.googleapis.com/auth/cloud-platform
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
```

Keep credential files outside your repo.

</details>

<details>
<summary>Search Console says "Failed to add user: email not found"</summary>

This has been reported when adding newly created service accounts and motivated the ADC option. Sign in as yourself and use the source build, or use an existing service account that already has access to the property.

</details>

<details>
<summary>Missing credentials or no properties returned</summary>

- **Using npm 1.0.1:** set `GOOGLE_APPLICATION_CREDENTIALS` in the client configuration to your service account key's absolute path. This release does not support signing in through local gcloud ADC.
- **Using ADC:** use the source build and ensure an old `GOOGLE_APPLICATION_CREDENTIALS` setting isn't overriding your login. The signed-in Google account must have access to the property.
- **Using a service account:** confirm its email was added to each property you want to read.

</details>
