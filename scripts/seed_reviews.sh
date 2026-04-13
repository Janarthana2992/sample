#!/usr/bin/env bash
# ============================================================
# Seed script — creates reviews for seeded products
# Adds varied review counts and ratings to test Bayesian ranking
# Usage: bash scripts/seed_reviews.sh
# Prerequisites: seed_products.sh must have run first
# ============================================================
set -e

BASE_PRODUCT="http://localhost:8002"
BASE_AUTH="http://localhost:8001"

echo "==> Registering test customers..."

# Create 5 test users for leaving reviews
USERS=()
for i in 1 2 3 4 5; do
  EMAIL="testuser${i}@example.com"
  # Try register, ignore if already exists
  curl -sf -X POST "$BASE_AUTH/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"TestUser@${i}23456\",\"first_name\":\"Test\",\"last_name\":\"User${i}\"}" > /dev/null 2>&1 || true

  TOKEN=$(curl -sf "$BASE_AUTH/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"TestUser@${i}23456\"}" \
    | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

  if [[ -n "$TOKEN" ]]; then
    USERS+=("$TOKEN")
    echo "   Customer $i ready."
  else
    echo "   WARN: Could not login as customer $i"
  fi
done

if [[ ${#USERS[@]} -eq 0 ]]; then
  echo "ERROR: No test users available"; exit 1
fi

echo "==> Fetching products..."
PRODUCTS=$(curl -sf -X POST "$BASE_PRODUCT/search/filter" \
  -H "Content-Type: application/json" \
  -d '{"q":"","page":1,"size":50}')

PRODUCT_IDS=($(echo "$PRODUCTS" | grep -o '"product_id":"[^"]*"' | cut -d'"' -f4))
PRODUCT_COUNT=${#PRODUCT_IDS[@]}
echo "   Found $PRODUCT_COUNT products."

if [[ $PRODUCT_COUNT -eq 0 ]]; then
  echo "ERROR: No products found. Run seed_products.sh first."; exit 1
fi

# ── Review templates ──────────────────────────────────────
REVIEW_5=(
  "Absolutely love this product! Exceeded my expectations in every way."
  "Best purchase I've made this year. Highly recommend!"
  "Premium quality, fast delivery, and great packaging. 5 stars!"
  "Outstanding value for money. Works exactly as described."
  "Fantastic product! Will definitely buy again."
)

REVIEW_4=(
  "Great product overall. Minor issues but nothing major."
  "Good quality, arrived on time. Would recommend."
  "Solid product, does what it says. Packaging could be better."
  "Happy with the purchase. Good quality for the price."
  "Nice product. Took a day extra to deliver but worth it."
)

REVIEW_3=(
  "Average product. Does the job but nothing special."
  "Okay for the price. Expected a bit more quality."
  "Decent product but could use some improvements."
  "It's fine. Not the best but not the worst either."
  "Mixed feelings. Some features are good, others not so much."
)

REVIEW_2=(
  "Below expectations. Quality doesn't match the description."
  "Not great. Had issues from day one."
  "Disappointing. Wouldn't recommend at this price."
  "Product arrived late and quality is mediocre."
  "Not satisfied. Expected much better."
)

REVIEW_1=(
  "Terrible product. Stopped working within a week."
  "Complete waste of money. Do not buy."
  "Very poor quality. Returning immediately."
)

# ── Post a review ──────────────────────────────────────────
post_review() {
  local product_id="$1"
  local rating="$2"
  local text="$3"
  local token="$4"

  curl -sf -X POST "$BASE_PRODUCT/reviews" \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -d "{\"product_id\":\"$product_id\",\"rating\":$rating,\"review_text\":\"$text\"}" > /dev/null 2>&1 || true
}

echo "==> Seeding reviews..."

REVIEW_COUNT=0

# Group 1: Products 0-4 — many reviews (4-5 each), high ratings (popular products)
for i in 0 1 2 3 4; do
  if [[ $i -ge $PRODUCT_COUNT ]]; then break; fi
  PID="${PRODUCT_IDS[$i]}"
  for u in 0 1 2 3 4; do
    if [[ $u -ge ${#USERS[@]} ]]; then break; fi
    # Mostly 4-5 star ratings
    if [[ $((RANDOM % 3)) -eq 0 ]]; then
      RATING=4
      TEXT="${REVIEW_4[$((RANDOM % ${#REVIEW_4[@]}))]}"
    else
      RATING=5
      TEXT="${REVIEW_5[$((RANDOM % ${#REVIEW_5[@]}))]}"
    fi
    post_review "$PID" "$RATING" "$TEXT" "${USERS[$u]}"
    ((REVIEW_COUNT++))
  done
  echo "   Product $((i+1)): 5 reviews (high rating)"
done

# Group 2: Products 5-14 — moderate reviews (2-3 each), mixed ratings
for i in 5 6 7 8 9 10 11 12 13 14; do
  if [[ $i -ge $PRODUCT_COUNT ]]; then break; fi
  PID="${PRODUCT_IDS[$i]}"
  NUM_REVIEWS=$((2 + RANDOM % 2))
  for ((r=0; r<NUM_REVIEWS; r++)); do
    U_IDX=$((RANDOM % ${#USERS[@]}))
    ROLL=$((RANDOM % 5))
    if [[ $ROLL -le 1 ]]; then
      RATING=5
      TEXT="${REVIEW_5[$((RANDOM % ${#REVIEW_5[@]}))]}"
    elif [[ $ROLL -le 3 ]]; then
      RATING=4
      TEXT="${REVIEW_4[$((RANDOM % ${#REVIEW_4[@]}))]}"
    else
      RATING=3
      TEXT="${REVIEW_3[$((RANDOM % ${#REVIEW_3[@]}))]}"
    fi
    post_review "$PID" "$RATING" "$TEXT" "${USERS[$U_IDX]}"
    ((REVIEW_COUNT++))
  done
  echo "   Product $((i+1)): $NUM_REVIEWS reviews (mixed)"
done

# Group 3: Products 15-24 — few reviews (1 each), various ratings
for i in 15 16 17 18 19 20 21 22 23 24; do
  if [[ $i -ge $PRODUCT_COUNT ]]; then break; fi
  PID="${PRODUCT_IDS[$i]}"
  U_IDX=$((RANDOM % ${#USERS[@]}))
  RATING=$((2 + RANDOM % 4))  # 2-5
  case $RATING in
    5) TEXT="${REVIEW_5[$((RANDOM % ${#REVIEW_5[@]}))]}" ;;
    4) TEXT="${REVIEW_4[$((RANDOM % ${#REVIEW_4[@]}))]}" ;;
    3) TEXT="${REVIEW_3[$((RANDOM % ${#REVIEW_3[@]}))]}" ;;
    *) TEXT="${REVIEW_2[$((RANDOM % ${#REVIEW_2[@]}))]}" ;;
  esac
  post_review "$PID" "$RATING" "$TEXT" "${USERS[$U_IDX]}"
  ((REVIEW_COUNT++))
  echo "   Product $((i+1)): 1 review (rating: $RATING)"
done

# Group 4: Products 25+ — no reviews (to test zero-review handling)
echo "   Products 26+: no reviews (zero-review testing)"

echo ""
echo "==> Done! Seeded $REVIEW_COUNT reviews across products."
echo "   Group 1 (products 1-5):   ~5 reviews each, high ratings — Bayesian top"
echo "   Group 2 (products 6-15):  2-3 reviews each, mixed ratings"
echo "   Group 3 (products 16-25): 1 review each, varied ratings"
echo "   Group 4 (products 26+):   0 reviews — tests zero-review Bayesian fallback"
