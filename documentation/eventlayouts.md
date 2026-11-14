# Event page layouts

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

```yaml
registrationtype: zeffy
registrationurl: https://www.zeffy.com/embed/ticketing/your-form-name
```

- Leave `registrationtype` blank and `registrationurl` is the link behind the Register now button (Eventbrite, for example).
- Set `registrationtype: zeffy` and the Zeffy form is embedded in the page. `registrationurl` is then the Zeffy embed address, the one that contains `/embed/`.
- Registration is shown only until the end of the event day (`date`). After that the buttons and the form are hidden.

## 4. Sponsorship payment

```yaml
sponsorpaymenttype: zeffy
sponsorpaymenturl: https://www.zeffy.com/embed/ticketing/your-sponsorship-form
```

This drives the Become a sponsor button. It works the same way as registration: blank type means the button links to `sponsorpaymenturl`, and `zeffy` embeds the form under the sponsorship plan. With no URL, the button jumps to the sponsorship plan.

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

Leave `sessionizetype` blank to keep Sessionize's own embeds. In that case the three URLs are the embed addresses you use today.

A session's level, length, slides and demo files show only when Sessionize sends them.

## 6. Pre-cons

Copy this block into the data file and fill in up to three. Leave a slot blank to skip it.

```yaml
preconintro: Pre-cons will be held on Friday.
preconname1:
preconspeaker1:
precondescription1:
preconregurl1:
preconname2:
preconspeaker2:
precondescription2:
preconregurl2:
preconname3:
preconspeaker3:
precondescription3:
preconregurl3:
```

A pre-con's Register button shows only while the event is upcoming and that pre-con has a `preconregurl`. If no `preconname` is filled in, the older `precondetail` block is shown when `precons: true`.

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
| `_data/events/PosterTemplate2026.yml` | `/PosterTemplate2026/` |
| `_data/events/PosterTemplate2027.yml` | `/PosterTemplate2027/` |
| `_data/events/SideRailTemplate2026.yml` | `/SideRailTemplate2026/` |
| `_data/events/SideRailTemplate2027.yml` | `/SideRailTemplate2027/` |
| `_data/events/TabsTemplate2026.yml` | `/TabsTemplate2026/` |
| `_data/events/TabsTemplate2027.yml` | `/TabsTemplate2027/` |

The example pages are hidden from the event lists.
