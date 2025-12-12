# AWS Location Delivery Route Optimization

A minimal delivery route optimization application built with AWS Location Service.

![Screenshot](screenshot.webp)

## Features

- 🗺️ Interactive map interface
- 🚛 Multiple vehicle types (Truck, Car, Scooter, Pedestrian)
- 📍 Click-to-set depot and delivery points
- ⌨️ Manual coordinate input support
- 🔄 Two optimization algorithms:
  - Nearest Neighbor Algorithm
  - AWS Official Optimization (OptimizeWaypoints API)
- ⏱️ Real-time route segment timing
- 📊 Optimization results with statistics
- 🌐 Bilingual support (English/Chinese)

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy the environment template:
```bash
cp .env.example .env
```

Edit `.env` file and add your AWS Location Service API Key:
```bash
VITE_AWS_API_KEYS=your-aws-location-api-key-here
```

Optionally, customize the map center location (default: New York, USA):
```bash
VITE_MAP_CENTER_LONGITUDE=-74.006
VITE_MAP_CENTER_LATITUDE=40.7128
VITE_MAP_INITIAL_ZOOM=12
```

### 3. Start Development Server

```bash
npm run dev
```

Visit http://localhost:3000

## Usage

1. **Select Vehicle Type** - Choose from 🚛 🚗 🛵 🚶 vehicle icons
2. **Set Depot** - Click "Set Depot" button, then click on map
3. **Add Delivery Points** - Use either:
   - 📍 Map clicking (continuous mode)
   - ⌨️ Manual coordinate input (batch mode)
4. **Optimize Route** - Choose optimization algorithm:
   - **Nearest Neighbor** - Custom implementation
   - **AWS Optimization** - Official OptimizeWaypoints API
5. **View Results** - Route displayed on map with time markers

## Manual Coordinate Input

Format: `longitude, latitude` (one per line)

Example:
```
44.3661, 33.3152
44.3700, 33.3200
44.3800, 33.3300
```

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **Build Tool**: Vite
- **Map**: MapLibre GL JS
- **AWS SDK**: Geo Routes Client
- **Authentication**: AWS Location Utilities Auth Helper

## Project Structure

```
src/
├── App.tsx          # Main application (all-in-one component)
├── main.tsx         # React entry point
└── index.css        # Styles
```

## AWS Location Service Setup

Ensure your AWS Location Service is configured:

1. Create an API Key in AWS Console
2. Set appropriate permissions
3. Ensure API Key has access to Routes API

## Build for Production

```bash
npm run build
```

Build artifacts will be in the `dist/` directory.

## Language Support

- **Default**: English interface
- **Switch**: Click 🇺🇸/🇨🇳 flag icon in top-right corner
- **Supported**: English, Chinese (Simplified)

## License

MIT License - see original project for details.

## Related

- [中文文档](README.zh.md)
- [AWS Location Service Documentation](https://docs.aws.amazon.com/location/)
- [MapLibre GL JS](https://maplibre.org/)
