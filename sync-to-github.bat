@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set ERRORCODE=0

echo ============================================
echo   Moeshelf - one-click GitHub sync
echo   repo: https://github.com/RoxyGreyrat/MoeShelf
echo ============================================
echo.

git --version >nul 2>&1
if errorlevel 1 goto nogit

REM ---- 1. remote origin ----
git remote get-url origin >nul 2>&1
if errorlevel 1 (
  git remote add origin https://github.com/RoxyGreyrat/MoeShelf.git
  echo [OK] remote origin added.
)

REM ---- 2. current branch ----
set BR=
for /f "usebackq delims=" %%B in (`git branch --show-current`) do set BR=%%B
if "%BR%"=="" goto nobranch
echo [..] branch: %BR%

REM ---- 3. author identity ----
set EM=
for /f "usebackq delims=" %%E in (`git config user.email`) do set EM=%%E
echo %EM% | findstr /i "@local" >nul && set EM=
if not "%EM%"=="" goto haveident
git config user.name "RoxyGreyrat"
if "%MOESHELF_NOPAUSE%"=="1" goto setmaildefault
set /p GH_EMAIL=Git email for commits (Enter = noreply): 
if "%GH_EMAIL%"=="" goto setmaildefault
git config user.email "%GH_EMAIL%"
echo [OK] author identity set.
goto haveident
:setmaildefault
git config user.email "RoxyGreyrat@users.noreply.github.com"
echo [OK] author identity set (noreply).
:haveident

REM ---- 4. commit ----
set MSG=%~1
if "%MSG%"=="" set MSG=update: %date% %time%
git add -A
git diff --cached --quiet
if errorlevel 1 goto docommit
echo [..] nothing to commit.
goto dopush

:docommit
git commit -m "%MSG%"
if errorlevel 1 goto commitfail
echo [OK] committed: "%MSG%"
goto dopush

REM ---- 5. push ----
:dopush
git push -u origin "%BR%"
if errorlevel 1 goto pushfail
echo [OK] pushed to origin/%BR%.
if /i "%~2"=="tag" (
  git push origin --tags
  echo [OK] tags pushed.
)
echo.
echo Done. View: https://github.com/RoxyGreyrat/MoeShelf
goto end

:nogit
echo [ERROR] git not found. Install from https://git-scm.com/
set ERRORCODE=1
goto end

:nobranch
echo [ERROR] cannot determine current git branch.
set ERRORCODE=1
goto end

:commitfail
echo [ERROR] git commit failed.
set ERRORCODE=1
goto end

:pushfail
echo.
echo [WARN] push failed. Common causes:
echo   - No authentication yet. GitHub does NOT accept passwords:
echo     create a Personal Access Token (scope: repo) and use it as the password,
echo     username: RoxyGreyrat
echo   - or run once:  winget install GitHub.cli   then   gh auth login
set ERRORCODE=1
goto end

:end
if not "%MOESHELF_NOPAUSE%"=="1" pause
exit /b %ERRORCODE%
