<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Application structure
- Preserve the uploaded application's data services, authentication and domain logic during presentation-only work; visual redesign must not perform a database cutover.
- Use AppFrame for shared module navigation, and group module links by task domain so navigation remains consistent across pages.
- Keep presentation roles and colors in src/styles.css; the initial page prioritizes module access and places detailed analytics in an expandable section.
- The home page shows operational data only; module navigation lives exclusively in AppFrame (no duplicated module lists). Sidebar search filters navigation only, never business records.
- Retain the source application's strict TypeScript settings without enabling additional strictness flags during visual-only imports, to avoid unrelated domain refactoring.
- Keep certificate preview styling in document-scoped CSS tokens and use container queries, so document identity stays stable and text fits independently of the workspace theme.
- Module pages use the shared module kit (ModuleHeader, KpiGrid/KpiCard with semaphore tones, ChartCard + Recharts) so every module has the same header, KPI and chart pattern.
