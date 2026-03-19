# Stellar Habits v2.0

A minimal, premium habit and attendance tracker with glassmorphism design, multi-device synchronization via Supabase, and PWA support.

## New Features

- **Sidebar Navigation**: Easily switch between "Habits" and "Attendance" modules.
- **Attendance Tracker**: Track daily attendance for Math, Physics, and Chemistry.
- **Live Stats**: Real-time percentage calculations and subject summaries.
- **Robust Sync**: Data automatically syncs across PC and Mobile via Supabase.
- **Vercel Ready**: Direct deployment support (no build step needed).

## Setup & Synchronization

To enable data synchronization, follow these steps:

1. Create a project at [Supabase](https://supabase.com/).
2. Create the `habits` table:
   - `id`: text (Primary Key)
   - `name`: text
   - `goal`: text
   - `completedDates`: text[]
   - `createdAt`: timestamptz
   - `user_id`: text (default: 'default_user')
3. Create the `attendance` table:
   - `id`: text (Primary Key)
   - `date`: date
   - `subject`: text
   - `classHappened`: boolean
   - `attended`: boolean
   - `createdAt`: timestamptz
   - `user_id`: text (default: 'default_user')
4. Get your **Project URL** and **Anon Key** from settings and replace them in `app.js`.

## Usage

- **Access Code**: `1116`
- **Attendance**: Check "Class" if a session occurred, and "Attended" if you were present. Click "Save Day" to update your stats.

## Development

Run locally:
```bash
npx serve .
```

Deployment:
Push to GitHub and connect to Vercel. Ensure the "Output Directory" is set to `.` (root).
