"""
ml/customer_segmentation.py
RFM (Recency, Frequency, Monetary) customer segmentation using K-Means clustering.

Usage:
    from ml.customer_segmentation import segment_customers
    segments_df = segment_customers(customers_df)

Input: customers_df with columns ['customer_id', 'recency_days', 'frequency', 'monetary']
Output: DataFrame with added 'segment' column: champion | loyal | at_risk | lost
"""
import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans


def segment_customers(customers_df: pd.DataFrame, n_clusters: int = 4) -> pd.DataFrame:
    """
    Segments customers using K-Means on normalized RFM scores.

    Args:
        customers_df: DataFrame with columns:
            - customer_id
            - recency_days  (days since last purchase — lower is better)
            - frequency     (number of purchases — higher is better)
            - monetary      (total spend — higher is better)
        n_clusters: number of segments (default 4)

    Returns:
        Same DataFrame with an added 'segment' column.

    Algorithm:
        1. Normalize RFM values (StandardScaler) so they're comparable.
        2. Run K-Means with n_clusters=4.
        3. For each cluster, compute mean recency/frequency/monetary.
        4. Rank clusters and assign human-readable labels:
           - Best (low recency, high freq, high monetary)  -> "champion"
           - Good engagement                                -> "loyal"
           - Declining engagement                           -> "at_risk"
           - Worst (high recency, low freq/monetary)        -> "lost"
    """
    if len(customers_df) < n_clusters:
        # Not enough customers to cluster meaningfully — use simple rules
        return _rule_based_segmentation(customers_df)

    df = customers_df.copy()

    # Recency: lower is better, so invert it for scoring (higher = more recent = better)
    features = df[["recency_days", "frequency", "monetary"]].copy()
    features["recency_inv"] = -features["recency_days"]  # invert so higher = better
    feature_cols = ["recency_inv", "frequency", "monetary"]

    scaler = StandardScaler()
    scaled = scaler.fit_transform(features[feature_cols])

    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    df["cluster"] = kmeans.fit_predict(scaled)

    # Score each cluster by its centroid (sum of scaled features — higher = better customer)
    cluster_scores = (
        pd.DataFrame(kmeans.cluster_centers_, columns=feature_cols)
        .sum(axis=1)
        .sort_values(ascending=False)
    )

    # Map cluster IDs to labels based on rank
    rank_to_label = {0: "champion", 1: "loyal", 2: "at_risk", 3: "lost"}
    cluster_to_label = {cluster_id: rank_to_label[rank] for rank, cluster_id in enumerate(cluster_scores.index)}

    df["segment"] = df["cluster"].map(cluster_to_label)
    return df.drop(columns=["cluster"])


def _rule_based_segmentation(df: pd.DataFrame) -> pd.DataFrame:
    """
    Fallback for small customer bases (< n_clusters customers).
    Simple threshold rules instead of clustering.
    """
    df = df.copy()

    def label(row):
        if row["recency_days"] <= 30 and row["frequency"] >= 5 and row["monetary"] >= 2000:
            return "champion"
        elif row["recency_days"] <= 60 and row["frequency"] >= 3:
            return "loyal"
        elif row["recency_days"] <= 90:
            return "at_risk"
        else:
            return "lost"

    df["segment"] = df.apply(label, axis=1)
    return df


def segment_summary(segmented_df: pd.DataFrame) -> dict:
    """Returns count and average monetary value per segment — for marketing dashboard."""
    summary = {}
    for segment in ["champion", "loyal", "at_risk", "lost"]:
        seg_df = segmented_df[segmented_df["segment"] == segment]
        summary[segment] = {
            "count": len(seg_df),
            "avg_monetary": round(seg_df["monetary"].mean(), 2) if len(seg_df) > 0 else 0,
            "total_monetary": round(seg_df["monetary"].sum(), 2) if len(seg_df) > 0 else 0,
        }
    return summary


if __name__ == "__main__":
    # Example with synthetic data
    np.random.seed(42)
    n = 50
    sample = pd.DataFrame({
        "customer_id": [f"cust_{i}" for i in range(n)],
        "recency_days": np.random.randint(1, 180, n),
        "frequency": np.random.randint(1, 20, n),
        "monetary": np.random.randint(100, 10000, n),
    })

    result = segment_customers(sample)
    print(result.groupby("segment").size())
    print(segment_summary(result))
