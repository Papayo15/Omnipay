#!/usr/bin/env bash
# OmniPay — Simulación completa de flujo P2P y B2B (opción A, sin credenciales reales)
# Uso: bash scripts/simulate.sh [p2p|b2b|rate] [tu@email.com]
#
# Requiere: next dev corriendo en localhost:3000

BASE="http://localhost:3000"
FLOW="${1:-p2p}"
EMAIL="${2:-test@omnipay.dev}"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

header() { echo -e "\n${CYAN}══ $1 ══${NC}"; }
ok()     { echo -e "${GREEN}✓ $1${NC}"; }
info()   { echo -e "${YELLOW}→ $1${NC}"; }
fail()   { echo -e "${RED}✗ $1${NC}"; }

# ── Verificar que el servidor esté corriendo ──────────────────────────────────
if ! curl -sf "$BASE" > /dev/null 2>&1; then
  fail "El servidor no responde en $BASE"
  echo "  Corre primero: cd pay && npm run dev"
  exit 1
fi
ok "Servidor activo en $BASE"

# ══════════════════════════════════════════════════════════════════════════════
# FLUJO P2P
# ══════════════════════════════════════════════════════════════════════════════
if [ "$FLOW" = "p2p" ]; then

  header "PASO 1 — Receptor genera link de cobro (/api/remesa/request)"
  REMESA=$(curl -sf -X POST "$BASE/api/remesa/request" \
    -H "Content-Type: application/json" \
    -d '{
      "recipientName":    "María García",
      "recipientAccount": "646180524000000001",
      "receiveMode":      "bank",
      "receiveAmount":    1000,
      "receiveCurrency":  "MXN",
      "targetCountry":    "MX",
      "originCountry":    "CA",
      "recipientPhone":   "+5215500000001",
      "senderPhone":      "+15140000001",
      "senderEmail":      "'"$EMAIL"'"
    }')
  if [ $? -ne 0 ]; then fail "remesa/request falló"; exit 1; fi
  LINK=$(echo "$REMESA" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('share_link','ERROR'))")
  ok "Link generado: $LINK"
  TOKEN=$(echo "$LINK" | sed 's/.*[?&]t=\([^&]*\).*/\1/')
  info "Token extraído: ${TOKEN:0:30}..."

  header "PASO 2 — Emisor ve la tasa antes de pagar (/api/bridge/rate)"
  RATE=$(curl -sf "$BASE/api/bridge/rate?token=$TOKEN&currency=cad")
  if [ $? -ne 0 ]; then
    fail "rate endpoint falló (normal si no hay open.er-api)"
  else
    echo "$RATE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f\"  1 {d.get('source_currency','?').upper()} = {d.get('rate','?')} {d.get('target_currency','?').upper()}\")
