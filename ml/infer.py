#!/usr/bin/env python3
"""Manual single-product inference against a trained SugarShield checkpoint.

Usage:
    python3 ml/infer.py --checkpoint ./checkpoints/sugarshield-v1 \
        --product "Classic Cola" \
        --ingredients "Carbonated Water, High Fructose Corn Syrup, Caramel Color, Phosphoric Acid"
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from model_io import load_model, generate_json  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", default="./checkpoints/sugarshield-v1")
    ap.add_argument("--product", required=True)
    ap.add_argument("--ingredients", required=True)
    ap.add_argument("--total_sugars_g", type=float, default=None)
    ap.add_argument("--added_sugars_g", type=float, default=None)
    ap.add_argument("--serving_size", default=None)
    args = ap.parse_args()

    model, tokenizer = load_model(args.checkpoint)
    nutrition = {
        "serving_size": args.serving_size,
        "total_sugars_g": args.total_sugars_g,
        "added_sugars_g": args.added_sugars_g,
    }
    result = generate_json(model, tokenizer, args.product, args.ingredients, nutrition)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
