# Deploying the Economic Indicators site to Vercel

A step-by-step guide for **Windows + VS Code**, deploying through **GitHub**.

When you're done:

```
You edit code in VS Code ──git push──▶ GitHub ──▶ Vercel builds data + site ──▶ https://your-site.vercel.app
                                         ▲
             GitHub Actions, weekdays 07:17 ──┘  (asks Vercel to rebuild with fresh data)
```

Every build downloads fresh data from Statistics Canada and Yahoo Finance, then publishes the site.
If a download fails, the build stops and **the previous version stays live**, so students never see a broken site.

Time needed: about 45 minutes the first time, most of it waiting for installs and builds.

---

## Step 1: Install the tools (one time)

Install these four programs. Accept the defaults unless noted.

| Tool | Download | Note |
|---|---|---|
| **Git for Windows** | https://git-scm.com/download/win | Defaults are fine. It includes Git Credential Manager, which handles GitHub sign-in. |
| **Node.js 22 LTS** | https://nodejs.org | Choose the LTS installer. |
| **Python 3.12** | https://www.python.org/downloads/windows/ | On the first screen, tick **"Add python.exe to PATH"**. |
| **VS Code** | https://code.visualstudio.com | Then install the **Python** extension (by Microsoft) from the Extensions panel (`Ctrl+Shift+X`). |

