# Campaign Tracker feed (Apps Script)

Lets the 5 pm Campaign Signal job read the Campaign_Master_Tracker sheet. **Read-only**: nothing
in `Code.gs` writes to the sheet.

## Set up once (about three minutes)

1. Open the Campaign_Master_Tracker sheet. **Extensions** > **Apps Script**.
2. Delete the sample code, paste the whole of `Code.gs`. Save.
3. **Project Settings** (the gear) > **Script properties** > **Add property**:
   `FEED_TOKEN` = any long random string (30 or more characters). Save.
4. Back in the editor, pick `selfTest` and press **Run**. Approve the permissions. The log lists
   the tab, its row count and any column it could not find.
5. **Deploy** > **New deployment** > type **Web app**.
   Execute as: **Me**. Who has access: **Anyone**. Deploy.
6. Copy the **Web app URL** (ends in `/exec`).
7. Put the URL and the token in `growth_ops/_tmp/tracker_feed.txt`, one per line, and tell Claude.
   Never in chat, never in this repo. Claude moves them somewhere private and deletes that file.

"Anyone" is safe here because every request without the token gets `bad token` and nothing else.

## What it serves

The **WhatsApp Campaign Tracker** tab, header row 5, these columns only: Campaign Date, Campaign
Name, Cohort, Number Used, Campaign Type, Brief Description / Purpose, Goal, Cohort Status, Cohort
Data Count, Message Category, CTA Link Type, Scheduled Time, Campaign Status, Targeted Messages,
Sent, Delivered, Read, Total Clicks, Unique Clicks, Total Campaign Cost (₹), Conversions, Revenue
from Conversions (₹), Post-Campaign Notes / Learnings.

**Never served:** Cohort Link, Message Copy, CTA / Tracking Link, Image Asset / File Link. The
cohort links point at sheets of customer phone numbers and the dashboard is public.

Renaming a column in the sheet drops it from the feed until the new name is added to `TABS` in
`Code.gs`. The tracker page shows a warning naming the missing column.

## Changing the code later

Paste the new `Code.gs`, then **Deploy** > **Manage deployments** > edit > **Version: New**.
The URL stays the same.
