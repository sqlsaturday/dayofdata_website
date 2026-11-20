---
layout: page
title: Event Data Editor
permalink: /documentation/eventeditor/
---

The [event data editor](/eventeditor/) lets you change an event's data file (`_data/events/YourEvent.yml`) in a web form instead of editing YAML by hand. It checks your changes, shows you the event page before anything is saved, and then lets you download the file, copy it, or commit it to GitHub and open a pull request.

Nothing on the live site changes until a pull request is merged.

## 1. Open your event

1. Go to [/eventeditor/](/eventeditor/).
2. Type part of the event name, city or number in **Find an event**, then pick it from the list.
3. The editor loads the data file from `sqlsaturday/dayofdata_website` on the `main` branch. To work from your fork or another branch, change **Load from repository** and **Branch** first, then press **Load**.

You can also press **Open a file from my computer** to edit a `.yml` file you already have.

Tip: a link such as `/eventeditor/?event=SQLSat1168` opens straight into that event.

## 2. Edit

- **Form** has every setting the event pages use, grouped the same way as the page: basics, layout and colors, location, registration, pre-cons, speakers, sponsors, organizers, social media.
- Each field shows its key name (for example `registrationurl`) so you can match it to the [event layout documentation](/documentation/eventlayouts/).
- Text fields that hold HTML, such as the description, location, sponsorship plan and pre-con descriptions, open in a **Visual** editor with a toolbar for paragraphs, headings, bold, italic, links, lists and images. Links to other sites open in a new tab. Press **HTML** to see and edit the code itself; the editor remembers which one you like. Pasted text comes in as plain text so it doesn't bring stray formatting along. Fields that hold scripts or embeds, such as the countdown script, can only be edited as HTML.
- **Template** at the top right picks the page layout: Default (the classic page), Poster, Side rail or Tabs. It is the same setting as `eventlayout`.
- **Highlight empty fields** marks every field that has no value, and the section links show how many are empty in each section. **Show only empty fields** hides everything else, so you can work down the list. Fields the selected template does not read are dimmed and marked "not used by" that template.
- The form keeps up with the site. A setting in your data file that is not one of the standard fields shows up under **Other settings** as its own field. A setting the page templates or `SQLSattemplate.yml` have, and your file does not, is offered there too, marked "available". **Add a setting** adds a new one by name.
- **Show advanced settings** adds the rarely used keys, such as the Eventbrite embed and the countdown script.
- **YAML** shows the file exactly as it will be saved. You can edit it there too. Press **Apply to form** when you are done.

The editor only rewrites the lines you change. Everything else in the file, including comments and spacing, stays the same, so the pull request shows just your changes.

Your work is saved in this browser as you go. If you close the tab by mistake, open the same event again and the editor offers to restore your changes.

## 3. Check

The **Checks** panel updates as you type:

- **Fix**: the page would break or show the wrong thing. You can't commit until these are fixed.
- **Check**: probably a mistake, such as a Zeffy address that is not the embed address, or a color that is hard to read.
- **Note**: good to know, such as "the event is in the past, so registration is hidden".

Click a check to jump to its field. **Check images and Sessionize** loads every logo and sponsor image and calls your Sessionize JSON endpoints to make sure they answer.

## 4. Preview

The **Preview** tab builds the event page with the site's own page templates, so it matches what the site will show for the poster, side rail, tabs or classic layout.

- **Desktop**, **Tablet** and **Phone** change the width.
- **As if today were** shows the page on another date. Use it to see the page after the call for speakers closes or after the event day, when registration is hidden.
- **Page templates** picks which repository and branch the templates come from. Leave it on `main` unless you are testing template changes on a branch.

## 5. Save

On **Review and save** you see every changed line, then choose how to save.

### Download or copy

- **Download the .yml file** and put it in `_data/events/` in your copy of the site, then commit and open a pull request the way you do today. See [how to submit a PR](/pullrequest/).
- **Copy the YAML**, then open the file in the GitHub editor with the link next to it, select everything, paste, and commit.

### Commit to GitHub from the page

1. Make a GitHub token (see below) and paste it in **Commit to GitHub**, then press **Sign in**.
2. **Commit to** is **My fork** for most people. If you don't have a fork yet, the editor makes one.
3. Pick **A new branch, started from the live site** (the editor suggests a name) or **A branch I already have**.
4. Check the commit message. Leave **Open a pull request** checked to send it to `sqlsaturday/dayofdata_website`, or uncheck it if you want to open the pull request yourself later.
5. Press **Commit**. The editor shows links to the commit, the file and the pull request.

If someone changed the file on that branch after you loaded it, the editor stops and tells you. Load it again to start from the newer version, or press **Commit** again to replace it with yours.

## GitHub token

The page talks to GitHub directly from your browser. The token is kept in this browser only and is sent only to GitHub. By default it is forgotten when you close the tab. Check **Remember the token on this computer** to keep it, and use **Sign out and forget the token** to remove it.

The simplest token that does everything:

1. In GitHub, go to **Settings**, **Developer settings**, **Personal access tokens**, **Tokens (classic)**, then **Generate new token (classic)**.
2. Give it a name such as "Day of Data editor" and an expiration date.
3. Check the **public_repo** scope only.
4. Generate it and copy it. GitHub shows it only once.

A fine-grained token also works for committing: give it access to your fork with **Contents: Read and write** and **Pull requests: Read and write**. GitHub may not let a fine-grained token open a pull request on `sqlsaturday/dayofdata_website`. If that happens, your commit is still saved, and the editor gives you a link to open the pull request on GitHub.

## FAQ

**Do I still need the event post in `_posts`?**
Yes. The editor changes the data file only. A new event still needs its post and redirect file. See [running a new event](/newevent/).

**Can I break the live site from here?**
No. Commits go to a branch, and the site changes only when a pull request is merged.

**Why does the preview look a little different from the live page?**
The preview has no site menu bar at the top, and Sessionize, Zeffy and Google Maps content loads from those services. Everything else comes from the same templates.

**The editor says it rewrote the whole file. Why?**
A few files have unusual YAML, such as two `---` sections. When the editor can't patch just the changed lines safely, it writes the whole file again so it stays valid. Look over the changes before you commit.

**Where are the layout settings explained?**
In [event page layouts](/documentation/eventlayouts/), [Zeffy registration](/documentation/zeffyregistration/) and [Zeffy sponsorship payments](/documentation/zeffysponsorship/).
