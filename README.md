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
