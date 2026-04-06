#!/usr/bin/env bash
# ============================================================
# Seed script — creates categories + 40 products via REST API
# Usage: bash scripts/seed_products.sh
# ============================================================
set -e

BASE_PRODUCT="http://localhost:8002"
BASE_AUTH="http://localhost:8001"

echo "==> Logging in as admin..."
TOKEN=$(curl -sf "$BASE_AUTH/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@ecommerce.com","password":"Admin@123456"}' \
  | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [[ -z "$TOKEN" ]]; then
  echo "ERROR: login failed"; exit 1
fi
AUTH="Authorization: Bearer $TOKEN"
echo "   Token acquired."

# ── Helper: create category, return its ID ──────────────────
create_category() {
  local name="$1" slug="$2"
  local resp
  resp=$(curl -sf -X POST "$BASE_PRODUCT/categories" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d "{\"name\":\"$name\",\"slug\":\"$slug\"}" 2>&1 || true)
  # If already exists the endpoint returns 422/409 — fetch existing
  if echo "$resp" | grep -q "category_id"; then
    echo "$resp" | grep -o '"category_id":"[^"]*"' | cut -d'"' -f4
  else
    # Try to read existing
    curl -sf "$BASE_PRODUCT/categories" -H "$AUTH" \
      | grep -o "\"category_id\":\"[^\"]*\",\"name\":\"$name\"" \
      | grep -o '"category_id":"[^"]*"' | cut -d'"' -f4
  fi
}

# ── Helper: create product ──────────────────────────────────
create_product() {
  local sku="$1" name="$2" desc="$3" mrp="$4" price="$5" stock="$6" cat_id="$7" tags="$8"
  curl -sf -X POST "$BASE_PRODUCT/products" \
    -H "$AUTH" \
    -F "sku=$sku" \
    -F "name=$name" \
    -F "description=$desc" \
    -F "mrp=$mrp" \
    -F "selling_price=$price" \
    -F "stock_quantity=$stock" \
    -F "category_ids=$cat_id" \
    -F "tags=$tags" \
    -F "is_active=true" > /dev/null && echo "   + $name" || echo "   ! SKIP: $name (may already exist)"
}

echo ""
echo "==> Creating categories..."

# Electronics already exists — fetch its ID
ELEC=$(curl -sf "$BASE_PRODUCT/categories" -H "$AUTH" \
  | grep -o '"category_id":"[^"]*","name":"Electronics"' \
  | grep -o '"category_id":"[^"]*"' | cut -d'"' -f4)
echo "   Electronics: $ELEC"

PHONE=$(create_category "Smartphones" "smartphones"); echo "   Smartphones: $PHONE"
LAPTOP=$(create_category "Laptops" "laptops"); echo "   Laptops: $LAPTOP"
AUDIO=$(create_category "Audio" "audio"); echo "   Audio: $AUDIO"
FASHION=$(create_category "Fashion" "fashion"); echo "   Fashion: $FASHION"
MEN=$(create_category "Men's Clothing" "mens-clothing"); echo "   Men's Clothing: $MEN"
WOMEN=$(create_category "Women's Clothing" "womens-clothing"); echo "   Women's Clothing: $WOMEN"
HOME=$(create_category "Home & Kitchen" "home-kitchen"); echo "   Home & Kitchen: $HOME"
SPORTS=$(create_category "Sports & Fitness" "sports-fitness"); echo "   Sports & Fitness: $SPORTS"
BEAUTY=$(create_category "Beauty & Personal Care" "beauty-personal-care"); echo "   Beauty: $BEAUTY"
BOOKS=$(create_category "Books & Stationery" "books-stationery"); echo "   Books: $BOOKS"
GAMING=$(create_category "Gaming" "gaming"); echo "   Gaming: $GAMING"

echo ""
echo "==> Creating products..."