print(f\"  Pagas: {d.get('amount_to_pay','?')} {d.get('source_currency','?').upper()}\")
print(f\"  Receptor recibe: {d.get('recipient_gets','?')} MXN\")
" 2>/dev/null || echo "$RATE"
    ok "Tasa preview OK"
  fi

  header "PASO 3 — Simulación: crear orden + Bridge webhooks (/api/test/sim)"
  info "Creando orden..."
  SIM=$(curl -sf "$BASE/api/test/sim?flow=p2p&step=all&email=$EMAIL")
  if [ $? -ne 0 ]; then fail "sim endpoint falló"; exit 1; fi
  ORDER_ID=$(echo "$SIM" | python3 -c "import sys,json; print(json.load(sys.stdin).get('order_id','ERROR'))")
  RECEIPT=$(echo "$SIM" | python3 -c "import sys,json; print(json.load(sys.stdin).get('receipt_url',''))")
  EMAIL_SENT=$(echo "$SIM" | python3 -c "import sys,json; print(json.load(sys.stdin).get('email_sent',False))")
  ok "Orden: $ORDER_ID"
  ok "Comprobante: $RECEIPT"
  [ "$EMAIL_SENT" = "True" ] && ok "Email enviado a $EMAIL" || info "Email silenciado (no RESEND_API_KEY)"

  header "PASO 4 — Verificar tracking (/api/bridge/track)"
  TRACK=$(curl -sf "$BASE/api/bridge/track?order_id=$ORDER_ID")
  echo "$TRACK" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f\"  step={d.get('step','?')} status={d.get('status','?')} label={d.get('label','?')}\")
" 2>/dev/null || echo "$TRACK"
  ok "Tracking OK"

  header "PASO 5 — Simular webhook Bridge: depósito recibido"
  DEPOSIT=$(curl -sf "$BASE/api/test/sim?flow=p2p&step=deposit&order_id=$ORDER_ID&email=$EMAIL")
  STATUS=$(echo "$DEPOSIT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))")
  ok "Estado tras depósito: $STATUS"

  # Track mid-flow
  TRACK2=$(curl -sf "$BASE/api/bridge/track?order_id=$ORDER_ID")
  STEP2=$(echo "$TRACK2" | python3 -c "import sys,json; print(json.load(sys.stdin).get('step','?'))")
  ok "Tracking step: $STEP2/4"

  header "PASO 6 — Simular webhook Bridge: transferencia completada"
  COMPLETE=$(curl -sf "$BASE/api/test/sim?flow=p2p&step=complete&order_id=$ORDER_ID&email=$EMAIL")
  STATUS3=$(echo "$COMPLETE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))")
  ok "Estado final: $STATUS3"

  TRACK3=$(curl -sf "$BASE/api/bridge/track?order_id=$ORDER_ID")
  echo "$TRACK3" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f\"  step={d.get('step','?')}/4  status={d.get('status','?')}\")
" 2>/dev/null

  echo -e "\n${GREEN}═══════════════════════════════════════${NC}"
  echo -e "${GREEN}  ✅ FLUJO P2P COMPLETO${NC}"
  echo -e "${GREEN}═══════════════════════════════════════${NC}"
  echo -e "  Pagar UI:    $BASE/pagar"
  echo -e "  Comprobante: $RECEIPT"
  echo -e "  Tracking:    $BASE/api/bridge/track?order_id=$ORDER_ID"

fi

# ══════════════════════════════════════════════════════════════════════════════
# FLUJO B2B
# ══════════════════════════════════════════════════════════════════════════════
if [ "$FLOW" = "b2b" ]; then

  header "FLUJO B2B — Stripe + Wise (simulado)"
  info "Email de confirmación: $EMAIL"

  SIM=$(curl -sf "$BASE/api/test/sim?flow=b2b&email=$EMAIL")
  if [ $? -ne 0 ]; then fail "sim endpoint falló"; exit 1; fi

  PI=$(echo "$SIM" | python3 -c "import sys,json; print(json.load(sys.stdin).get('payment_intent_id','?'))")
  ETA=$(echo "$SIM" | python3 -c "import sys,json; print(json.load(sys.stdin).get('eta','?'))")
  ETA_LABEL=$(echo "$SIM" | python3 -c "import sys,json; print(json.load(sys.stdin).get('eta_label','?'))")
  EMAIL_SENT=$(echo "$SIM" | python3 -c "import sys,json; print(json.load(sys.stdin).get('email_sent',False))")

  ok "PaymentIntent: $PI"
  ok "Fecha estimada de entrega: $ETA_LABEL"
  [ "$EMAIL_SENT" = "True" ] && ok "Email enviado a $EMAIL" || info "Email silenciado (no RESEND_API_KEY)"

  echo -e "\n${GREEN}═══════════════════════════════════════${NC}"
  echo -e "${GREEN}  ✅ FLUJO B2B COMPLETO (simulado)${NC}"
  echo -e "${GREEN}═══════════════════════════════════════${NC}"
  echo -e "  B2B UI: $BASE/b2b"
  echo -e "  ETA:    $ETA ($ETA_LABEL)"
  echo -e ""
  echo -e "  Con credenciales reales Stripe (sk_test_) se activa el cobro real."
  echo -e "  Wise ejecuta cuando llega payout.paid desde Stripe."

fi

# ══════════════════════════════════════════════════════════════════════════════
# SOLO RATE PREVIEW
# ══════════════════════════════════════════════════════════════════════════════
if [ "$FLOW" = "rate" ]; then

  header "Rate preview — todas las monedas"

  # Primero genera un token real
  REMESA=$(curl -sf -X POST "$BASE/api/remesa/request" \
    -H "Content-Type: application/json" \
    -d '{"recipientName":"Test","recipientAccount":"646180524000000001","receiveAmount":1000,"receiveCurrency":"MXN","targetCountry":"MX","originCountry":"CA"}')
  LINK=$(echo "$REMESA" | python3 -c "import sys,json; print(json.load(sys.stdin).get('share_link',''))")
  TOKEN=$(echo "$LINK" | sed 's/.*[?&]t=\([^&]*\).*/\1/')

  for CUR in cad usd eur gbp; do
    RATE=$(curl -sf "$BASE/api/bridge/rate?token=$TOKEN&currency=$CUR" 2>/dev/null)
    echo -n "  $CUR: "
    echo "$RATE" | python3 -c "
import sys,json
try:
  d=json.load(sys.stdin)
  print(f\"{d.get('amount_to_pay','?')} {d.get('source_currency','?').upper()} → 1000 MXN  (tasa: {d.get('rate','?')})\")
except: print('error')
" 2>/dev/null
  done

fi
