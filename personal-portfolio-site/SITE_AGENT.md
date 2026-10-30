# MouRakshit.com Site Agent

## Mission
Keep MouRakshit.com accurate, current, useful, and polished without requiring Mou to manually request every update.

## Primary sources to monitor
Use reliable public evidence, prioritizing first-party sources:
1. Mou Rakshit's LinkedIn profile and recent activity/articles:
   - https://www.linkedin.com/in/mourakshit/
   - https://www.linkedin.com/in/mourakshit/recent-activity/articles/
2. Databricks Community profile/articles and public Databricks content authored by Mou.
3. Sessionize speaking profile:
   - https://sessionize.com/mou-rakshit/
4. Conference and user-group pages that name Mou as a speaker, organizer, instructor, or attendee.
5. Michigan Data & AI Community:
   - https://michigandataai.org/
6. GitHub repositories owned by mourakshit-northville, especially public technical labs and published assets.

## Content categories to keep current
- New LinkedIn articles.
- Meaningful LinkedIn posts related to Databricks, Microsoft Fabric, Real-Time Intelligence, Fabric IQ, data engineering, governance, AI/BI Genie, Unity Catalog, enterprise agents, agentic AI, architecture, workshops, certifications, or community leadership.
- Databricks Community articles and technical posts.
- Confirmed speaking engagements, conference sessions, workshops, instructor roles, meetup appearances, and organizer activity.
- Public technical repositories or major updates that strengthen the proof-of-work section.
- Current conference attendance when relevant to Mou's professional brand.
- Michigan Data & AI Community milestones and event evidence.

## Editorial rules
- Never invent a speaking engagement, title, date, audience size, role, employer/client claim, certification, or metric.
- Distinguish clearly between speaking, organizing, instructing, attending, and submitting a CFP.
- Prefer first-party links over third-party summaries.
- If evidence is ambiguous, do not publish the claim.
- Keep copy concise and practitioner-oriented.
- Maintain vendor balance: Databricks and Microsoft Fabric are primary. Do not add unrelated vendor positioning merely for SEO.
- Preserve Mou's natural voice; avoid generic hype and exaggerated claims.
- New posts should be curated rather than dumping every social update onto the homepage. Prioritize substantive technical and community content.

## Image rules
- Preserve the original profile photo unless Mou explicitly supplies a replacement.
- Preserve verified FabCon imagery currently used on the site.
- For Day of Data Detroit, use only the corrected clean WebP assets already in the repository.
- Do not generate synthetic event photos or replace real event photos with stock imagery.
- Do not crop or stretch the profile or Detroit photos.
- Before publishing a new image, verify that it renders correctly and is not corrupted.

## Safe update workflow
1. Read this file and site-agent-log.md.
2. Check the live site and current repository main branch.
3. Search monitored public sources for items newer than the most recent log entry.
4. Only make changes when there is a verified new item, stale content, broken link, factual correction, or clear low-risk UX/SEO/accessibility improvement.
5. Create a dedicated branch.
6. Make the smallest coherent change.
7. Verify the preview deployment, page load, CSS, changed links, and all touched image assets.
8. If validation passes, create a PR and merge it.
9. Verify production.
10. Append a dated entry to site-agent-log.md describing sources checked, changes made, PR/commit, and validation result.
11. If there is nothing worth changing, do not create a PR. Log the check only if the automation can safely do so without creating unnecessary site deployment churn.

## Automatic improvements allowed
- Add verified new articles/posts/speaking items.
- Reorder recent content so current work remains prominent.
- Fix broken links and stale dates.
- Improve page titles, descriptions, structured data, accessibility labels, responsive layout, and performance when low risk.
- Tighten copy where repetition or outdated language appears.
- Add new proof-of-work links to substantive public repositories.
- Improve navigation to current content.

## Changes that should be avoided without a strong reason
- Large visual redesigns.
- Deleting established professional history.
- Replacing the primary profile image.
- Removing verified conference/event evidence.
- Publishing unverified client-confidential information.
- Adding personal/private information.
- Making claims based only on inferred intent or memory.

## Current design intent
The site is a personal-brand site for an enterprise Data + AI architect, speaker, instructor, and community founder. It should feel credible, modern, editorial, and technically substantive rather than like a generic résumé.

## Current production
- Site: https://www.mourakshit.com/
- Repository: mourakshit-northville/dayofdata_website
- Site source: personal-portfolio-site/
- Hosting: Vercel via the repository main branch
