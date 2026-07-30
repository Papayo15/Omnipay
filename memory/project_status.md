---
name: project-status
description: Estado actual de OmniPay — qué está listo, qué está pendiente, arquitectura activa
metadata:
  type: project
---

# OmniPay — Estado del proyecto

## Proyecto activo: /Users/papayo/Desktop/pay (puede moverse)
- Git repo: https://github.com/Papayo15/Omnipay.git
- Deploy: Vercel (omnipay-jade.vercel.app)
- Rama: main

## Proyecto en pausa: /Users/papayo/Desktop/omnipay-wise
- Tiene integración Wise P2P completa
- En pausa hasta que Bridge autorice producción y se activen cuentas Wise ($55 CAD)

## Arquitectura activa (Bridge-only)

### P2P (cobrar)
- Receptor genera link: `POST /api/bridge/checkout` → KYC + liquidation address + token cifrado
- Emisor paga: `POST /api/bridge/pay` → VA Bridge → emisor deposita → Bridge convierte → SPEI/PIX/SEPA/FPS
- 41 países destino via Bridge (SPEI MX, ACH US, PIX BR, FPS GB, Bre-B CO, SEPA 36 países EEA)
- Canada senders: checkbox "Mi emisor paga en CAD desde Canadá" → Wise relay manual (admin via WhatsApp)

### B2B (empresas)
- Stripe captura pago → Wise payout → receptor recibe

### Fee structure
- P2P: Bridge 0.75% + OmniPay 0.50% + $0.99 flat (mín $1.99)
- KYC primera vez: $2 USD pass-through a Bridge
- B2B: Stripe 2.9%+$0.30 + Bridge 0.75% + OmniPay 0.50% + $1.99 flat

## Pendiente (esperando APIs reales)
- Bridge producción authorization → habilita todas las liquidation addresses en producción
- Wise cuentas multi-moneda ($55 CAD) → habilita Canada relay automático
- Paysend/Kuba contrato → card push para países fuera de los 41 de Bridge

## Regla de oro
**OmniPay NUNCA custodia dinero ajeno.** Bridge maneja fondos end-to-end.
Zero PII almacenado — todo cifrado AES-256-GCM en token efímero.
