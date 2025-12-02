# Polymarket Trading Bot - Frontend

React + Vite frontend for viewing price history data.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start development server:
```bash
npm run dev
```

The app will be available at `http://localhost:5173`

## Features

- **Slug Selector**: Dropdown to select from all available market slugs in the database
- **Price Chart**: Interactive line chart showing UP and DOWN token prices over time
- **Real-time Data**: Fetches price history from the backend API

## API Endpoints Used

- `GET /api/slugs` - Get all available slugs
- `GET /api/price-history/:slug` - Get price history for a specific slug

## Build for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

