# =====================================================
# Deploy Script - Triển khai module Trợ lý Python
# =====================================================
# Yêu cầu:
#   - Render CLI hoặc Fly.io CLI
#   - Supabase CLI (cho Edge Function + migration)
# =====================================================

$ErrorActionPreference = "Stop"
$ROOT = "E:\00_DU_AN\DA 2026"

Write-Host "=== DEPLOY: LMS THPT Cà Mau + Trợ lý Python ===" -ForegroundColor Cyan

# --- Bước 1: Chạy migration Supabase ---
Write-Host "`n[1/5] Chạy migration Supabase..." -ForegroundColor Yellow
$migrations = @(
  "012_python_assistant.sql"
  "013_seed_learning_path.sql"
)

foreach ($m in $migrations) {
  $path = "$ROOT\backend\src\database\migrations\$m"
  if (Get-Command "supabase" -ErrorAction SilentlyContinue) {
    Write-Host "  Running $m via Supabase CLI..." -ForegroundColor Gray
    supabase db execute --file "$path"
  } else {
    Write-Host "  WARNING: Supabase CLI not found. Run $path manually in Supabase SQL Editor." -ForegroundColor Red
    Write-Host "    File: $path" -ForegroundColor Gray
  }
}

# --- Bước 2: Deploy Edge Function ---
Write-Host "`n[2/5] Deploy Supabase Edge Function (web-search)..." -ForegroundColor Yellow
if (Get-Command "supabase" -ErrorAction SilentlyContinue) {
  supabase functions deploy web-search --project-ref (Read-Host "Supabase project ref (vd: sfanqrirgbxpgrhcamit)")
} else {
  Write-Host "  Skipping (Supabase CLI not found). Deploy manually via Dashboard > Edge Functions." -ForegroundColor Red
}

# --- Bước 3: Xây dựng frontend ---
Write-Host "`n[3/5] Build frontend..." -ForegroundColor Yellow
Set-Location "$ROOT\frontend"
npm install --include=dev
npm run build
if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }
Write-Host "  Frontend build OK" -ForegroundColor Green

# --- Bước 4: Cài phụ thuộc backend ---
Write-Host "`n[4/5] Install backend dependencies..." -ForegroundColor Yellow
Set-Location "$ROOT\backend"
npm install --omit=dev
if ($LASTEXITCODE -ne 0) { throw "Backend install failed" }
Write-Host "  Backend dependencies OK" -ForegroundColor Green

# --- Bước 5: Deploy lên Render ---
Write-Host "`n[5/5] Deploy..." -ForegroundColor Yellow
$platform = Read-Host "Deploy to (render/fly/vercel)? "
switch ($platform) {
  "render" {
    if (Get-Command "render" -ErrorAction SilentlyContinue) {
      render deploy
    } else {
      Write-Host "  Push to git. Render auto-deploys from default branch." -ForegroundColor Gray
      Write-Host "  Ensure env vars are set in Render Dashboard:" -ForegroundColor Gray
      Write-Host "    OPENAI_API_KEY, BRAVE_SEARCH_API_KEY, CLOUDFLARE_API_KEY, CLOUDFLARE_ACCOUNT_ID" -ForegroundColor Gray
    }
  }
  "fly" {
    if (Get-Command "flyctl" -ErrorAction SilentlyContinue) {
      flyctl deploy
    } else {
      Write-Host "  flyctl not found. Install: winget install Fly.io.FlyCtl" -ForegroundColor Red
    }
  }
  "vercel" {
    Write-Host "  Frontend: vercel --prod" -ForegroundColor Gray
    Write-Host "  Backend: deploy backend/ to Render or Fly.io separately" -ForegroundColor Gray
  }
  default {
    Write-Host "  Unknown platform. Push to git for auto-deploy." -ForegroundColor Gray
  }
}

Write-Host "`n=== DEPLOY HOÀN TẤT ===" -ForegroundColor Cyan
Write-Host "Sau deploy, nhớ set env vars trên hosting dashboard:" -ForegroundColor Yellow
Write-Host "  OPENROUTER_API_KEY - Chat + Embedding + Vision (bắt buộc)" -ForegroundColor Gray
Write-Host "  GEMINI_API_KEY - Embedding fallback (tuỳ chọn, dùng text-embedding-004)" -ForegroundColor Gray
Write-Host "  BRAVE_SEARCH_API_KEY - Web search (Supabase Edge Function, tuỳ chọn)" -ForegroundColor Gray