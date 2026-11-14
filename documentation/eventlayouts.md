---
layout: page
title: Event Page Layouts
permalink: /documentation/eventlayouts/
---
An event can keep the classic event page or pick one of three newer layouts. Everything is set in the event's data file under `_data/events/`. The event post does not change: it still uses `layout: event`.

All of the keys on this page are optional. An event that sets none of them looks exactly as it did before.

## 1. Pick a layout

```yaml
eventlayout: poster
```

| Value | What you get |
|---|---|
| (blank) | The classic event page. |
| `poster` | A full-width colored header with the event name, date and main buttons, and a section menu that stays at the top of the window. |
| `rail` | The logo, date, buttons and section menu stay in a column on the left while the content scrolls on the right. |
| `tabs` | A compact header with tabs: Attend, Speakers, Sponsors, Volunteer. |

The event logo (`logo`) can be round, square or wide. It is scaled to fit its frame.

## 2. Pick four colors

```yaml
colorprimary: "#133F4C"
colorsecondary: "#EE422B"
colorbutton: "#FCAA18"
colorlink: "#1F6FAE"
```

| Key | Used for |
|---|---|
| `colorprimary` | The header, headings, section rules and the selected tab. Pick a dark or strong color: headings use it on a white page. |
| `colorsecondary` | Small accents, such as the rule in the header and the stripe on session cards. |
| `colorbutton` | The main buttons: Register now, pre-con Register, Submit your session. |
| `colorlink` | Text links. Pick a color that is easy to read on white. |

Put each value in quotes, because `#` starts a comment in YAML. Text on top of the primary and button colors switches between dark and white automatically. Colors you leave blank use the Day of Data defaults.

## 3. Registration

Registration is shown only until the end of the event day (`date`). After that the buttons and the form are hidden.

- For a Register now button that links to Eventbrite or another site, put the link in `registrationurl`.
- To embed a Zeffy registration form in the page, see [Zeffy registration](/documentation/zeffyregistration/).

## 4. Sponsorship payment

The newer layouts have a Become a sponsor button. To connect it to a Zeffy form or another payment link, see [Zeffy sponsorship payments](/documentation/zeffysponsorship/).

Each sponsor in `sponsors` shows its `image` and opens its `link` in a new tab. Sponsors are grouped by `type` in the order the types first appear.

## 5. Sessionize: schedule, speakers and sessions

The newer layouts can draw the schedule, speakers and submitted sessions themselves. For that they need the JSON version of your Sessionize data.

1. In Sessionize, open your event and go to **API / Embed**.
2. Create a new endpoint and set its format to **JSON**.
3. In that endpoint's settings, switch on any session fields you want shown, such as a level or uploaded slides. Sessionize leaves custom fields off until you enable them on the endpoint.
4. Copy the endpoint ID. It is the part after `/api/v2/` in the endpoint address.
5. Add this to the event's data file, with your ID in place of `YOUR-ID`:

```yaml
sessionizetype: json
speakerlisturl: https://sessionize.com/api/v2/YOUR-ID/view/Speakers
submittedsessionurl: https://sessionize.com/api/v2/YOUR-ID/view/Sessions
scheduleurl: https://sessionize.com/api/v2/YOUR-ID/view/GridSmart
```

What each one does:

- `speakerlisturl`: speaker cards with photo, tagline, bio (with Show more) and links.
- `submittedsessionurl`: the Sessions section, which lists submitted sessions until the schedule is posted. It also supplies each session's level, slides and demo files to the schedule.
- `scheduleurl`: the schedule popup, by day, time and room. Leave it blank until the schedule is ready. Once it is set, the Sessions section goes away and View schedule appears.

`sessionizeappurl` is optional. Give it the address of your Sessionize app and a Build My Schedule link shows beside the print schedule link, so attendees can pick their favorite sessions.

Leave `sessionizetype` blank to keep Sessionize's own embeds. In that case the three URLs are the embed addresses you use today.

A session's level, length, slides and demo files show only when Sessionize sends them.

## 6. Pre-cons

Copy this block into the data file and fill in up to three. Leave a slot blank to skip it.

```yaml
preconintro: Pre-cons will be held on Friday.
preconname1:
preconspeaker1:
preconspeakerimageurl1:
precondescription1:
preconregurl1:
preconname2:
preconspeaker2:
preconspeakerimageurl2:
precondescription2:
preconregurl2:
preconname3:
preconspeaker3:
preconspeakerimageurl3:
precondescription3:
preconregurl3:
```

