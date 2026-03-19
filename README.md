# Stellar Habits

A minimal, premium habit tracker with glassmorphism design, data synchronization via Supabase, and PWA support.

![Stellar Habits](https://cdn-icons-png.flaticon.com/512/3248/3248443.png)

## Features

- **Lock Screen**: Secure access with code "1116".
- **Habit Management**: Add, edit, and delete habits.
- **Daily Check**: Mark habits as done for today.
- **Streak System**: Track consecutive days. Resets if a day is missed.
- **Calendar View**: View progress and backfill/edit past days.
- **Responsive Design**: Optimized for mobile and desktop.
- **PWA Ready**: Installable on home screen.

## Setup & Synchronization

To enable data synchronization across devices, follow these steps:

1. Create a project at [Supabase](https://supabase.com/).
2. Create a table named `habits` with the following schema:
   - `id`: text (Primary Key)
   - `name`: text
   - `goal`: text
   - `completedDates`: text[] (array of strings)
   - `createdAt`: timestamptz
   - `user_id`: text (default: 'default_user')
3. Get your **Project URL** and **Anon Key** from the Supabase API settings.
4. Replace the placeholders in `app.js`:
   ```javascript
   const SUPABASE_URL = 'YOUR_SUPABASE_URL';
   const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY';
   ```

## Development

The app uses vanilla HTML, CSS, and JavaScript. No build step is required.
You can run it locally using any static file server:
```bash
npx serve .
```

## Security

- Default Access Code: `1116`
