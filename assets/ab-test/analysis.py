"""
A/B test case study: signup onboarding redesign.

The data is SIMULATED with a known ground truth so every conclusion can be
checked against the true effect. The analysis steps are the ones you would
run on a real experiment.

Run:  python analysis.py      (writes results.json and charts/*.png)
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from scipy import stats
from statsmodels.stats.proportion import proportion_confint, proportions_ztest
from statsmodels.stats.multitest import multipletests

SEED = 42
rng = np.random.default_rng(SEED)
OUT = Path(__file__).parent
(OUT / "charts").mkdir(exist_ok=True)

# ---------------------------------------------------------------------------
# 1. Experiment design (decided BEFORE looking at data)
# ---------------------------------------------------------------------------
BASELINE = 0.120          # control signup conversion
MDE_ABS = 0.010           # minimum effect worth shipping: +1.0 pp
ALPHA = 0.05
POWER = 0.80

# Ground truth used only to simulate data (unknown to the analyst).
TRUE_CONTROL = 0.120
TRUE_TREATMENT = 0.135    # +1.5 pp, a real effect larger than the MDE
N_USERS = 60_000          # total eligible users in the test window


def sample_size_per_arm(p1, delta, alpha=ALPHA, power=POWER):
    """Two-sided two-proportion sample size (normal approximation)."""
    p2 = p1 + delta
    z_a = stats.norm.ppf(1 - alpha / 2)
    z_b = stats.norm.ppf(power)
    pbar = (p1 + p2) / 2
    num = (z_a * np.sqrt(2 * pbar * (1 - pbar)) +
           z_b * np.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2
    return int(np.ceil(num / delta ** 2))


N_REQUIRED = sample_size_per_arm(BASELINE, MDE_ABS)

# ---------------------------------------------------------------------------
# 2. Simulate the experiment
# ---------------------------------------------------------------------------
def simulate(n_users, rng):
    df = pd.DataFrame({
        "user_id": np.arange(n_users),
        "variant": rng.choice(["control", "treatment"], size=n_users, p=[0.5, 0.5]),
        "platform": rng.choice(["web", "ios", "android"], size=n_users, p=[0.55, 0.25, 0.20]),
        "new_user": rng.choice([True, False], size=n_users, p=[0.6, 0.4]),
    })
    p = np.where(df.variant == "treatment", TRUE_TREATMENT, TRUE_CONTROL)
    # Mild real heterogeneity: the redesign helps mobile more than web.
    p = np.where((df.variant == "treatment") & (df.platform == "web"), TRUE_TREATMENT - 0.005, p)
    df["signed_up"] = rng.random(n_users) < p
    # Guardrail metric: 7-day retention among signups (should not drop).
    retention_base = 0.42
    df["retained_7d"] = np.where(
        df.signed_up, rng.random(n_users) < retention_base, False)
    return df


df = simulate(N_USERS, rng)
df.to_csv(OUT / "experiment_data.csv", index=False)

results = {"design": {
    "baseline_conversion": BASELINE,
    "mde_absolute": MDE_ABS,
    "alpha": ALPHA,
    "power": POWER,
    "required_per_arm": N_REQUIRED,
    "planned_total_users": 2 * N_REQUIRED,
}}

# ---------------------------------------------------------------------------
# 3. Sample ratio mismatch (randomisation health check)
# ---------------------------------------------------------------------------
counts = df.variant.value_counts()
srm_chi2, srm_p = stats.chisquare([counts["control"], counts["treatment"]])
results["srm_check"] = {
    "control_n": int(counts["control"]),
    "treatment_n": int(counts["treatment"]),
    "chi2": float(srm_chi2),
    "p_value": float(srm_p),
    "passes": bool(srm_p > 0.001),
}

# ---------------------------------------------------------------------------
# 4. Primary metric: signup conversion
# ---------------------------------------------------------------------------
def summarise(sub, label):
    c = sub[sub.variant == "control"].signed_up
    t = sub[sub.variant == "treatment"].signed_up
    x = np.array([t.sum(), c.sum()])
    n = np.array([len(t), len(c)])
    z, p = proportions_ztest(x, n, alternative="two-sided")
    p_c, p_t = c.mean(), t.mean()
    diff = p_t - p_c
    se = np.sqrt(p_c * (1 - p_c) / len(c) + p_t * (1 - p_t) / len(t))
    z_crit = stats.norm.ppf(1 - ALPHA / 2)
    ci = (diff - z_crit * se, diff + z_crit * se)
    rel = diff / p_c
    return {
        "segment": label,
        "control_rate": float(p_c),
        "treatment_rate": float(p_t),
        "abs_lift_pp": float(diff * 100),
        "ci95_pp": [float(ci[0] * 100), float(ci[1] * 100)],
        "relative_lift": float(rel),
        "p_value": float(p),
        "n_control": int(len(c)),
        "n_treatment": int(len(t)),
    }


primary = summarise(df, "overall")
results["primary"] = primary

# Wilson CIs for each arm, for the chart
wc = proportion_confint(df[df.variant == "control"].signed_up.sum(),
                        (df.variant == "control").sum(), method="wilson")
wt = proportion_confint(df[df.variant == "treatment"].signed_up.sum(),
                        (df.variant == "treatment").sum(), method="wilson")

# ---------------------------------------------------------------------------
# 5. Guardrail: 7-day retention among signups must not drop
# ---------------------------------------------------------------------------
signups = df[df.signed_up]
gc = signups[signups.variant == "control"].retained_7d
gt = signups[signups.variant == "treatment"].retained_7d
g_stat, g_p = stats.ttest_ind(gt.astype(float), gc.astype(float), equal_var=False)
g_diff = gt.mean() - gc.mean()
g_se = np.sqrt(gt.var(ddof=1) / len(gt) + gc.var(ddof=1) / len(gc))
results["guardrail_retention"] = {
    "control_rate": float(gc.mean()),
    "treatment_rate": float(gt.mean()),
    "diff_pp": float(g_diff * 100),
    "ci95_pp": [float((g_diff - 1.96 * g_se) * 100), float((g_diff + 1.96 * g_se) * 100)],
    "p_value": float(g_p),
    # Non-inferiority: the LOWER bound of the CI must stay above -1 pp.
    "non_inferior_within_1pp": bool((g_diff - 1.96 * g_se) > -0.01),
}

# ---------------------------------------------------------------------------
# 6. Segments, with multiple-comparison correction (Holm)
# ---------------------------------------------------------------------------
seg_rows = []
for col in ["platform", "new_user"]:
    for level in sorted(df[col].unique(), key=str):
        seg_rows.append(summarise(df[df[col] == level], f"{col}={level}"))
pvals = [r["p_value"] for r in seg_rows]
reject, p_adj, _, _ = multipletests(pvals, alpha=ALPHA, method="holm")
for r, pa, rj in zip(seg_rows, p_adj, reject):
    r["p_value_holm"] = float(pa)
    r["significant_after_holm"] = bool(rj)
results["segments"] = seg_rows

# ---------------------------------------------------------------------------
# 7. Why peeking is dangerous: A/A simulation
# ---------------------------------------------------------------------------
def peeking_false_positive_rate(n_sims=1000, n_per_arm=4000, looks=20, rng=rng):
    """Both arms identical. Check p-value at `looks` evenly spaced points."""
    hits_peek, hits_final = 0, 0
    checkpoints = np.linspace(n_per_arm // looks, n_per_arm, looks, dtype=int)
    for _ in range(n_sims):
        a = rng.random(n_per_arm) < BASELINE
        b = rng.random(n_per_arm) < BASELINE
        ever = False
        for n in checkpoints:
            x = np.array([b[:n].sum(), a[:n].sum()])
            _, p = proportions_ztest(x, np.array([n, n]))
            if p < ALPHA:
                ever = True
                break
        hits_peek += ever
        x = np.array([b.sum(), a.sum()])
        _, p = proportions_ztest(x, np.array([n_per_arm, n_per_arm]))
        hits_final += p < ALPHA
    return hits_peek / n_sims, hits_final / n_sims


peek_rate, fixed_rate = peeking_false_positive_rate(
    n_sims=600, rng=np.random.default_rng(SEED + 1))
results["peeking_aa_test"] = {
    "false_positive_rate_checking_20_times": float(peek_rate),
    "false_positive_rate_single_final_look": float(fixed_rate),
    "nominal_alpha": ALPHA,
}

# ---------------------------------------------------------------------------
# 8. Decision rule
# ---------------------------------------------------------------------------
ship = (
    results["srm_check"]["passes"]
    and primary["p_value"] < ALPHA
    and primary["abs_lift_pp"] / 100 >= MDE_ABS
    and results["guardrail_retention"]["non_inferior_within_1pp"]
)
results["decision"] = "ship" if ship else "do not ship"

with open(OUT / "results.json", "w") as f:
    json.dump(results, f, indent=2)

# ---------------------------------------------------------------------------
# 9. Charts
# ---------------------------------------------------------------------------
plt.rcParams.update({"font.size": 10})

# Chart 1: conversion by arm with 95% Wilson intervals
fig, ax = plt.subplots(figsize=(6, 4))
labels = ["Control", "Treatment"]
rates = [primary["control_rate"], primary["treatment_rate"]]
lows = [wc[0], wt[0]]
highs = [wc[1], wt[1]]
err = [[r - l for r, l in zip(rates, lows)], [h - r for r, h in zip(rates, highs)]]
ax.bar(labels, [r * 100 for r in rates], color=["#8a8f98", "#2f6fdb"],
       yerr=[[e * 100 for e in err[0]], [e * 100 for e in err[1]]], capsize=6)
ax.set_ylabel("Signup conversion (%)")
ax.set_title("Signup conversion by arm (95% Wilson CI)")
ax.set_ylim(0, 18)
for i, r in enumerate(rates):
    ax.text(i, r * 100 + 1.0, f"{r*100:.1f}%", ha="center")
fig.tight_layout()
fig.savefig(OUT / "charts" / "conversion_by_arm.png", dpi=150)
plt.close(fig)

# Chart 2: lift by segment with 95% CI
seg_df = pd.DataFrame(seg_rows)
fig, ax = plt.subplots(figsize=(7, 4.5))
y = np.arange(len(seg_df))[::-1]
lift = seg_df.abs_lift_pp.values
lo = seg_df.ci95_pp.apply(lambda c: c[0]).values
hi = seg_df.ci95_pp.apply(lambda c: c[1]).values
ax.errorbar(lift, y, xerr=[lift - lo, hi - lift], fmt="o", color="#2f6fdb", capsize=4)
ax.axvline(0, color="grey", lw=1)
ax.axvline(MDE_ABS * 100, color="#d9534f", lw=1, ls="--", label="MDE (+1.0 pp)")
ax.set_yticks(y)
ax.set_yticklabels(seg_df.segment)
ax.set_xlabel("Absolute lift in conversion (percentage points)")
ax.set_title("Lift by segment, 95% CI")
ax.legend(loc="lower right")
fig.tight_layout()
fig.savefig(OUT / "charts" / "lift_by_segment.png", dpi=150)
plt.close(fig)

# Chart 3: peeking inflates false positives
fig, ax = plt.subplots(figsize=(6, 3.5))
ax.bar(["Single final look", "Checked 20 times"],
       [fixed_rate * 100, peek_rate * 100], color=["#8a8f98", "#d9534f"])
ax.axhline(ALPHA * 100, color="black", ls="--", lw=1, label="Target 5%")
ax.set_ylabel("False positive rate (%)")
ax.set_title("A/A test: how often 'significant' appears with no effect")
ax.legend()
fig.tight_layout()
fig.savefig(OUT / "charts" / "peeking_false_positives.png", dpi=150)
plt.close(fig)

print(json.dumps(results, indent=2))