# ── Smartphones ─────────────────────────────────────────────
create_product "SM-SAMS24U" "Samsung Galaxy S24 Ultra" \
  "The Samsung Galaxy S24 Ultra features a 6.8-inch Dynamic AMOLED display, Snapdragon 8 Gen 3 chip, 200MP camera, and built-in S Pen for productivity." \
  134999 124999 50 "$PHONE" "samsung,android,5g,spen"

create_product "SM-IPH15PM" "Apple iPhone 15 Pro Max" \
  "Apple iPhone 15 Pro Max with A17 Pro chip, 6.7-inch Super Retina XDR display, titanium frame, 48MP main camera, and USB-C connectivity." \
  159900 149900 40 "$PHONE" "apple,iphone,ios,5g"

create_product "SM-POCO-X6" "Poco X6 Pro 5G 256GB" \
  "Poco X6 Pro 5G packs Dimensity 8300-Ultra processor, 6.67-inch 144Hz AMOLED display, 64MP triple camera, and 67W fast charging." \
  26999 22999 120 "$PHONE" "poco,5g,gaming,miui"

create_product "SM-ONEPLUS12" "OnePlus 12 512GB Glacier Blue" \
  "OnePlus 12 features Snapdragon 8 Gen 3, Hasselblad-tuned 50MP triple camera, 6.82-inch LTPO 120Hz display, and 100W SUPERVOOC charging." \
  64999 59999 60 "$PHONE" "oneplus,flagship,5g,fast-charging"

create_product "SM-REDMI13C" "Redmi 13C 128GB" \
  "Redmi 13C offers MediaTek Helio G85 processor, 6.74-inch HD+ display, 50MP camera, 5000mAh battery, and fingerprint sensor — ideal entry-level phone." \
  10999 9499 200 "$PHONE" "redmi,budget,android"

create_product "SM-VIVO-V30" "Vivo V30 Pro 5G" \
  "Vivo V30 Pro features 50MP Zeiss-branded dual front camera, 6.78-inch AMOLED curved display, Snapdragon 7 Gen 3, and 80W FlashCharge." \
  39999 36999 80 "$PHONE" "vivo,5g,zeiss,portrait"

# ── Laptops ─────────────────────────────────────────────────
create_product "LT-DELL-XPS15" "Dell XPS 15 9530 Core i9" \
  "Dell XPS 15 with 13th Gen Intel Core i9, 32GB DDR5, 1TB NVMe SSD, NVIDIA RTX 4070, and a stunning 15.6-inch OLED touch display." \
  189999 179999 20 "$LAPTOP" "dell,xps,intel,rtx,laptop"

create_product "LT-APPLE-MBP14" "Apple MacBook Pro 14-inch M3 Pro" \
  "MacBook Pro 14 with M3 Pro chip, 18GB unified memory, 512GB SSD, Liquid Retina XDR display, and up to 18 hours of battery life." \
  199900 194900 25 "$LAPTOP" "apple,macbook,m3,macos"

create_product "LT-ASUS-ROG" "Asus ROG Strix G16 Gaming Laptop" \
  "Asus ROG Strix G16 gaming laptop with Intel Core i9-14900HX, RTX 4080, 32GB DDR5, 1TB SSD, and 240Hz QHD display for extreme gaming." \
  229999 214999 15 "$LAPTOP" "asus,rog,gaming,rtx,intel"

create_product "LT-HP-ENVY16" "HP Envy 16 Core i7 Creator Laptop" \
  "HP Envy 16 creator laptop features 13th Gen Intel Core i7, 16GB RAM, 1TB SSD, RTX 3060, 16-inch 3K OLED display, and HP Wide Vision camera." \
  119999 109999 30 "$LAPTOP" "hp,envy,creator,intel,rtx"

# ── Audio ────────────────────────────────────────────────────
create_product "AU-SONY-WH1000XM5" "Sony WH-1000XM5 Wireless Headphones" \
  "Sony WH-1000XM5 industry-leading noise cancelling headphones with 30-hour battery, multipoint connection, speak-to-chat, and premium audio quality." \
  34990 29990 75 "$AUDIO" "sony,anc,wireless,headphones"

