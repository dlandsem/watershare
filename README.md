# WaterShare setup guide (stage 1)

WaterShare runs on your iPhone from its own home-screen icon and works with no signal. In this first stage, all your data (readings, photos, bills) is stored on the phone itself. Google Drive sync comes in stage 2, so until then use **Setup → Save a backup file** regularly.

Setup takes about 15 minutes, and you only do it once.

## 1. Put the app online with GitHub Pages (on your Windows PC)

1. Unzip `watershare.zip` somewhere easy to find, like your Desktop. You should see `index.html`, `app.js`, `calc.js`, `styles.css`, `sw.js`, `manifest.webmanifest`, this guide, and an `icons` folder.
2. Sign in at [github.com](https://github.com).
3. Click the **+** in the top-right corner, then **New repository**.
   - Repository name: `watershare`
   - Choose **Public**. Free GitHub Pages requires this. It only makes the app's *code* public. Your members, readings and photos are never uploaded to GitHub; they stay on your phone (and later your Google Drive).
   - Leave everything else as is and click **Create repository**.
4. On the next page, click the link that says **uploading an existing file**.
5. Open your unzipped folder in File Explorer, select **everything inside it** (including the `icons` folder), and drag it all into the GitHub upload area. Wait until every file is listed, then click **Commit changes**.
6. Check that the `icons` folder appears in the file list. If it doesn't, click **Add file → Upload files** and drag the `icons` folder in again.
7. Go to the repository's **Settings** tab, then **Pages** in the left menu.
   - Under *Build and deployment*, set Source to **Deploy from a branch**.
   - Set Branch to **main** and the folder to **/ (root)**, then click **Save**.
8. Wait a minute or two and refresh the page. A box will show your app's address, which looks like:
   `https://YOUR-GITHUB-USERNAME.github.io/watershare/`

## 2. Install it on your iPhone

1. On your iPhone, open that address in **Safari**. It has to be Safari; other browsers on iPhone can't install apps to the home screen.
2. Tap the **Share** button (the square with an arrow pointing up), scroll down, and tap **Add to Home Screen**, then **Add**.
3. Open WaterShare from the new home-screen icon while you still have a signal. That first launch saves the app onto the phone. After that, it opens and works with no signal at all.

> **Important:** Always use the home-screen icon, not the Safari tab. On iPhone, the home-screen app and Safari keep separate storage, so anything you enter in the Safari tab won't show up in the app.

## 3. First-time setup inside the app

1. **Setup → Add a member** for each household, including yourself.
   - The **starting reading** is the meter reading just *before* the first month you'll enter. For example, if you're entering history starting with October 2025, use each meter's September 2025 reading. The first month's usage is calculated from it.
   - Turn on **Manager** for yourself. The manager doesn't pay the management fee.
2. **Setup → Billing and meters.** Enter the utility meter's starting reading (same rule as above), its unit, your system name, the management fee (10%), and your checksum warning limit.

## 4. Entering your past year

1. Go to **Months → Start a new month** and pick your *oldest* month first.
2. Tap each member to enter their reading and date. For photos, **Take or choose photo** lets you pick existing pictures from your camera roll.
3. Enter the utility meter reading, then **Enter the utility bill** with its base fee, usage fee, measured usage, any extra charges, and the PDF.
4. Check the member charges against your spreadsheet. They should match to the penny, give or take rounding.
5. Repeat for each following month. **Start a new month** suggests the next month automatically.

## 5. A normal month in the field

1. Tap **Start a new month**.
2. Tap the first member, type the reading, take the photo, and tap **Save and next**. The app steps through every unread member and ends on the utility meter.
3. When the bill arrives, open the month and tap **Enter the utility bill**. Charges calculate automatically.

## Special cases

- **Meter replaced:** In that member's reading, open *Meter was replaced this month*. Enter the old meter's final reading and the new meter's starting reading. Next month, just enter the new meter's reading as usual.
- **Misread or stuck meter:** Use *Override the usage*. A reason is required, and the month is labeled "usage overridden" wherever it appears.
- **Temporarily vacant house:** In Setup, turn off **Active** for that member. They're left out of new months, including the base fee split. To change who's in an existing month, open it and tap **Members included**.

## Backups (important until Google Drive sync arrives)

**Setup → Save a backup file** creates one file containing everything, including photos and bill PDFs. Tap **Save or share the backup**, then choose **Save to Files**, or pick the OneDrive or Google Drive app. The Months screen reminds you if it's been more than 30 days.

To move to a new phone, or to recover, use **Setup → Restore from a backup file**.

## Installing future updates

When I send you updated files, go to your repository on GitHub, click **Add file → Upload files**, drag in the new files (they replace the old ones), and click **Commit changes**. Within a few minutes the app on your phone shows "A new version of WaterShare is ready". Tap **Reload**. Your data isn't affected.
