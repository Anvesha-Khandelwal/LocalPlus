"""
AI Demand Oracle — Hybrid Prophet + XGBoost forecasting service.

Pipeline:
  1. Pull 90 days of historical sales from DB for a product
  2. Fetch weather forecast from OpenWeatherMap
  3. Load local festival/event calendar
  4. Engineer features (lags, rolling avg, event flags, weather)
  5. Fit Prophet for trend + seasonality
  6. Fit XGBoost on Prophet residuals + external features
  7. Predict next N days, attach confidence + signal explanations
"""

import os
import httpx
import numpy as np
import pandas as pd
from datetime import date, timedelta
from typing import List, Dict, Optional

# Lazy-import heavy ML libs so startup stays fast
# from prophet import Prophet
# import xgboost as xgb


# ── Festival / Event Calendar ─────────────────────────────
# In production: load from a DB table or remote JSON.
# Keys are ISO date strings; values are lists of active event names.

FESTIVAL_CALENDAR: Dict[str, List[str]] = {
    # Populate with actual dates for the current year
    "2025-10-02": ["Gandhi Jayanti"],
    "2025-10-12": ["Navratri start"],
    "2025-10-20": ["Dussehra"],
    "2025-11-01": ["Kannada Rajyotsava"],
    "2025-11-12": ["Diwali"],
    "2025-11-13": ["Diwali"],
    "2025-11-14": ["Diwali"],
    "2025-12-25": ["Christmas"],
    "2026-01-01": ["New Year"],
    "2026-01-14": ["Sankranti / Pongal"],
    "2026-03-14": ["Holi"],
}

# IPL match days — stub; replace with live fixture API
IPL_DAYS = {"2025-04-05", "2025-04-06", "2025-04-10"}


# ── Weather fetch ─────────────────────────────────────────

async def fetch_weather_forecast(city: str, days: int = 7) -> List[Dict]:
    """
    Returns list of {date, temp_max, rain_mm} dicts.
    Falls back to neutral values if API key is missing.
    """
    api_key = os.getenv("OPENWEATHER_API_KEY", "")
    if not api_key:
        # Return neutral placeholder when no key configured
        today = date.today()
        return [
            {"date": str(today + timedelta(days=i)), "temp_max": 28.0, "rain_mm": 0.0}
            for i in range(days)
        ]
    url = (
        f"https://api.openweathermap.org/data/2.5/forecast/daily"
        f"?q={city}&cnt={days}&appid={api_key}&units=metric"
    )
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(url)
            r.raise_for_status()
            data = r.json()
            result = []
            for item in data.get("list", [])[:days]:
                result.append({
                    "date":     str(date.fromtimestamp(item["dt"])),
                    "temp_max": item["temp"]["max"],
                    "rain_mm":  item.get("rain", 0.0),
                })
            return result
    except Exception:
        today = date.today()
        return [
            {"date": str(today + timedelta(days=i)), "temp_max": 28.0, "rain_mm": 0.0}
            for i in range(days)
        ]


# ── Feature engineering ───────────────────────────────────

def build_features(
    history: pd.DataFrame,
    forecast_dates: List[str],
    weather: List[Dict],
) -> pd.DataFrame:
    """
    history: DataFrame with columns [ds, y] (date, quantity sold)
    Returns a feature DataFrame for forecast_dates.
    """
    weather_map = {w["date"]: w for w in weather}
    rows = []
    for d_str in forecast_dates:
        d = pd.Timestamp(d_str)
        w = weather_map.get(d_str, {"temp_max": 28.0, "rain_mm": 0.0})

        # Calendar features
        dow        = d.dayofweek                    # 0=Mon … 6=Sun
        is_weekend = int(dow >= 5)
        is_ipl     = int(d_str in IPL_DAYS)
        festivals  = FESTIVAL_CALENDAR.get(d_str, [])
        is_festival= int(len(festivals) > 0)

        # Rolling stats from history (last 7 days available)
        recent = history[history["ds"] < d].tail(7)["y"]
        rolling_avg = float(recent.mean()) if len(recent) else 10.0
        lag_7       = float(history[history["ds"] == d - timedelta(days=7)]["y"].values[0]) \
                      if not history[history["ds"] == d - timedelta(days=7)].empty else rolling_avg

        # Signals triggered (human-readable for UI)
        signals = []
        if is_weekend:   signals.append("Weekend traffic")
        if is_ipl:       signals.append("IPL match day")
        if is_festival:  signals.extend(festivals)
        if w["rain_mm"] > 5: signals.append("Heavy rain forecast")
        if w["temp_max"] > 34: signals.append("Hot weather")

        rows.append({
            "date":        d_str,
            "dow":         dow,
            "is_weekend":  is_weekend,
            "is_ipl":      is_ipl,
            "is_festival": is_festival,
            "temp_max":    w["temp_max"],
            "rain_mm":     w["rain_mm"],
            "rolling_avg": rolling_avg,
            "lag_7":       lag_7,
            "signals":     signals,
        })
    return pd.DataFrame(rows)


