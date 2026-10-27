# Refresh ride data

[简体中文](./refresh-data.zh.md)

At 00:00 in Asia/Shanghai, [`.github/workflows/refresh-data.yml`](../.github/workflows/refresh-data.yml) reads the `DATA_SOURCE` repository variable and runs `make refresh igpsport` or `make refresh strava`. When the JSON changes, it commits `data/activities.json` and `data/rides/*.json` to `main`.

A manual run's source choice wins over the variable. One run exports one database, so switching sources replaces the site JSON with that database.

## Repository variable

The schedule has no form input. Put the source under **Repository variables**. Do not use the **Environment variables** section above it. That section belongs to a GitHub Environment, and this workflow does not read it.

1. Open **Settings → Secrets and variables → Actions**.
2. Open the **Variables** tab.
3. Under **Repository variables**, click **New repository variable**.
4. Set Name to `DATA_SOURCE`. The value must be `igpsport` or `strava`.

If it is missing or has another value, the nightly run fails and tells you to set `DATA_SOURCE`.

## Repository secrets

On that same page, open **Secrets** and click **New repository secret**. Use repository secrets, not environment secrets.

Secrets for the source you did not select can stay empty. The workflow checks only the values the current source needs.

| Name | When it is required | Value |
| --- | --- | --- |
| `ACTION_TOKEN` | Every run | A personal access token that can push to `main`. The steps are in the next section |
| `IGPSPORT_PHONE` | `DATA_SOURCE=igpsport` | iGPSPORT phone number |
| `IGPSPORT_PASSWORD` | `DATA_SOURCE=igpsport` | iGPSPORT password |
| `STRAVA_CLIENT_ID` | `DATA_SOURCE=strava` | Client ID from the steps below |
| `STRAVA_CLIENT_SECRET` | `DATA_SOURCE=strava` | Client Secret from the steps below |
| `STRAVA_REFRESH_TOKEN` | `DATA_SOURCE=strava` | Refresh token from the steps below |

For a local run, put the same names in `backend/.env` and do not commit that file. Locally, `IGPSPORT_ACCESS_TOKEN` can skip the login. The workflow does not pass that secret, so the scheduled iGPSPORT sync uses the phone and password.

## Configure ACTION_TOKEN

The workflow checks out the repo and commits the export with `secrets.ACTION_TOKEN`. The default `GITHUB_TOKEN` cannot push to a protected `main` branch. This token is required on every run, whichever source `DATA_SOURCE` selects.

1. Open your GitHub avatar → **Settings → Developer settings → Personal access tokens → Fine-grained tokens**. The page is <https://github.com/settings/personal-access-tokens>.
2. Click **Generate new token**.
3. Set Token name to something you can recognize, such as `cyc-earth-refresh`. Choose an expiration. Generate a new token and update the secret before that date.
4. Set Resource owner to the account that owns this repository. Under Repository access, choose **Only select repositories** and select this repository only.
5. Under Permissions, set **Contents** to **Read and write**. Leave the other permissions off.
6. Copy the token immediately after it is generated. GitHub does not show it again.
7. Return to this repository's **Settings → Secrets and variables → Actions → Secrets** and click **New repository secret**.
8. Name must be `ACTION_TOKEN`. Paste the token into Value.

If the account or organization does not allow fine-grained tokens, create a **Tokens (classic)** token with the `repo` scope, then store it with the same secret name in steps 7 and 8. The account that owns the token must be allowed to push directly to `main`.

## Manual run

Open **Actions → Refresh data → Run workflow**. The source is required and must be `igpsport` or `strava`. That choice overrides the repository variable for this run.

Two other switches:

- **Ignore downloaded rides cache for this run** skips the saved files and database and downloads again.
- **Delete downloaded rides cache from GitHub Actions** deletes the saved download cache.

A run can last up to 6 hours. When Strava returns 429, the download stops, a warning is printed, and the rides already saved are still parsed and exported. The command finishes successfully. The 15-minute limit resets at 0, 15, 30, and 45 minutes past the hour. The daily limit resets at midnight UTC.

## Get the three Strava keys

The steps match the [running_page Strava guide](https://github.com/yihong0618/running_page/blob/master/README-CN.md#strava). Use that page's screenshots. This project only reads rides, so the scope is `read,activity:read_all`. It does not need the write scopes in the running_page link.

In June 2026 Strava changed the developer program. A Standard app needs a Strava subscription before it can call the API. Check the app tier on the [API settings page](https://www.strava.com/settings/api). The notice is [Strava's announcement](https://communityhub.strava.com/insider-journal-9/an-update-to-our-developer-program-13428).

1. Sign in at [Strava](https://www.strava.com/).
2. Open [Create & Manage Your App](https://www.strava.com/settings/api) and create an application. Set **Authorization Callback Domain** to `localhost`, without `http://`.
3. After it is created, **Client ID** is `STRAVA_CLIENT_ID` and **Client Secret** is `STRAVA_CLIENT_SECRET`.
4. Replace `YOUR_CLIENT_ID` in this link, open it, and approve the access:

   ```text
   https://www.strava.com/oauth/authorize?client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=http://localhost/exchange_token&approval_prompt=force&scope=read,activity:read_all
   ```

5. The browser stops on a `localhost` page that does not load. Copy `code` from the address bar. In `http://localhost/exchange_token?code=YOUR_CODE&scope=read,activity:read_all`, the `YOUR_CODE` segment is the value to copy. The code works once and expires quickly.
6. Exchange the Client ID, Client Secret, and code for a refresh token:

   ```bash
   curl -X POST https://www.strava.com/oauth/token \
     -F client_id=YOUR_CLIENT_ID \
     -F client_secret=YOUR_CLIENT_SECRET \
     -F code=YOUR_CODE \
     -F grant_type=authorization_code
   ```

   The `refresh_token` field in the JSON is `STRAVA_REFRESH_TOKEN`. Put it, with the other two values, in `backend/.env` or in the three repository secrets above.

Strava sometimes issues a new refresh token. A local sync writes it back to `.env`. GitHub Actions does not update the repository secret. If the nightly run says the refresh token is invalid, authorize again and update `STRAVA_REFRESH_TOKEN`.
