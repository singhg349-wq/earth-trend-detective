#!/usr/bin/env python3
"""
Bounded Planetary Computer STAC metadata proof script.

Tests STAC metadata availability for:
- Sharp imagery: Sentinel-2 L2A, Landsat 8/9 C2 L2
- Longer NDVI history: MODIS MCD43A4 (daily surface reflectance) or MOD13Q1 (16-day NDVI)

Locations:
- Coastal Peru: -79, -8 (bbox approx -82, -10, -76, -3)
- Indonesia: 115, -2 (bbox approx 95, -11, 141, 6)
- Edmonton: -113.5, 53.5 (bbox approx -114, 53, -113, 54)

Queries only metadata - no downloads. All requests have timeouts.
"""

import sys
import json
import time
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Any
from urllib.parse import urljoin

import requests

# Timeouts
CONNECT_TIMEOUT = 10  # seconds
READ_TIMEOUT = 30     # seconds
TOTAL_TIMEOUT = 60    # seconds per request

# Planetary Computer STAC API
STAC_API_ROOT = "https://planetarycomputer.microsoft.com/api/stac/v1/"

# Target collections
COLLECTIONS = {
    "sharp_imagery": [
        "sentinel-2-l2a",      # Sentinel-2 Level-2A (10m, 5-day revisit)
        "landsat-c2-l2",       # Landsat 8/9 Collection 2 Level-2 (30m, 16-day)
    ],
    "ndvi_longer_history": [
        "modis-13Q1-061",      # MODIS Terra 16-day NDVI (250m, 2000-present)
        "modis-13A1-061",      # MODIS Aqua 16-day NDVI (250m, 2002-present)
        "modis-13Q1-061",      # Combined Terra+Aqua 8-day equivalent
    ],
}

# Test locations with bounding boxes (min_lon, min_lat, max_lon, max_lat)
LOCATIONS = {
    "coastal_peru": {
        "label": "Coastal Peru",
        "bbox": [-82, -10, -76, -3],
        "point": [-79, -8],
    },
    "indonesia": {
        "label": "Indonesia",
        "bbox": [95, -11, 141, 6],
        "point": [115, -2],
    },
    "edmonton": {
        "label": "Edmonton",
        "bbox": [-114, 53, -113, 54],
        "point": [-113.5, 53.5],
    },
}

# Date ranges to test
DATE_RANGES = {
    "recent_annual": "2023-01-01/2023-12-31",
    "seasonal_djf": "2023-12-01/2024-02-28",
    "longer_history": "2010-01-01/2023-12-31",
}

def make_request(url: str, params: Optional[Dict] = None) -> Optional[requests.Response]:
    """Make HTTP request with timeout and error handling."""
    try:
        response = requests.get(
            url,
            params=params,
            timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
            headers={"User-Agent": "EarthTrendDetective/1.0 (planetary-computer-proof)"}
        )
        response.raise_for_status()
        return response
    except requests.exceptions.Timeout:
        print(f"  [TIMEOUT] {url}")
        return None
    except requests.exceptions.RequestException as e:
        print(f"  [ERROR] {url}: {e}")
        return None

def search_collections() -> Dict[str, Any]:
    """Get available collections from STAC API."""
    url = urljoin(STAC_API_ROOT, "collections")
    response = make_request(url)
    if response:
        return response.json()
    return {"collections": []}

def search_items(
    collection: str,
    bbox: List[float],
    datetime_range: str,
    limit: int = 10
) -> Optional[Dict[str, Any]]:
    """Search STAC items for a collection."""
    url = urljoin(STAC_API_ROOT, "search")
    payload = {
        "collections": [collection],
        "bbox": bbox,
        "datetime": datetime_range,
        "limit": limit,
    }
    response = requests.post(
        url,
        json=payload,
        timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
        headers={"User-Agent": "EarthTrendDetective/1.0 (planetary-computer-proof)"}
    )
    try:
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"  [ERROR] Search {collection}: {e}")
        return None

def analyze_items(items: List[Dict], collection: str) -> Dict[str, Any]:
    """Analyze STAC items for metadata quality."""
    if not items:
        return {
            "collection": collection,
            "item_count": 0,
            "has_items": False,
            "assets_available": [],
            "date_range": None,
            "resolution_m": None,
            "quality_props": [],
            "errors": []
        }

    # Extract common properties
    first = items[0]
    assets = list(first.get("assets", {}).keys())
    
    # Get resolution from properties or collection knowledge
    resolution_map = {
        "sentinel-2-l2a": 10,
        "landsat-c2-l2": 30,
        "modis-13Q1-061": 250,
        "modis-13A1-061": 250,
    }
    
    # Quality-related properties to check
    quality_props = []
    for prop in ["cloud_cover", "eo:cloud_cover", "s2:cloud_cover", "landsat:cloud_cover"]:
        if prop in first.get("properties", {}):
            quality_props.append(prop)
    
    # Date range
    dates = []
    for item in items:
        dt = item.get("properties", {}).get("datetime")
        if dt:
            dates.append(dt)
    dates.sort()
    
    return {
        "collection": collection,
        "item_count": len(items),
        "has_items": True,
        "assets_available": assets,
        "date_range": {"earliest": dates[0] if dates else None, "latest": dates[-1] if dates else None},
        "resolution_m": resolution_map.get(collection),
        "quality_props": quality_props,
        "sample_item_id": first.get("id"),
        "sample_geometry": first.get("geometry"),
    }