# ── Main forecast function ────────────────────────────────

async def run_demand_oracle(
    history: List[Dict],          # [{"date": "2025-01-01", "qty": 12.0}, …]
    product_name: str,
    unit: str,
    city: str = "Bengaluru",
    days: int = 7,
) -> List[Dict]:
    """
    Returns list of day-level forecasts with predicted quantity,
    confidence %, and human-readable signals.
    """
    DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    # Build history DataFrame
    df = pd.DataFrame(history)
    df.columns = ["ds", "y"]
    df["ds"] = pd.to_datetime(df["ds"])
    df = df.sort_values("ds").reset_index(drop=True)

    # Forecast target dates
    today = date.today()
    forecast_dates = [str(today + timedelta(days=i + 1)) for i in range(days)]

    # Fetch weather
    weather = await fetch_weather_forecast(city, days)

    # Build feature matrix
    features = build_features(df, forecast_dates, weather)

    # ── Prediction (simplified rule-based when ML libs not available) ──
    # In production: replace this block with Prophet + XGBoost pipeline.
    # See the comment block below for the full ML version.
    results = []
    baseline = float(df["y"].mean()) if len(df) else 10.0

    for _, row in features.iterrows():
        multiplier = 1.0
        if row["is_weekend"]:   multiplier *= 1.3
        if row["is_ipl"]:       multiplier *= 1.6
        if row["is_festival"]:  multiplier *= 1.8
        if row["rain_mm"] > 5:  multiplier *= 0.7
        if row["temp_max"] > 34: multiplier *= 1.2

        predicted  = round(baseline * multiplier, 1)
        confidence = min(95, 60 + len(df) * 0.5)  # grows with more data

        d = pd.Timestamp(row["date"])
        results.append({
            "date":       row["date"],
            "day":        DAY_NAMES[d.dayofweek],
            "predicted":  predicted,
            "confidence": round(confidence, 1),
            "signals":    row["signals"],
        })

    # Build alert
    max_day   = max(results, key=lambda x: x["predicted"])
    avg_pred  = np.mean([r["predicted"] for r in results])
    alert     = None
    reorder_by = None
    if max_day["predicted"] > baseline * 1.3:
        pct = round((max_day["predicted"] / baseline - 1) * 100)
        alert     = f"High demand on {max_day['day']} — stock up {pct}% extra"
        reorder_by = max_day["date"]

    return results, alert, reorder_by


"""
── Full Prophet + XGBoost ML version (production) ──────────

from prophet import Prophet
import xgboost as xgb

def prophet_xgb_forecast(df, features):
    # Step 1: Prophet for trend + weekly + yearly seasonality
    m = Prophet(
        weekly_seasonality=True,
        yearly_seasonality=True,
        daily_seasonality=False,
        uncertainty_samples=500,
    )
    # Add Indian festival regressors
    m.add_regressor("is_festival")
    m.add_regressor("is_ipl")
    m.add_regressor("temp_max")
    m.add_regressor("rain_mm")

    train = df.copy()
    for col in ["is_festival", "is_ipl", "temp_max", "rain_mm"]:
        train[col] = 0  # placeholder; join features in prod

    m.fit(train)
    future = m.make_future_dataframe(periods=7)
    forecast = m.predict(future)

    # Step 2: XGBoost on residuals
    residuals = df["y"].values - forecast["yhat"].values[:len(df)]
    feature_cols = ["dow","is_weekend","is_ipl","is_festival","temp_max","rain_mm","rolling_avg","lag_7"]
    X_train = features[feature_cols].values[:len(df)]
    xgb_model = xgb.XGBRegressor(n_estimators=100, max_depth=4, learning_rate=0.1)
    xgb_model.fit(X_train, residuals)

    X_forecast = features[feature_cols].values
    xgb_adj = xgb_model.predict(X_forecast)

    prophet_preds = forecast["yhat"].values[-7:]
    final_preds   = np.clip(prophet_preds + xgb_adj, 0, None)
    return final_preds
"""