create_product "AU-BOSE-QC45" "Bose QuietComfort 45 Headphones" \
  "Bose QuietComfort 45 delivers world-class noise cancellation, balanced audio, 24-hour battery, and a comfortable lightweight design." \
  29900 26900 50 "$AUDIO" "bose,anc,wireless"

create_product "AU-JBL-FLIP6" "JBL Flip 6 Portable Bluetooth Speaker" \
  "JBL Flip 6 waterproof portable speaker with bold JBL Original Pro Sound, 12 hours playtime, IP67 rating, and PartyBoost support." \
  9999 7999 150 "$AUDIO" "jbl,speaker,bluetooth,waterproof"

create_product "AU-AIRPODS-PRO2" "Apple AirPods Pro 2nd Generation" \
  "Apple AirPods Pro 2nd Gen with H2 chip, Adaptive Transparency, Personalized Spatial Audio, up to 30 hours total listening, and MagSafe charging case." \
  24900 22999 90 "$AUDIO" "apple,airpods,anc,ios"

create_product "AU-NOISE-BUDS" "Noise Buds VS104 True Wireless" \
  "Noise Buds VS104 TWS earbuds with Quad-Mic ENC, 50-hour total playback, 10mm drivers, 45ms gaming mode, and Fast Charging support." \
  2499 1799 300 "$AUDIO" "noise,tws,budget,earbuds"

# ── Gaming ───────────────────────────────────────────────────
create_product "GM-PS5-SLIM" "Sony PlayStation 5 Slim Disc Edition" \
  "Sony PS5 Slim with custom 8-core AMD Ryzen CPU, ray-tracing GPU, ultra-fast SSD, 4K gaming support, and the innovative DualSense wireless controller." \
  54990 52990 35 "$GAMING" "sony,ps5,console,4k"

create_product "GM-XBOX-SX" "Microsoft Xbox Series X 1TB" \
  "Xbox Series X delivers 12 teraflops of GPU power, 4K gaming at 60fps (up to 120fps), Quick Resume, Smart Delivery, and Xbox Game Pass." \
  51990 49990 30 "$GAMING" "xbox,microsoft,console,4k"

create_product "GM-NS-OLED" "Nintendo Switch OLED Model" \
  "Nintendo Switch OLED model features 7-inch vibrant 1080p OLED screen, enhanced audio, 64GB internal storage, and a wide adjustable stand." \
  34999 32999 55 "$GAMING" "nintendo,switch,handheld,oled"

create_product "GM-LOGITECH-G502" "Logitech G502 X Plus Gaming Mouse" \
  "Logitech G502 X Plus gaming mouse with LIGHTFORCE hybrid switches, HERO 25K sensor, LIGHTSPEED wireless, and LIGHTSYNC RGB for competitive gaming." \
  12995 10995 100 "$GAMING" "logitech,mouse,gaming,wireless"

create_product "GM-RAZER-HB" "Razer Huntsman V3 Pro Gaming Keyboard" \
  "Razer Huntsman V3 Pro features analog optical switches with actuation sensitivity control, USB-C connection, sound dampening, and per-key RGB." \
  24999 21999 45 "$GAMING" "razer,keyboard,gaming,analog"

# ── Fashion — Men ────────────────────────────────────────────
create_product "MN-LS-POLO" "Allen Solly Men's Regular Polo T-Shirt" \
  "Allen Solly slim-fit polo T-shirt crafted from premium pique cotton, features a classic two-button placket and contrast tipping on collar and cuffs." \
  1299 849 500 "$MEN" "men,polo,tshirt,cotton"

create_product "MN-LV-JEANS" "Levi's 511 Slim Fit Jeans" \
  "Levi's 511 slim fit jeans in mid-stretch denim for all-day comfort. Sits below waist with a close fit through hips, thighs, and leg opening." \
  3999 2799 250 "$MEN" "levis,jeans,slim-fit,denim"