def test_location(location_key: str, location: Dict) -> Dict[str, Any]:
    """Test all collections for a location."""
    print(f"\n=== Testing {location['label']} ({location_key}) ===")
    print(f"  BBox: {location['bbox']}")
    
    results = {
        "location": location_key,
        "label": location["label"],
        "bbox": location["bbox"],
        "sharp_imagery": {},
        "ndvi_longer_history": {},
        "summary": {}
    }
    
    # Test sharp imagery collections
    for collection in COLLECTIONS["sharp_imagery"]:
        print(f"\n  Sharp imagery: {collection}")
        for date_key, date_range in DATE_RANGES.items():
            print(f"    Date range: {date_key} ({date_range})")
            search_result = search_items(collection, location["bbox"], date_range, limit=5)
            if search_result:
                analysis = analyze_items(search_result.get("features", []), collection)
                key = f"{collection}_{date_key}"
                results["sharp_imagery"][key] = analysis
                if analysis["has_items"]:
                    print(f"      Found {analysis['item_count']} items")
                    print(f"      Assets: {analysis['assets_available']}")
                    print(f"      Date range: {analysis['date_range']}")
                    print(f"      Resolution: {analysis['resolution_m']}m")
                    print(f"      Quality props: {analysis['quality_props']}")
                else:
                    print(f"      No items found")
            else:
                results["sharp_imagery"][f"{collection}_{date_key}"] = {
                    "collection": collection,
                    "error": "Search failed"
                }
    
    # Test NDVI longer history collections
    for collection in COLLECTIONS["ndvi_longer_history"]:
        print(f"\n  NDVI history: {collection}")
        for date_key, date_range in DATE_RANGES.items():
            print(f"    Date range: {date_key} ({date_range})")
            search_result = search_items(collection, location["bbox"], date_range, limit=5)
            if search_result:
                analysis = analyze_items(search_result.get("features", []), collection)
                key = f"{collection}_{date_key}"
                results["ndvi_longer_history"][key] = analysis
                if analysis["has_items"]:
                    print(f"      Found {analysis['item_count']} items")
                    print(f"      Assets: {analysis['assets_available']}")
                    print(f"      Date range: {analysis['date_range']}")
                    print(f"      Resolution: {analysis['resolution_m']}m")
                    print(f"      Quality props: {analysis['quality_props']}")
                else:
                    print(f"      No items found")
            else:
                results["ndvi_longer_history"][f"{collection}_{date_key}"] = {
                    "collection": collection,
                    "error": "Search failed"
                }
    
    # Summary
    sharp_ok = any(v.get("has_items") for v in results["sharp_imagery"].values())
    ndvi_ok = any(v.get("has_items") for v in results["ndvi_longer_history"].values())
    
    results["summary"] = {
        "sharp_imagery_available": sharp_ok,
        "ndvi_longer_history_available": ndvi_ok,
        "tested_at": datetime.now(timezone.utc).isoformat(),
    }
    
    return results

def main():
    print("=" * 60)
    print("Planetary Computer STAC Metadata Proof")
    print("=" * 60)
    print(f"STAC API: {STAC_API_ROOT}")
    print(f"Timeouts: connect={CONNECT_TIMEOUT}s, read={READ_TIMEOUT}s")
    
    # First, check available collections
    print("\n--- Checking available collections ---")
    collections = search_collections()
    available = {c["id"] for c in collections.get("collections", [])}
    print(f"Available collections: {len(available)}")
    
    # Verify our target collections exist
    for cat, cols in COLLECTIONS.items():
        for col in cols:
            status = "AVAILABLE" if col in available else "NOT FOUND"
            print(f"  {col}: {status}")
    
    # Test each location
    all_results = {}
    for loc_key, loc in LOCATIONS.items():
        try:
            all_results[loc_key] = test_location(loc_key, loc)
        except Exception as e:
            print(f"  [FATAL ERROR] {loc_key}: {e}")
            all_results[loc_key] = {
                "location": loc_key,
                "label": loc["label"],
                "error": str(e),
                "summary": {
                    "sharp_imagery_available": False,
                    "ndvi_longer_history_available": False,
                    "tested_at": datetime.now(timezone.utc).isoformat(),
                }
            }
    
    # Print summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    
    for loc_key, result in all_results.items():
        summary = result.get("summary", {})
        print(f"\n{result.get('label', loc_key)}:")
        print(f"  Sharp imagery (Sentinel-2/Landsat): {'YES' if summary.get('sharp_imagery_available') else 'NO'}")
        print(f"  Longer NDVI history (MODIS): {'YES' if summary.get('ndvi_longer_history_available') else 'NO'}")
    
    # Save detailed results
    output = {
        "test_metadata": {
            "stac_api": STAC_API_ROOT,
            "timeouts": {"connect": CONNECT_TIMEOUT, "read": READ_TIMEOUT},
            "collections_tested": COLLECTIONS,
            "locations_tested": LOCATIONS,
            "date_ranges_tested": DATE_RANGES,
            "run_at": datetime.now(timezone.utc).isoformat(),
        },
        "results": all_results,
    }
    
    output_path = "docs/reviews/PLANETARY_COMPUTER_PROOF.json"
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)
    print(f"\nDetailed results saved to: {output_path}")
    
    # Return exit code based on results
    any_sharp = any(r.get("summary", {}).get("sharp_imagery_available") for r in all_results.values())
    any_ndvi = any(r.get("summary", {}).get("ndvi_longer_history_available") for r in all_results.values())
    
    if any_sharp and any_ndvi:
        print("\n✓ Both sharp imagery and NDVI history available at some locations")
        return 0
    elif any_sharp or any_ndvi:
        print("\n⚠ Partial availability - check details")
        return 0
    else:
        print("\n✗ No data available at tested locations")
        return 1

if __name__ == "__main__":
    sys.exit(main())