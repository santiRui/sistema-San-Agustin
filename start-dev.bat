@echo off
setlocal enableextensions

set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%" || (echo No se encontro la carpeta del proyecto: %SCRIPT_DIR% & pause & exit /b 1)

where node >nul 2>&1 || (
  echo No se encontro Node.js. Instalar desde https://nodejs.org/
  pause & exit /b 1
)

REM Limpiar caches (.next/.turbo) para evitar bloqueos
npm run clean >nul 2>&1

REM Usar cache fuera de OneDrive y desactivar FS cache de Next
set NEXT_DISABLE_FILE_SYSTEM_CACHE=1
set NEXT_TELEMETRY_DISABLED=1
if not defined NEXT_CACHE_DIR set NEXT_CACHE_DIR=%TEMP%\next-cache

mkdir "%NEXT_CACHE_DIR%" >nul 2>&1

echo Iniciando servidor de desarrollo sin cache de FS...
npm run dev:nocache

popd
endlocal