create_product "MN-PETER-SHIRT" "Peter England Formal Shirt Blue Checks" \
  "Peter England slim fit formal shirt in blue checks pattern made from 100% premium cotton, perfect for office and business casual occasions." \
  1799 1149 300 "$MEN" "men,formal,shirt,cotton"

create_product "MN-PUMA-TRACK" "Puma Men's Knitted Tracksuit" \
  "Puma men's knitted tracksuit with moisture-wicking dryCELL technology, elasticated waistband with drawcord and Puma's iconic Cat logo." \
  4499 2999 180 "$MEN" "puma,sportswear,tracksuit,men"

# ── Fashion — Women ──────────────────────────────────────────
create_product "WM-BIBA-SUIT" "BIBA Women's Printed Kurta Set" \
  "BIBA straight-cut kurta set with dupatta in vibrant floral print, crafted from soft Chanderi fabric with delicate embroidery at neckline." \
  2999 1999 280 "$WOMEN" "women,kurta,ethnic,biba"

create_product "WM-ONLY-DRESS" "ONLY Women's Wrap Midi Dress" \
  "ONLY women's wrap midi dress with a flattering V-neckline, adjustable waist tie, flutter sleeves, and an all-over floral print." \
  2499 1699 220 "$WOMEN" "women,dress,western,midi"

create_product "WM-MANGO-BLAZER" "Mango Women's Cotton Slim Blazer" \
  "Mango slim-fit blazer in structured cotton-blend fabric, featuring notch lapels, two-button closure, and welt pockets — ideal for workwear." \
  5999 4299 90 "$WOMEN" "women,blazer,office,mango"

# ── Home & Kitchen ───────────────────────────────────────────
create_product "HK-INSTANT-6QT" "Instant Pot Duo 7-in-1 Electric Pressure Cooker 6 Qt" \
  "Instant Pot Duo 7-in-1 replaces 7 kitchen appliances — pressure cooker, slow cooker, rice cooker, steamer, sauté pan, yogurt maker and food warmer." \
  9999 7499 60 "$HOME" "instant-pot,kitchen,pressure-cooker"

create_product "HK-PHILIPS-AF" "Philips HD9252 Air Fryer 4.1L" \
  "Philips HD9252 Air Fryer with Rapid Air Technology cooks food using hot air, reducing fat by up to 90% compared to traditional frying. 4.1L capacity." \
  8995 6995 80 "$HOME" "philips,air-fryer,kitchen,healthy"

create_product "HK-DYSON-V11" "Dyson V11 Absolute Cordless Vacuum" \
  "Dyson V11 Absolute cordless vacuum with High Torque XL cleaner head, Dynamic Load Sensing, LCD screen, and up to 60 minutes of run time." \
  44900 39900 25 "$HOME" "dyson,vacuum,cordless,cleaning"

create_product "HK-SOLIMO-SHEETS" "Amazon Solimo 300TC King Bed Sheet Set" \
  "Amazon Solimo 300 thread count microfibre bed sheet set for king-size beds includes 1 flat sheet, 1 fitted sheet, and 2 pillow covers." \
  1299 849 400 "$HOME" "bedsheet,king,cotton,home"

create_product "HK-BOSCH-KET" "Bosch TWK6A013 Electric Kettle 1.7L" \
  "Bosch TWK6A013 cordless electric kettle with 2400W rapid boil, 1.7L capacity, stainless steel interior, limescale filter, and safety auto-off." \
  2499 1799 150 "$HOME" "bosch,kettle,kitchen,electric"

# ── Sports & Fitness ─────────────────────────────────────────
create_product "SP-NIKE-AIR-270" "Nike Air Max 270 Running Shoes" \
  "Nike Air Max 270 features Max Air unit in the heel for all-day comfort, breathable mesh upper, and foam midsole for a lightweight smooth ride." \
  12995 9995 120 "$SPORTS" "nike,running,shoes,airmax"

