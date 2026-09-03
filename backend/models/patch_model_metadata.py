"""一次性补丁脚本: 给现有 M8 pkl 模型注入 version 和 metrics 元信息

运行方式:
    python backend/models/patch_model_metadata.py

重复运行是安全的——已包含元信息的 pkl 会被跳过。
"""

import os
import joblib

MODEL_DIR = os.path.dirname(os.path.abspath(__file__))

PATCHES = [
    {
        "filename": "m8_saturated_fat.pkl",
        "version": "2026-09-03",
        "metrics": {"r2": 0.9946, "mape": 2.41, "mape_le5_pct": 88.5, "cv_r2": 0.9888},
    },
    {
        "filename": "m8_lite_saturated_fat.pkl",
        "version": "2026-09-03",
        "metrics": {"r2": 0.9941, "mape": 3.04, "mape_le5_pct": 83.8, "cv_r2": 0.9891},
    },
]


def patch():
    for p in PATCHES:
        path = os.path.join(MODEL_DIR, p["filename"])
        if not os.path.exists(path):
            print(f"[SKIP] {p['filename']} 不存在")
            continue

        data = joblib.load(path)
        if data.get("version") and data.get("metrics"):
            print(f"[SKIP] {p['filename']} 已有版本信息: {data['version']}")
            continue

        if not data.get("version"):
            data["version"] = p["version"]
        if not data.get("metrics"):
            data["metrics"] = p["metrics"]
        joblib.dump(data, path)
        print(f"[OK]   {p['filename']} → version={p['version']}, metrics={p['metrics']}")


if __name__ == "__main__":
    patch()