A pre-con's Register button shows only while the event is upcoming and that pre-con has a `preconregurl`. `preconspeakerimageurl` is optional. Give it the web address of the speaker's photo and it shows on the pre-con card. For two speakers, put both addresses in quotes with a comma between them. If no `preconname` is filled in, the older `precondetail` block is shown when `precons: true`.

## 7. Organizers

```yaml
organizers:
  - name: Your Name
    email: "you@example.com"
    twitter: yourhandle
    linkedin: https://www.linkedin.com/in/your-profile
    url: https://example.com
```

`linkedin` is new. A contact line is shown only when the organizer has that value.

The `social` block also takes an optional `meetup` line. Give it the full address of your user group's Meetup page and a Meetup icon shows beside the LinkedIn and Twitter icons in the event details.

## 8. What shows and when

| Item | Shown when |
|---|---|
| Register now and the registration form | The event day has not passed and `registrationurl` is set. |
| Call for speakers | `callforspeakers: true`, `callforspeakersurl` is set, and `callforspeakersenddate` has not passed. |
| View schedule | `scheduleurl` is set. |
| Sessions section | `submittedsessionurl` is set and `scheduleurl` is blank. |
| Counts in the menu | Pre-cons filled in, speakers from Sessionize, sponsors listed. |

## 9. Try it first

These data files are working examples you can copy from. Each layout has a past event (2026) and an upcoming one (2027):

| Data file | Page |
|---|---|
| `_data/events/PosterTemplate2026.yml` | [/PosterTemplate2026/](/PosterTemplate2026/) |
| `_data/events/PosterTemplate2027.yml` | [/PosterTemplate2027/](/PosterTemplate2027/) |
| `_data/events/SideRailTemplate2026.yml` | [/SideRailTemplate2026/](/SideRailTemplate2026/) |
| `_data/events/SideRailTemplate2027.yml` | [/SideRailTemplate2027/](/SideRailTemplate2027/) |
| `_data/events/TabsTemplate2026.yml` | [/TabsTemplate2026/](/TabsTemplate2026/) |
| `_data/events/TabsTemplate2027.yml` | [/TabsTemplate2027/](/TabsTemplate2027/) |

The example pages are hidden from the event lists.

## FAQ

**Where can I see each layout?**
These example pages are live on the site:

- [Poster, past event (2026)](/PosterTemplate2026/)
- [Poster, upcoming event (2027)](/PosterTemplate2027/)
- [Side rail, past event (2026)](/SideRailTemplate2026/)
- [Side rail, upcoming event (2027)](/SideRailTemplate2027/)
- [Tabs, past event (2026)](/TabsTemplate2026/)
- [Tabs, upcoming event (2027)](/TabsTemplate2027/)

**Do I have to change my event post?**
No. The post keeps `layout: event`. Everything is set in the data file.

**Will my existing event page change?**
No. An event changes only when you add `eventlayout` to its data file.

**Can I switch layouts later?**
Yes. Change the one word after `eventlayout:` and submit a pull request. Remove it to go back to the classic page.

**My logo is not round. Will it fit?**
Yes. Round, square and wide logos are all scaled to fit.

**Why is there no Register now button?**
Either `registrationurl` is blank or the event day has passed. Registration is never shown after the event.

**Why is there no Speakers or Sessions section?**
Those sections show only when their Sessionize addresses are filled in. A new event with no submissions yet does not show them.

**Why does the schedule say it has not been announced?**
`scheduleurl` is blank. Add it when the schedule is ready and View schedule appears.

**Where do the numbers in the menu come from?**
Pre-cons are counted from the `preconname` slots you filled in, speakers come from Sessionize, and sponsors are counted from your `sponsors` list.

**Speaker photos, levels or slides are missing. Why?**
They come from Sessionize. Check that `sessionizetype` is `json`, that the three addresses are from a JSON endpoint, and that the fields are switched on for that endpoint in Sessionize.

**How does it look on a phone?**
The menu stacks above the content and each section gets a Back to top link.

**How do I take registration or sponsorship payments with Zeffy?**
See [Zeffy registration](/documentation/zeffyregistration/) and [Zeffy sponsorship payments](/documentation/zeffysponsorship/).
