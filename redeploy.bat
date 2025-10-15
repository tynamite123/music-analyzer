@echo off
setlocal enabledelayedexpansion

echo === Redeploy started at %date% %time% === 

:: Step 1 - Clean node_modules and lock file
echo === Cleaning up node_modules and package-lock.json ===
if exist node_modules (
    rmdir /s /q node_modules
)
if exist package-lock.json (
    del /q package-lock.json
)

:: Step 2 - Recreate lock file
echo === Generating fresh package-lock.json ===
call npm install --package-lock-only
if %errorlevel% neq 0 (
    echo [ERROR] npm install --package-lock-only failed
    exit /b %errorlevel%
)

:: Step 3 - Fix vulnerabilities automatically
echo === Running npm audit fix ===
call npm audit fix
if %errorlevel% neq 0 (
    echo [WARNING] npm audit fix encountered issues, continuing anyway...
)

:: Step 4 - Build Docker image
echo === Building Docker image ===
docker build -t gcr.io/music-analysis-app/music-backend:latest .
if %errorlevel% neq 0 (
    echo [ERROR] Docker build failed
    pause
    exit /b %errorlevel%
)

:: Step 5 - Push Docker image to GCR
echo === Pushing Docker image to Google Container Registry ===
docker push gcr.io/music-analysis-app/music-backend:latest
if %errorlevel% neq 0 (
    echo [ERROR] Docker push failed
    pause
    exit /b %errorlevel%
)

:: Step 6 - Deploy to Cloud Run
echo === Deploying to Cloud Run ===
gcloud run deploy music-backend ^
  --image gcr.io/music-analysis-app/music-backend:latest ^
  --region europe-west1 ^
  --min-instances 1 ^
  --timeout 3600 ^
  --cpu 1 ^
  --memory 1Gi ^
  --set-env-vars BUCKET_NAME=music_analyser_app_20010928 ^
  --allow-unauthenticated ^
  --project music-analysis-app
if %errorlevel% neq 0 (
    echo [ERROR] Cloud Run deploy failed
    pause
    exit /b %errorlevel%
)

echo === Redeploy complete ===
pause
