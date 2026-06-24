"""Configurable, weighted scoring.

Axes + weights come from each problem's meta.json ("scoring" block); when absent we fall
back to a per-domain default. The score (0–1000) is a weighted sum of per-axis percentages.

Only axes we can actually measure today are in the registry (accuracy, turn/token
efficiency). Richer axes from the design — time-complexity, code quality, a11y, visual
match — plug in by adding a branch to `_axis_pct` once the measuring tool exists; the
config format and the breakdown the frontend renders don't change.
"""

DEFAULT_IDEAL_TOKENS = 6000

# domain -> default axis config used when meta.json has no "scoring" block
DEFAULT_AXES = {
    "algorithm": [
        {"key": "accuracy", "label": "정확도", "weight": 0.6},
        {"key": "turn_efficiency", "label": "효율 · 턴", "weight": 0.25},
        {"key": "token_efficiency", "label": "효율 · 토큰", "weight": 0.15},
    ],
    "backend": [
        {"key": "accuracy", "label": "정확도", "weight": 0.65},
        {"key": "turn_efficiency", "label": "효율 · 턴", "weight": 0.2},
        {"key": "token_efficiency", "label": "효율 · 토큰", "weight": 0.15},
    ],
}
FALLBACK_AXES = DEFAULT_AXES["algorithm"]


def _axis_pct(key: str, ctx: dict) -> float:
    """Percentage (0–100) for one measurable axis. Unknown axes score 0 (not yet wired)."""
    if key == "accuracy":
        return 100.0 * ctx["passed"] / ctx["total"] if ctx["total"] else 0.0
    if key == "turn_efficiency":
        return 100.0 * min(1.0, ctx["ideal_turns"] / max(ctx["turns"], 1))
    if key == "token_efficiency":
        return 100.0 * min(1.0, ctx["ideal_tokens"] / max(ctx["tokens"], 1))
    return 0.0


def evaluate(meta: dict, passed: int, total: int, turns: int, tokens: int) -> dict:
    """Return {score, axes, fully_passed} from the problem's config.

    Measurement and policy are separated:
    - axes[].pct is always the true measured value (displayed as-is in the UI)
    - efficiency axes contribute to score ONLY when all hidden tests pass (fully_passed)
    - accuracy axis always contributes regardless
    """
    axes_cfg = (meta.get("scoring") or {}).get("axes") or DEFAULT_AXES.get(
        meta.get("domain"), FALLBACK_AXES
    )
    weight_sum = sum(a.get("weight", 0) for a in axes_cfg) or 1.0

    par = meta.get("par") or {}
    ctx = {
        "passed": passed,
        "total": total,
        "turns": turns,
        "tokens": tokens,
        "ideal_turns": par.get("turns") or meta.get("ideal_turns", 3),
        "ideal_tokens": par.get("tokens") or meta.get("ideal_tokens", DEFAULT_IDEAL_TOKENS),
    }

    fully_passed = total > 0 and passed == total

    axes = []
    for a in axes_cfg:
        key = a["key"]
        pct = _axis_pct(key, ctx)   # always the true measured value
        weight = a.get("weight", 0) / weight_sum

        # gate: efficiency axes only count toward score when all tests pass
        score_pct = pct if (key == "accuracy" or fully_passed) else 0.0

        axes.append(
            {
                "key": key,
                "label": a.get("label", key),
                "weight": round(weight, 4),
                "pct": round(pct, 1),                          # true measurement (display)
                "points": round(10 * score_pct * weight, 1),   # gated contribution to score
            }
        )

    return {
        "score": round(sum(ax["points"] for ax in axes)),
        "axes": axes,
        "fully_passed": fully_passed,
    }
