# WaterShare setup guide

WaterShare runs on your iPhone from its own home-screen icon and works with no signal. Your data is saved on the phone first and uploaded to your Google Drive whenever you have signal.

**Already using stage 1?** Skip to [Updating from stage 1](#updating-from-stage-1), then [Connect Google Drive](#connect-google-drive).

Setup takes about 15 minutes, and you only do it once.

## 1. Put the app online with GitHub Pages (on your Windows PC)

1. Unzip `watershare.zip` somewhere easy to find, like your Desktop. You should see `index.html`, `app.js`, `calc.js`, `sync.js`, `export.js`, `styles.css`, `sw.js`, `manifest.webmanifest`, this guide, and `icons` and `lib` folders.
2. Sign in at [github.com](https://github.com).
3. Click the **+** in the top-right corner, then **New repository**.
   - Repository name: `watershare`
   - Choose **Public**. Free GitHub Pages requires this. It only makes the app's *code* public. Your members, readings and photos are never uploaded to GitHub; they stay on your phone (and later your Google Drive).
   - Leave everything else as is and click **Create repository**.
4. On the next page, click the link that says **uploading an existing file**.
5. Open your unzipped folder in File Explorer, select **everything inside it** (including the `icons` and `lib` folders), and drag it all into the GitHub upload area. Wait until every file is listed, then click **Commit changes**.
6. Check that the `icons` and `lib` folders appear in the file list. If one is missing, click **Add file → Upload files** and drag that folder in again.
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

## Statements and payments

Open a month and scroll to **Member charges**. Each member has two buttons:

- **Send statement** shows the message, which you can edit first. **Text** opens Messages with it filled in, **Email** opens Mail, and **Share** lets you pick any other app. The phone number and email come from the member's details in Setup. Put your payment instructions in **Setup → Payment instructions** and they're added to the end of every statement.
- **Mark paid** records the date and an optional note, like "check #1042". The Months list shows how many members are unpaid each month.

## Other bills, like the power bill

On the Months screen, tap **Add another bill**.

- **Split equally** is divided evenly among the included members. **Split by water usage** is divided by each member's total usage over the months you choose, which defaults to the last 12. You can use either one or both.
- Turn on **Add the management fee** if it applies to this bill.
- **On a month's statement** adds each member's share to that month's charges and statements. **Separate statement** gives it its own statements and paid/unpaid tracking.
- Attach the PDF, just like a utility bill.

## Connect Google Drive

This is a one-time setup of about 10 minutes on your PC, then a minute on your phone. Google's screens change their wording from time to time, so if a label below doesn't match exactly, look for the closest equivalent.

### On your PC: get a Google client ID

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and sign in with the Google account whose Drive you want to use.
2. Click the project picker at the top of the page, then **New project**. Name it `WaterShare`, click **Create**, and make sure it's selected afterward.
3. In the search bar at the top, type **Google Drive API**, open it, and click **Enable**.
4. In the search bar, type **OAuth consent screen** (it may be called **Google Auth Platform**) and open it. Click **Get started**.
   - App name: `WaterShare`. Support email: your email.
   - Audience: **External**.
   - Contact email: your email. Agree to the policy and click **Create**.
5. Open **Clients** (or **Credentials**), then **Create client** (or **Create credentials → OAuth client ID**).
   - Application type: **Web application**. Name: `WaterShare`.
   - Under **Authorized JavaScript origins**, add `https://YOUR-GITHUB-USERNAME.github.io`
   - Under **Authorized redirect URIs**, add `https://YOUR-GITHUB-USERNAME.github.io/watershare/`, including the slash at the end.
   - Click **Create**, then copy the **Client ID**. It ends in `.apps.googleusercontent.com`.
   - The app shows both addresses exactly under **Setup → Google Drive → Set up Google Drive sync**, with Copy buttons, if you'd rather copy them from there.
6. Open **Audience** and click **Publish app** (or **Push to production**). Without this step, Google makes you reconnect every 7 days. WaterShare only asks for access to files it creates itself, which Google treats as low-risk, so no review is needed.

### On your iPhone: connect

1. In WaterShare, go to **Setup → Google Drive → Set up Google Drive sync**.
2. Paste the Client ID and tap **Save and connect**.
3. Sign in to Google. If you see a notice that Google hasn't verified the app, that's expected for your own private app: tap **Advanced**, then continue. On the permissions screen, make sure the Google Drive box is ticked, then tap **Continue**.
4. You'll land back in WaterShare, and it starts uploading. The first upload of a year's photos can take a few minutes on wifi.

Your Drive gets a **WaterShare** folder containing:

- **Meter photos**, with one folder per month
- **Utility bills**
- **Other bills**
- **WaterShare-data.json**, the data file the app uses to restore everything

### How syncing works

The cloud button at the top of the screen shows the sync status:

- **Synced:** everything is uploaded.
- **3 changes to upload, no signal:** your changes are safe on the phone and upload on their own when you have signal.
- **Tap to sync:** Google sign-ins last about an hour. Tapping the button sends you briefly to Google and straight back, usually with no typing.

If something goes wrong, the button says **Sync problem**. Tap it to see the reason.

### A new phone, or a new manager

- **Your own new phone:** install the app, connect Google Drive with the same Google account, and choose to download the data when asked. You can also use **Setup → Google Drive → Download everything from Google Drive**.
- **Handing over to a new manager:** save a backup file (**Setup → Save a backup file**) and send it to them. They install WaterShare, restore the backup, and connect their own Google Drive. For a plain record, **Setup → Export to Excel** makes a workbook of everything. Choose the version with photos and bills to get a .zip with every file, linked from the workbook.

## Backup files

Once Google Drive is connected, you don't need these for day-to-day safety, but they're still the simplest way to hand everything to someone else. **Setup → Save a backup file** creates one file containing everything, including photos and bills. To load one, use **Setup → Restore from a backup file**.

## Updating from stage 1

1. Unzip the new `watershare.zip`.
2. On GitHub, open your `watershare` repository, click **Add file → Upload files**, drag in **everything** from the unzipped folder (including the new `lib` folder), and click **Commit changes**.
3. Check that `sync.js`, `export.js` and the `lib` folder now appear in the file list.
4. Within a few minutes, WaterShare on your phone shows "A new version of WaterShare is ready." Tap **Reload**. All your existing months, photos and bills carry over automatically.

## Installing future updates

Same as above: upload the new files to your repository, then tap **Reload** when the app offers it. Your data isn't affected.
