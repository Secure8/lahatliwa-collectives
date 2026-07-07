# Hevv Portfolio

Modern portfolio website for Hevv Ching, built with React, Vite, Tailwind CSS, React Router, Supabase Auth, Supabase Database, and Supabase Storage.

The site has a public portfolio area and a protected admin dashboard where a logged-in Supabase user can add, edit, publish, feature, and delete projects.

## Tech Stack

- React with JavaScript and JSX
- Vite
- Tailwind CSS through `@tailwindcss/vite`
- React Router
- Supabase Auth, Database, and Storage
- lucide-react icons
- clsx

## Install Dependencies

```bash
npm install
```

On Windows PowerShell, if scripts are blocked, use:

```bash
npm.cmd install
```

## Run Locally

```bash
npm run dev
```

Or on Windows PowerShell:

```bash
npm.cmd run dev
```

## Create a Supabase Project

1. Go to Supabase and create a new project.
2. Open Project Settings.
3. Copy the project URL.
4. Copy the anon public key.
5. Do not use or expose the service role key in this frontend app.

## Set Environment Variables

Copy `.env.example` to `.env.local` and fill in your Supabase values:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Only use the anon public key.

## Run the SQL Schema

1. Open the Supabase SQL editor.
2. Paste the contents of `supabase/schema.sql`.
3. Run the script.

This creates the `projects` table, indexes, timestamps, project Row Level Security policies, and Storage policies for the `project-media` bucket.

## Run the CMS Update

After the original schema is working, run:

```text
supabase/cms_update.sql
```

This adds:

- `site_settings` for brand name, logo, hero image, contact links, and footer text
- `page_content` for editable Home, About, Services, and Contact content
- RLS policies so public visitors can read content and authenticated users can manage it

## Create the Storage Bucket

1. In Supabase, open Storage.
2. Create a bucket named `project-media`.
3. Make it public for this beginner version so public project images can load.
4. Run `supabase/schema.sql` after the bucket exists so the Storage policies can apply.

If you later want private media, update `src/lib/storage.js` to use signed URLs.

## Create the First Admin User

1. In Supabase, open Authentication.
2. Create a user with email and password.
3. Use that email and password at `/admin/login`.

The included RLS policies allow any authenticated Supabase user to manage projects. For production, add an admin role or profile check.

## Test Admin Login

1. Start the app with `npm run dev`.
2. Open `/admin/login`.
3. Enter the Supabase Auth user email and password.
4. You should be redirected to `/admin/dashboard`.
5. Add a test project as a draft first, then publish it when ready.

## Editable Website Content

The public website uses Supabase content when it exists. If Supabase content is missing, the app falls back to safe defaults in `src/data/siteContent.js`.

Admin CMS routes:

- `/admin/settings` edits the logo, hero/profile image, brand name, personal name, social links, email, and footer text
- `/admin/content` shows all editable page content areas
- `/admin/content/home` edits Home page copy
- `/admin/content/about` edits About page copy, skills, and tools
- `/admin/content/services` edits service groups, descriptions, icon names, and items
- `/admin/content/contact` edits Contact page copy and notes

Logo and hero image uploads use the existing `project-media` bucket. Create the bucket and run both SQL files before testing uploads.

For service icons, use lucide icon names such as `Camera`, `Sparkles`, `Code2`, or `Wrench`. If a name is not supported, the public page falls back to a simple icon.

## Visual CMS Update

Run this additional SQL file after the base schema and CMS update:

```text
supabase/visual_cms_update.sql
```

This adds controlled text color fields, default background image settings, and a `media_assets` table for reusable uploaded icons.

## Advanced Content Editor

Page content editors use two editing modes:

- Structured form fields for normal editing
- A desktop JSON editor with syntax highlighting for advanced changes

The JSON editor validates before saving. If JSON is invalid, the admin sees an error and the content is not saved.

## Icons / Media

Open `/admin/media/icons` to upload SVG, PNG, or WebP icons. Uploaded icons are stored in the `project-media` bucket under `icons/`.

After uploading an icon:

1. Copy its URL.
2. Open `/admin/content/services`.
3. Add the URL to a service group as `customIconUrl`.
4. Save the Services page content.

If `customIconUrl` exists, the public Services page uses it. Otherwise it uses the lucide `iconName`. If neither exists, the section stays text-only.

## Home Background Image

The Home page supports an editable hero background image from `/admin/content/home`.

Available fields include:

- `heroBackgroundImageUrl`
- `heroBackgroundOverlayOpacity`
- `heroBackgroundBlur`
- `heroBackgroundPosition`
- `heroBackgroundStyle`

If no background image exists, the app uses a calm dark gradient fallback.

## Text Color Controls

Global colors are edited in `/admin/settings`.

Page-specific colors are edited in the page content editor. Colors are saved as safe hex values such as `#f5f5f4` and applied only to controlled text areas with inline styles. Do not paste arbitrary CSS.

## Recommended Image Sizes

- Icons: under 500 KB
- Logos: under 1 MB
- Background images: under 2 MB
- Project images: under 1 MB each

## Add Future Projects

1. Log in at `/admin/login`.
2. Open the dashboard.
3. Click `Add project`.
4. Fill in project details.
5. Set status to `published` when ready.
6. Check `Featured project` if it should appear on the homepage.

Only published projects appear on the public website.

## Video Notes

Do not upload large videos directly into this app. Use YouTube, Vimeo, Google Drive, or another video hosting service, then paste the video URL into the project form.

## Test Mobile Responsiveness

Before publishing, test:

- Home, About, Services, Contact, Projects, and Project Details on a narrow mobile viewport
- `/admin/settings` and `/admin/content/*` forms on mobile
- Project search and category filters without horizontal scrolling
- Public pages with and without uploaded logo, hero image, and project images

## Deploy to Vercel

1. Push the project to GitHub.
2. Import the repository in Vercel.
3. Add these environment variables in Vercel:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy.

## Main Routes

Public:

- `/`
- `/about`
- `/projects`
- `/projects/:slug`
- `/services`
- `/contact`

Admin:

- `/admin/login`
- `/admin/dashboard`
- `/admin/projects`
- `/admin/projects/new`
- `/admin/projects/:id/edit`