You also need two free accounts: **GitHub** (https://github.com/signup) and **Vercel** (step 7, sign up with GitHub).

**Check the installs.** Close and reopen VS Code. Open a terminal with `` Ctrl+` `` and run:

```powershell
git --version
node -v
npm -v
py --version
```

Each command should print a version number. If one says *"not recognized"*, restart your computer and try again (see [Troubleshooting](#troubleshooting)).

---

## Step 2: Open the project in VS Code

1. Unzip `econ-dashboard.zip` to a simple path, for example `C:\Projects\econ-dashboard`.
   Avoid OneDrive-synced folders such as *Documents* or *Desktop*: syncing thousands of `node_modules` files slows everything down.
2. In VS Code: **File → Open Folder…** and choose the `econ-dashboard` folder.
3. Check you opened the right level: the Explorer panel should show `package.json`, `vercel.json` and `scripts` directly, not inside another folder.
4. If VS Code asks *"Do you trust the authors?"*, click **Yes**.

---

## Step 3: Create the Python virtual environment (venv)

A venv keeps this project's Python packages separate from the rest of your computer.

In the VS Code terminal (PowerShell):

```powershell
py -3.12 -m venv .venv
.venv\Scripts\Activate.ps1
```

Your prompt should now start with `(.venv)`.

> **If you see "running scripts is disabled on this system"**, run this once, then try `.venv\Scripts\Activate.ps1` again:
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
> ```
> Answer `Y` if asked.

Install the Python packages:

```powershell
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Tell VS Code to use this venv: press `Ctrl+Shift+P`, type **Python: Select Interpreter**, and choose the one marked `.venv`.
New terminals will now activate the venv automatically.

> The `.venv` folder is only for your computer. It's listed in `.gitignore`, so it never goes to GitHub.
> Vercel makes its own venv during each build (see `scripts/vercel_build.sh`).

---

## Step 4: Test the site on your computer

This step confirms the real data downloads correctly before you deploy.

```powershell
python scripts/build_data.py
```

This takes about 5–10 minutes. Each dataset prints its row count, and the script ends with `Done.`

- If a line says **`FAILED`**, note the dataset name and the error message, then see [Troubleshooting](#troubleshooting).
- No internet, or just want to check the layout? Run `python scripts/build_data.py --sample` instead (synthetic numbers).

Then install the website packages and start it:

```powershell
npm install
npm run dev
```

Open **http://localhost:3000** in your browser. Check that:

- the yellow "synthetic sample numbers" banner is **not** shown (it only appears with `--sample` data)
- a few indicator pages show charts
- **CSV** and **Excel** downloads work on one page

Press `Ctrl+C` in the terminal to stop the local server.

> The data files in `public/data` are **not** sent to GitHub (they're in `.gitignore`). Vercel rebuilds them on every deploy, which keeps the repository small.

---

## Step 5: Create an empty repository on GitHub

1. Go to https://github.com/new
2. **Repository name:** `econ-dashboard`
3. Choose **Public** or **Private**. Both work with Vercel.
4. **Leave all the "Initialize" boxes unticked** (no README, no .gitignore, no licence). The project already has these.
5. Click **Create repository**, and keep the page open: you'll need the URL that looks like
   `https://github.com/YOUR-USERNAME/econ-dashboard.git`

---

## Step 6: Push the code to GitHub

In the VS Code terminal, inside the project folder.

**First time using Git on this computer only**, tell Git who you are:

```powershell
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

Then:

```powershell
git init -b main
git add .
git commit -m "Initial version of the economic indicators site"
git remote add origin https://github.com/YOUR-USERNAME/econ-dashboard.git
git push -u origin main
```

A browser window asks you to sign in to GitHub the first time. Approve it and the push continues.

> You may see warnings like *"LF will be replaced by CRLF"*. They're harmless; the project's `.gitattributes` file keeps the build scripts in the right format.

**Check:** refresh the GitHub page. You should see `app`, `components`, `scripts`, `vercel.json`, etc.
You should **not** see `.venv`, `node_modules` or files inside `public/data` (only `.gitkeep`).

> **Prefer clicking?** VS Code's Source Control panel (`Ctrl+Shift+G`) has a **Publish to GitHub** button that does steps 5–6 for you.

---

## Step 7: Import the project into Vercel

1. Go to https://vercel.com/signup and choose **Continue with GitHub**.
2. On the dashboard, click **Add New… → Project**.
3. Find `econ-dashboard` in the list and click **Import**.
   - Not listed? Click **Adjust GitHub App Permissions** (or *Configure GitHub App*) and give Vercel access to the repository.
4. On the configuration screen:
   - **Framework Preset:** Next.js (detected automatically)
   - **Root Directory:** leave as `./`
   - **Build and Output Settings:** leave as they are. `vercel.json` already tells Vercel to run `scripts/vercel_build.sh`, which builds the data and then the site.
   - **Environment Variables:** none needed.
5. Click **Deploy**.

The first build takes roughly 5–15 minutes, because it downloads every dataset. To watch progress, click the deployment and open **Build Logs**. You'll see the same `[statcan] …` lines as in step 4.

---

## Step 8: Check the live site

When the build finishes, Vercel shows a preview and a URL such as `https://econ-dashboard-xxxx.vercel.app`.

1. Open it and click through a few indicators.
2. On one indicator page, download **Your selection** and **Complete dataset** in both CSV and Excel.
3. Open the **All datasets** page from the sidebar and check the "Last rebuilt" time.

**Want a nicer address?** In Vercel, go to **Project → Settings → Domains**. You can rename the `.vercel.app` address there, or add your department's own domain.

This is the link to share with students.

---

## Step 9: Turn on the daily data refresh

Statistics Canada releases new numbers regularly, so the site should rebuild on its own. The project includes a GitHub workflow (`.github/workflows/refresh.yml`) that asks Vercel to rebuild every weekday at 07:17 Toronto time. It needs a **deploy hook** to do that.

**9a. Create the deploy hook in Vercel**

1. Vercel → your project → **Settings → Git**.
2. Scroll to **Deploy Hooks**.
3. **Name:** `daily-data`, **Branch:** `main` → **Create Hook**.
4. Copy the URL it shows (it starts with `https://api.vercel.com/v1/integrations/deploy/…`).

> Treat this URL like a password: anyone who has it can trigger builds.

**9b. Store it as a secret in GitHub**

1. GitHub → your repository → **Settings → Secrets and variables → Actions**.
2. Click **New repository secret**.
3. **Name:** `VERCEL_DEPLOY_HOOK` (exactly this).
4. **Secret:** paste the URL → **Add secret**.

**9c. Test it**

1. GitHub → **Actions** tab. If prompted, click **I understand my workflows, go ahead and enable them**.
2. Choose **Refresh data on Vercel** → **Run workflow** → **Run workflow**.
3. It should turn green within a few seconds.
4. In Vercel → **Deployments**, a new build appears, labelled as triggered by the deploy hook.

From now on, the data refreshes every weekday morning without you doing anything.

> To change the schedule, edit the `cron:` line in `.github/workflows/refresh.yml`. The time is in UTC: `17 11` means 11:17 UTC, which is 07:17 Toronto summer time and 06:17 in winter.

---

## Step 10: Making changes later

Edit files in VS Code, preview with `npm run dev`, then send the changes:

```powershell
git add .
git commit -m "Describe what you changed"
git push
```

Vercel deploys every push to `main` automatically. If you push to another branch, Vercel makes a separate **preview** URL, which is handy for trying changes before your class sees them.

To roll back a bad version: Vercel → **Deployments** → open an earlier deployment → **⋯ → Promote to Production** (called **Instant Rollback** on some plans).

**Each time you open the project again,** check the terminal prompt starts with `(.venv)`. If it doesn't, run `.venv\Scripts\Activate.ps1`.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `git`, `node` or `py` is *not recognized* | Restart VS Code, then the computer. If it still fails, reinstall that tool. For Python, tick **Add python.exe to PATH**. |
| Typing `python` opens the Microsoft Store | Windows **Settings → Apps → Advanced app settings → App execution aliases**: turn **off** both *python.exe* and *python3.exe*. Then reopen the terminal and activate the venv. |
| *Running scripts is disabled on this system* | Run `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` once (step 3). |
| `pip install` fails | Make sure `(.venv)` shows in the prompt, then run `python -m pip install --upgrade pip` and try again. |
| `git push` is rejected: *"failed to push some refs"* | The GitHub repo wasn't empty. Run `git pull origin main --allow-unrelated-histories`, then `git push`. |
| Repo doesn't appear in Vercel's import list | Click **Adjust GitHub App Permissions** on the import screen and grant access to the repo. |
| Vercel build log shows `FAILED: com: …` (or `sec`, `stock`) | Yahoo Finance sometimes rate-limits cloud servers. Click **Redeploy** in Vercel, or wait for the next scheduled refresh. The old site stays live meanwhile. |
| Vercel build log shows `FAILED: cpi: no rows after filtering` (any StatCan dataset) | Statistics Canada renamed a category or unit. Copy the log line and send it to me; it's a one-line fix in `scripts/build_data.py`. |
| Build fails with *"Command 'bash scripts/vercel_build.sh' exited with 1"* | Scroll up in the build log to the first error line: that's the real cause. |
| Site loads but a page says *"dataset is missing from this build"* | One dataset failed during a build. Redeploy from Vercel. |
| The Action in step 9 fails with *"Add the VERCEL_DEPLOY_HOOK secret first"* | Check the secret name is exactly `VERCEL_DEPLOY_HOOK`, under **Actions** secrets, not Codespaces or Dependabot. |

---

## Good to know

- **Cost:** Vercel's free *Hobby* plan is enough for this site. It's meant for personal, non-commercial use; if your department wants it under a shared team account, use the *Pro* plan. Check **Usage** in the Vercel dashboard after busy weeks: the complete-dataset files are the largest downloads.
- **No server to overload:** every page and every complete-dataset file is a static file on Vercel's CDN. Filtered downloads are built in each student's browser.
- **Your laptop doesn't need to be on.** After step 9, everything runs on GitHub and Vercel.
