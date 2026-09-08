@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set ERRORCODE=0

echo ==================================================
echo   Moeshelf - build and publish GitHub Release
echo   repo: https://github.com/RoxyGreyrat/MoeShelf
echo ==================================================
echo.

where git >nul 2>&1
if errorlevel 1 goto nogit

set VER=
for /f %%V in ('powershell -NoProfile -Command "(Get-Content package.json -Raw | ConvertFrom-Json).version"') do set VER=%%V
if "%VER%"=="" goto nover
echo [..] version: %VER%

set DIST=E:\moeshelf-release-%VER%
set ZIP=E:\Moeshelf-%VER%-windows-x64.zip
set TAG=v%VER%

if "%RELEASE_NO_BUILD%"=="1" goto skipbuild
where node >nul 2>&1
if errorlevel 1 goto nonode

echo [..] step 2/6 : npm run build
call npm run build
if errorlevel 1 goto buildfail

echo [..] step 3/6 : pack to %DIST%
if exist "%DIST%" rd /s /q "%DIST%"
node pack.js "%DIST%"
if errorlevel 1 goto packfail

echo [..] step 4/6 : create zip
powershell -NoProfile -Command "$stage='E:\Moeshelf-%VER%'; if(Test-Path $stage){Remove-Item $stage -Recurse -Force}; Copy-Item -Path '%DIST%' -Destination $stage -Recurse; Compress-Archive -Path $stage -DestinationPath '%ZIP%' -CompressionLevel Optimal -Force; Remove-Item $stage -Recurse -Force"
if errorlevel 1 goto zipfail
echo [OK] zip: %ZIP%

:skipbuild
echo [..] step 5/6 : commit and push
set MSG=release: %TAG%
git add -A
git diff --cached --quiet
if errorlevel 1 goto docommit
echo [..] nothing new to commit
goto dosync

:docommit
git commit -m "%MSG%"
if errorlevel 1 goto commitfail
echo [OK] committed: "%MSG%"

:dosync
git remote get-url origin >nul 2>&1
if errorlevel 1 goto addremote

:afterremote
git ls-remote --exit-code origin "refs/heads/main" >nul 2>&1
if errorlevel 1 goto pushonly
git pull --rebase origin main
if errorlevel 1 goto pullfail
:pushonly
git push -u origin main
if errorlevel 1 goto pushfail
echo [OK] code pushed to origin/main

git rev-parse -q --verify "refs/tags/%TAG%" >nul 2>&1
if errorlevel 1 git tag "%TAG%"
git push origin "%TAG%"
if errorlevel 1 goto pushfail
echo [OK] tag %TAG% pushed

if "%RELEASE_NO_PUBLISH%"=="1" goto manualnote
where gh >nul 2>&1
if errorlevel 1 goto nogh
if not exist "%ZIP%" goto nozip

echo [..] step 6/6 : creating GitHub Release
gh release create "%TAG%" "%ZIP%" --title "Moeshelf %VER%" --notes "Moeshelf %VER% release. See 更新日志.md for details."
if errorlevel 1 goto ghfail
echo [OK] Release: https://github.com/RoxyGreyrat/MoeShelf/releases/tag/%TAG%
goto done

:addremote
git remote add origin https://github.com/RoxyGreyrat/MoeShelf.git
echo [OK] remote origin added
goto afterremote

:manualnote
echo [OK] publish skipped by RELEASE_NO_PUBLISH
echo upload manually: https://github.com/RoxyGreyrat/MoeShelf/releases/new?tag=%TAG%
echo attach file: %ZIP%
goto done

:nogh
echo [WARN] GitHub CLI (gh) not installed - auto upload skipped.
echo one-time setup: winget install GitHub.cli
echo then: gh auth login
echo or upload manually: https://github.com/RoxyGreyrat/MoeShelf/releases/new?tag=%TAG%
echo attach file: %ZIP%
goto done

:nozip
echo [ERROR] zip not found: %ZIP%
echo run again WITHOUT RELEASE_NO_BUILD=1
set ERRORCODE=1
goto done

:nogit
echo [ERROR] git not found. Install from https://git-scm.com/
set ERRORCODE=1
goto done

:nover
echo [ERROR] cannot read version from package.json
set ERRORCODE=1
goto done

:nonode
echo [ERROR] node not found. Install Node.js 18+ from https://nodejs.org/
set ERRORCODE=1
goto done

:buildfail
echo [ERROR] npm run build failed
set ERRORCODE=1
goto done

:packfail
echo [ERROR] node pack.js failed
set ERRORCODE=1
goto done

:zipfail
echo [ERROR] creating zip failed
set ERRORCODE=1
goto done

:commitfail
echo [ERROR] git commit failed
set ERRORCODE=1
goto done

:pullfail
echo [WARN] git pull --rebase failed. Resolve manually in E:\moeshelf-src
echo git status ; fix conflicts ; then:
echo git add .
echo git rebase --continue
set ERRORCODE=1
goto done

:pushfail
echo [WARN] git push failed.
echo auth help: create token (scope repo) and use as password, user RoxyGreyrat
echo or: winget install GitHub.cli
echo then: gh auth login
set ERRORCODE=1
goto done

:ghfail
echo [WARN] gh release create failed. Create manually:
echo https://github.com/RoxyGreyrat/MoeShelf/releases/new?tag=%TAG%
set ERRORCODE=1
goto done

:done
echo.
echo Done. Exit code: %ERRORCODE%
if not "%MOESHELF_NOPAUSE%"=="1" pause
exit /b %ERRORCODE%
