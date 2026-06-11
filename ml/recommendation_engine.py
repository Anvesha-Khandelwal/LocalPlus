"""
ml/recommendation_engine.py
Cross-sell and product bundling recommendations using Apriori association rule mining.

Usage:
    from ml.recommendation_engine import find_associations, get_bundle_suggestions
    rules_df = find_associations(transactions)
    bundles = get_bundle_suggestions(rules_df, top_n=5)
"""
import pandas as pd
from mlxtend.frequent_patterns import apriori, association_rules
from mlxtend.preprocessing import TransactionEncoder


def find_associations(transactions: list[list[str]], min_support: float = 0.01, min_confidence: float = 0.3) -> pd.DataFrame:
    """
    Finds "frequently bought together" patterns using the Apriori algorithm.

    Args:
        transactions: list of transactions, each a list of product names
                       e.g. [["Bread", "Butter", "Milk"], ["Bread", "Jam"], ...]
        min_support: minimum frequency threshold (1% of transactions by default)
        min_confidence: minimum confidence for a rule to be considered reliable

    Returns:
        DataFrame of association rules with columns:
            antecedents, consequents, support, confidence, lift

        - support: how often this combination appears
        - confidence: P(consequent | antecedent) — "if they buy X, how often do they also buy Y"
        - lift: how much more likely Y is bought when X is bought, vs randomly
                (lift > 1 means positive association)
    """
    if len(transactions) < 10:
        return pd.DataFrame()  # not enough data for meaningful patterns

    te = TransactionEncoder()
    te_array = te.fit(transactions).transform(transactions)
    df = pd.DataFrame(te_array, columns=te.columns_)

    frequent_itemsets = apriori(df, min_support=min_support, use_colnames=True)
    if frequent_itemsets.empty:
        return pd.DataFrame()

    rules = association_rules(frequent_itemsets, metric="confidence", min_threshold=min_confidence)
    rules = rules[rules["lift"] > 1]  # only positive associations
    rules = rules.sort_values("lift", ascending=False)

    return rules[["antecedents", "consequents", "support", "confidence", "lift"]]


def get_bundle_suggestions(rules_df: pd.DataFrame, top_n: int = 5) -> list[dict]:
    """
    Converts association rules into human-readable bundle suggestions.

    Returns list of:
        {
            "products": ["Bread", "Butter"],
            "confidence_pct": 71.0,
            "message": "Customers who buy Bread also buy Butter 71% of the time."
        }
    """
    suggestions = []
    seen_pairs = set()

    for _, row in rules_df.head(top_n * 2).iterrows():
        antecedents = list(row["antecedents"])
        consequents = list(row["consequents"])

        # Only consider single-item -> single-item rules for clean suggestions
        if len(antecedents) != 1 or len(consequents) != 1:
            continue

        pair_key = tuple(sorted([antecedents[0], consequents[0]]))
        if pair_key in seen_pairs:
            continue
        seen_pairs.add(pair_key)

        suggestions.append({
            "products": [antecedents[0], consequents[0]],
            "confidence_pct": round(row["confidence"] * 100, 1),
            "lift": round(row["lift"], 2),
            "message": f"Customers who buy {antecedents[0]} also buy {consequents[0]} {row['confidence']*100:.0f}% of the time.",
        })

        if len(suggestions) >= top_n:
            break

    return suggestions


def get_upsell_suggestions(product_name: str, catalog: pd.DataFrame) -> list[dict]:
    """
    Suggests premium alternatives for a given product based on category + higher price.

    Args:
        product_name: the product the customer is currently viewing/buying
        catalog: DataFrame with columns ['name', 'category', 'selling_price']

    Returns:
        List of up to 3 products in the same category with higher selling_price,
        sorted by price ascending (smallest reasonable upgrade first).
    """
    current = catalog[catalog["name"] == product_name]
    if current.empty:
        return []

    category = current.iloc[0]["category"]
    current_price = current.iloc[0]["selling_price"]

    candidates = catalog[
        (catalog["category"] == category) &
        (catalog["name"] != product_name) &
        (catalog["selling_price"] > current_price) &
        (catalog["selling_price"] <= current_price * 2)  # don't suggest something 5x the price
    ].sort_values("selling_price")

    return [
        {"name": row["name"], "price": row["selling_price"], "price_diff": round(row["selling_price"] - current_price, 2)}
        for _, row in candidates.head(3).iterrows()
    ]


if __name__ == "__main__":
    # Example with synthetic transaction data
    sample_transactions = [
        ["Bread", "Butter", "Milk"],
        ["Bread", "Butter"],
        ["Bread", "Jam"],
        ["Milk", "Tea"],
        ["Bread", "Butter", "Jam"],
        ["Tea", "Sugar"],
        ["Bread", "Butter", "Milk"],
        ["Bread", "Butter", "Tea"],
        ["Milk", "Sugar"],
        ["Bread", "Butter"],
        ["Tea", "Sugar", "Milk"],
        ["Bread", "Jam", "Butter"],
    ]

    rules = find_associations(sample_transactions, min_support=0.15, min_confidence=0.4)
    print(rules)
    print(get_bundle_suggestions(rules))
