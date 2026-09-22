# GrowthOps mail (Apps Script)

Sends the dashboard's two emails from the GrowthOps Google account:
a task handed to someone, and the 8 pm summary of the team's day with what is worth a look.
The database calls it; it holds no data and no database keys.

## Set up once (about three minutes, from growthops@ssei.co.in)

1. Open https://script.google.com and click **New project**. Name it "GrowthOps mail".
2. Delete the sample code and paste the whole of `Code.gs`. Save.
3. **Project Settings** (the gear) > **Script properties** > Add property:
   `MAIL_TOKEN` = the token from the file Claude gives you. Save.
4. **Deploy** > **New deployment** > type **Web app**.
   Execute as: **Me**. Who has access: **Anyone**. Deploy.
   Approve the permissions (it asks to send email as you).
5. Copy the **Web app URL** (ends in `/exec`) into the file Claude gives you.

Optional: in the editor, pick `selfTest` and run it. You get a test email.

Changing the code later: paste the new `Code.gs`, then **Deploy** >
**Manage deployments** > edit > **Version: New**. The URL stays the same.