create_product "SP-DECATH-MAT" "Decathlon Domyos NBR Yoga Mat 8mm" \
  "Decathlon Domyos 8mm thick NBR comfort yoga mat with non-slip texture, carrying strap, and guidance posture print. Suitable for all fitness levels." \
  1499 999 350 "$SPORTS" "yoga,mat,fitness,decathlon"

create_product "SP-WHEY-PROTEIN" "MuscleBlaze Biozyme Whey Protein 2kg Chocolate" \
  "MuscleBlaze Biozyme Whey Protein with Enhanced Absorption Formula (EAF), 25g protein per serving, 5.5g BCAA, 0g added sugar, 2kg chocolate flavour." \
  5299 3999 100 "$SPORTS" "protein,whey,supplement,fitness"

create_product "SP-COSCO-BADMINTON" "Cosco CB-88 Badminton Racket Combo" \
  "Cosco CB-88 badminton combo with 2 full graphite rackets, 3 nylon shuttlecocks, and a carry bag — perfect for recreational and club play." \
  1299 899 200 "$SPORTS" "badminton,sport,racket,cosco"

# ── Beauty & Personal Care ────────────────────────────────────
create_product "BP-LAKME-CC" "Lakme 9to5 Weightless CC Cream SPF 30" \
  "Lakme 9to5 Weightless Mousse CC Cream with SPF 30, provides light to medium coverage, matte finish, skin brightening, and 16-hour hydration." \
  375 299 500 "$BEAUTY" "lakme,makeup,cc-cream,spf"

create_product "BP-MAMAEARTH-VIT" "Mamaearth Vitamin C Face Serum 30ml" \
  "Mamaearth Vitamin C Face Serum with 15% Vitamin C and Turmeric reduces dark spots, removes pigmentation, and gives a natural glow. 30ml, all skin types." \
  699 499 400 "$BEAUTY" "mamaearth,serum,skincare,vitamin-c"

create_product "BP-DOVE-SHAMPOO" "Dove Nutritive Solutions Intense Repair Shampoo 700ml" \
  "Dove Intense Repair Shampoo with Keratin Actives repairs damaged hair with every wash, leaving hair smooth, shiny, and frizz-free. 700ml family pack." \
  399 299 600 "$BEAUTY" "dove,shampoo,haircare,keratin"

create_product "BP-GILLETTE-KIT" "Gillette Mach3 Razor + 4 Blades Kit" \
  "Gillette Mach3 razor starter kit includes ergonomic handle and 4 Mach3 refill cartridges with 3 blades each for a close comfortable shave." \
  649 499 350 "$BEAUTY" "gillette,shaving,men,razor"

# ── Books & Stationery ────────────────────────────────────────
create_product "BK-ATOMIC-HABITS" "Atomic Habits by James Clear — Paperback" \
  "Atomic Habits is the proven framework for improving every day. James Clear reveals practical strategies that will teach you how to form good habits and break bad ones." \
  599 399 800 "$BOOKS" "book,self-help,habits,bestseller"

create_product "BK-RICH-DAD" "Rich Dad Poor Dad by Robert Kiyosaki — Paperback" \
  "Rich Dad Poor Dad teaches readers about money management, investing in assets, and financial independence through the author's two father figures and their views on money." \
  350 249 900 "$BOOKS" "book,finance,money,bestseller"

create_product "BK-PILOT-G2" "Pilot G2 Premium Gel Rollerball Pens 0.7mm — 12 Pack" \
  "Pilot G2 premium refillable gel pens with 0.7mm tip provide smooth consistent ink flow. Includes 12 pens in assorted colours for school and office use." \
  799 599 500 "$BOOKS" "pens,stationery,pilot,office"

echo ""
echo "==> Done! Verifying product count..."
curl -sf "$BASE_PRODUCT/products?size=100" -H "$AUTH" \
  | grep -o '"total":[0-9]*' | head -1

echo ""
echo "Seeding complete."
