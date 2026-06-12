"""
ml/demand_forecast.py
Standalone demand forecasting using Facebook Prophet with Indian festival calendar.

Usage (called from Celery task or manually):
    from ml.demand_forecast import train_forecast
    forecast_df = train_forecast(product_id, sales_history_df)

Input: sales_history_df — DataFrame with columns ['date', 'quantity']
Output: DataFrame with ['ds', 'yhat', 'yhat_lower', 'yhat_upper'] for next 30 days
"""
import pandas as pd
from prophet import Prophet
from datetime import datetime


# Major Indian festivals — demand for groceries/gifts spikes around these dates.
# In production, generate this dynamically per year (festivals shift on lunar calendar).
INDIAN_HOLIDAYS = pd.DataFrame({
    "holiday": "festival",
    "ds": pd.to_datetime([
        "2025-10-20",  # Diwali
        "2025-10-21",
        "2025-03-14",  # Holi
        "2025-08-15",  # Independence Day
        "2025-01-26",  # Republic Day
        "2025-04-30",  # Eid (approx)
        "2025-11-05",  # Bhai Dooj
    ]),
    "lower_window": -2,   # demand starts rising 2 days before
    "upper_window": 1,    # and continues 1 day after
})


def train_forecast(product_id: str, sales_df: pd.DataFrame, periods: int = 30) -> pd.DataFrame:
    """
    Trains a Prophet model on daily sales quantity and returns a 30-day forecast.

    Args:
        product_id: UUID string, used for logging/model naming
        sales_df: DataFrame with columns 'date' (datetime) and 'quantity' (int)
        periods: number of days to forecast ahead

    Returns:
        DataFrame with columns: ds, yhat, yhat_lower, yhat_upper
        yhat = predicted units, yhat_lower/upper = 80% confidence interval
    """
    # Prophet requires columns named 'ds' (date) and 'y' (value)
    df = sales_df.rename(columns={"date": "ds", "quantity": "y"}).copy()
    df["ds"] = pd.to_datetime(df["ds"])

    # Need at least 14 days of data for a meaningful forecast
    if len(df) < 14:
        # Fallback: flat forecast based on simple average
        avg = df["y"].mean() if len(df) > 0 else 0
        future_dates = pd.date_range(start=datetime.now(), periods=periods, freq="D")
        return pd.DataFrame({
            "ds": future_dates,
            "yhat": [avg] * periods,
            "yhat_lower": [max(0, avg * 0.7)] * periods,
            "yhat_upper": [avg * 1.3] * periods,
        })

    model = Prophet(
        yearly_seasonality=False,   # not enough data for yearly patterns yet
        weekly_seasonality=True,    # captures day-of-week patterns (weekends busier)
        daily_seasonality=False,
        holidays=INDIAN_HOLIDAYS,
        interval_width=0.8,         # 80% confidence interval
        changepoint_prior_scale=0.05,  # conservative — avoid overfitting to noise
    )
    model.fit(df)

    future = model.make_future_dataframe(periods=periods)
    forecast = model.predict(future)

    # Return only future predictions, clip negative values to 0
    result = forecast[forecast["ds"] > df["ds"].max()][["ds", "yhat", "yhat_lower", "yhat_upper"]].copy()
    for col in ["yhat", "yhat_lower", "yhat_upper"]:
        result[col] = result[col].clip(lower=0)

    return result


def calculate_reorder_point(forecast_df: pd.DataFrame, lead_time_days: int, current_stock: int) -> dict:
    """
    Given a forecast and supplier lead time, calculates whether reorder is needed
    and how much to order.

    Logic:
        - Predicted demand during lead time = sum of yhat for next `lead_time_days`
        - Safety stock = 50% of lead-time demand (buffer for variability)
        - Reorder if current_stock < (lead_time_demand + safety_stock)
        - Order quantity = enough to cover next 30 days minus current stock
    """
    lead_time_demand = forecast_df["yhat"].head(lead_time_days).sum()
    safety_stock = lead_time_demand * 0.5
    reorder_threshold = lead_time_demand + safety_stock

    needs_reorder = current_stock < reorder_threshold
    monthly_demand = forecast_df["yhat"].sum()
    suggested_order_qty = max(0, round(monthly_demand - current_stock))

    return {
        "needs_reorder": needs_reorder,
        "current_stock": current_stock,
        "lead_time_demand": round(lead_time_demand, 1),
        "reorder_threshold": round(reorder_threshold, 1),
        "suggested_order_qty": suggested_order_qty,
        "predicted_30d_demand": round(monthly_demand, 1),
    }


if __name__ == "__main__":
    # Example usage with synthetic data
    import numpy as np
    dates = pd.date_range(end=datetime.now(), periods=60, freq="D")
    quantities = np.random.poisson(lam=10, size=60) + (np.arange(60) % 7 == 5) * 5  # weekend bump
    sample_df = pd.DataFrame({"date": dates, "quantity": quantities})

    forecast = train_forecast("sample-product", sample_df)
    print(forecast.head(10))

    reorder_info = calculate_reorder_point(forecast, lead_time_days=3, current_stock=15)
    print(reorder_info)
