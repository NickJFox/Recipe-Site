# Recipe Keeper Mobile App

This project has been converted from a static recipe website into a React Native mobile app using Expo.

## Features

- Store recipes locally on device
- Categorize recipes by meal type
- Manually enter recipes with ingredients, instructions, tags, servings, and prep time
- Create import drafts from normal recipe links or social video links such as Instagram, TikTok, and YouTube
- Turn selected recipes into one combined grocery list

## Current import behavior

This app supports saving a link or social post as an import draft and then finishing the recipe manually inside the app.

It does not scrape recipe websites, Instagram, TikTok, or YouTube directly. That would require an external backend or approved third-party integrations because those platforms do not expose a simple local-only import flow inside React Native.

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Start Expo:

```bash
npm start
```

3. Open the app in:

- iOS Simulator
- Android Emulator
- Expo Go

## Main files

- `App.tsx` contains the primary app shell and screens
- `src/types.ts` defines app models
- `src/storage.ts` handles AsyncStorage persistence
- `src/utils.ts` contains import and grocery-list helpers

## Next logical upgrade

If you want real recipe extraction from URLs or social posts, the next step is adding:

- a backend service for parsing recipe pages
- approved API integrations for supported social platforms
- authentication and cloud sync
